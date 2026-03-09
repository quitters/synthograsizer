import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Unified Tools Service
 * Handles web search (Google Search grounding) and URL context capabilities
 * Follows the same tag-based pattern as image generation
 */

const TOOL_MODEL = 'gemini-3-flash-preview';

let genAI = null;

export function initializeTools(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

// ============================================================================
// WEB SEARCH (Google Search Grounding)
// ============================================================================

/**
 * Perform a web search using Gemini's Google Search grounding
 * @param {string} query - The search query
 * @returns {Promise<{text: string, sources: Array, searchQueries: Array}>}
 */
export async function webSearch(query) {
  if (!genAI) {
    throw new Error('Tools not initialized');
  }

  const model = genAI.getGenerativeModel({
    model: TOOL_MODEL,
    tools: [{ googleSearch: {} }],
  });

  try {
    const result = await model.generateContent(query);
    const response = result.response;
    const text = response.text();

    // Extract grounding metadata
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const sources = extractSources(groundingMetadata);
    const searchQueries = groundingMetadata?.webSearchQueries || [];

    return {
      text,
      sources,
      searchQueries,
      rawMetadata: groundingMetadata
    };
  } catch (error) {
    console.error('Web search error:', error);
    throw error;
  }
}

/**
 * Extract and format sources from grounding metadata
 */
function extractSources(groundingMetadata) {
  if (!groundingMetadata) return [];

  const chunks = groundingMetadata.groundingChunks || [];
  const supports = groundingMetadata.groundingSupports || [];

  // Build source list from chunks
  const sources = chunks.map((chunk, index) => ({
    index: index + 1,
    title: chunk.web?.title || 'Unknown',
    uri: chunk.web?.uri || '',
  })).filter(s => s.uri);

  return sources;
}

/**
 * Add inline citations to text based on grounding metadata
 */
export function addCitations(text, groundingMetadata) {
  if (!groundingMetadata) return text;

  const supports = groundingMetadata.groundingSupports || [];
  const chunks = groundingMetadata.groundingChunks || [];

  if (!supports.length || !chunks.length) return text;

  // Sort by end index descending to insert from end
  const sortedSupports = [...supports].sort(
    (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0)
  );

  let citedText = text;

  for (const support of sortedSupports) {
    const endIndex = support.segment?.endIndex;
    if (endIndex === undefined || !support.groundingChunkIndices?.length) {
      continue;
    }

    const citationLinks = support.groundingChunkIndices
      .map(i => {
        const uri = chunks[i]?.web?.uri;
        const title = chunks[i]?.web?.title || `Source ${i + 1}`;
        if (uri) {
          return `[${i + 1}]`;
        }
        return null;
      })
      .filter(Boolean);

    if (citationLinks.length > 0) {
      const citationString = ` ${citationLinks.join('')}`;
      citedText = citedText.slice(0, endIndex) + citationString + citedText.slice(endIndex);
    }
  }

  return citedText;
}

// ============================================================================
// URL CONTEXT (Document/Webpage Analysis)
// ============================================================================

/**
 * Analyze content from a URL using Gemini's URL context tool
 * @param {string} url - The URL to analyze
 * @param {string} prompt - What to analyze about the content
 * @returns {Promise<{text: string, urlMetadata: Object}>}
 */
export async function analyzeUrl(url, prompt = 'Summarize the key information from this URL.') {
  if (!genAI) {
    throw new Error('Tools not initialized');
  }

  const model = genAI.getGenerativeModel({
    model: TOOL_MODEL,
    tools: [{ urlContext: {} }],
  });

  try {
    const fullPrompt = `${prompt}\n\nURL: ${url}`;
    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const text = response.text();

    // Extract URL context metadata
    const urlMetadata = response.candidates?.[0]?.urlContextMetadata;

    return {
      text,
      url,
      urlMetadata
    };
  } catch (error) {
    console.error('URL analysis error:', error);
    throw error;
  }
}

/**
 * Analyze multiple URLs together
 * @param {Array<string>} urls - URLs to analyze
 * @param {string} prompt - Analysis prompt
 * @returns {Promise<{text: string, urlMetadata: Object}>}
 */
export async function analyzeMultipleUrls(urls, prompt) {
  if (!genAI) {
    throw new Error('Tools not initialized');
  }

  const model = genAI.getGenerativeModel({
    model: TOOL_MODEL,
    tools: [{ urlContext: {} }],
  });

  try {
    const urlList = urls.map((url, i) => `URL ${i + 1}: ${url}`).join('\n');
    const fullPrompt = `${prompt}\n\n${urlList}`;

    const result = await model.generateContent(fullPrompt);
    const response = result.response;

    return {
      text: response.text(),
      urls,
      urlMetadata: response.candidates?.[0]?.urlContextMetadata
    };
  } catch (error) {
    console.error('Multi-URL analysis error:', error);
    throw error;
  }
}

// ============================================================================
// COMBINED SEARCH + URL CONTEXT
// ============================================================================

/**
 * Perform research combining web search and URL analysis
 * @param {string} query - Research query
 * @returns {Promise<{text: string, sources: Array, urlMetadata: Object}>}
 */
export async function research(query) {
  if (!genAI) {
    throw new Error('Tools not initialized');
  }

  const model = genAI.getGenerativeModel({
    model: TOOL_MODEL,
    tools: [
      { googleSearch: {} },
      { urlContext: {} }
    ],
  });

  try {
    const result = await model.generateContent(query);
    const response = result.response;

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const urlMetadata = response.candidates?.[0]?.urlContextMetadata;

    return {
      text: response.text(),
      sources: extractSources(groundingMetadata),
      searchQueries: groundingMetadata?.webSearchQueries || [],
      urlMetadata,
      rawMetadata: { groundingMetadata, urlMetadata }
    };
  } catch (error) {
    console.error('Research error:', error);
    throw error;
  }
}

// ============================================================================
// TAG PARSING (for agent responses)
// ============================================================================

/**
 * Parse agent response for tool requests
 * Looks for tags like [SEARCH: query], [ANALYZE_URL: url], [RESEARCH: topic]
 * Uses [\s\S]+? instead of .+? to match content that spans multiple lines
 */
export function parseToolRequests(text) {
  const requests = [];

  // Web search patterns
  const searchPatterns = [
    /\[SEARCH:\s*([\s\S]+?)\]/gi,
    /\[WEB_SEARCH:\s*([\s\S]+?)\]/gi,
    /\[GOOGLE:\s*([\s\S]+?)\]/gi,
  ];

  for (const pattern of searchPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      requests.push({
        type: 'search',
        fullMatch: match[0],
        query: match[1].trim().replace(/\s*\n\s*/g, ' ')
      });
    }
  }

  // URL analysis patterns
  const urlPatterns = [
    /\[ANALYZE_URL:\s*([\s\S]+?)\]/gi,
    /\[URL:\s*([\s\S]+?)\]/gi,
    /\[FETCH:\s*([\s\S]+?)\]/gi,
    /\[READ_URL:\s*([\s\S]+?)\]/gi,
  ];

  for (const pattern of urlPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      requests.push({
        type: 'url',
        fullMatch: match[0],
        url: match[1].trim().replace(/\s*\n\s*/g, ' ')
      });
    }
  }

  // Research patterns (combined search + url context)
  const researchPatterns = [
    /\[RESEARCH:\s*([\s\S]+?)\]/gi,
    /\[DEEP_SEARCH:\s*([\s\S]+?)\]/gi,
  ];

  for (const pattern of researchPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      requests.push({
        type: 'research',
        fullMatch: match[0],
        query: match[1].trim().replace(/\s*\n\s*/g, ' ')
      });
    }
  }

  return requests;
}

/**
 * Remove tool request tags from text
 * Uses [\s\S]+? to match tags that span multiple lines
 */
export function stripToolTags(text) {
  const patterns = [
    /\[SEARCH:\s*[\s\S]+?\]/gi,
    /\[WEB_SEARCH:\s*[\s\S]+?\]/gi,
    /\[GOOGLE:\s*[\s\S]+?\]/gi,
    /\[ANALYZE_URL:\s*[\s\S]+?\]/gi,
    /\[URL:\s*[\s\S]+?\]/gi,
    /\[FETCH:\s*[\s\S]+?\]/gi,
    /\[READ_URL:\s*[\s\S]+?\]/gi,
    /\[RESEARCH:\s*[\s\S]+?\]/gi,
    /\[DEEP_SEARCH:\s*[\s\S]+?\]/gi,
  ];

  let cleaned = text;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * Execute all tool requests found in text
 * @param {Array} requests - Parsed tool requests
 * @returns {Promise<Array>} - Results for each request
 */
export async function executeToolRequests(requests) {
  const results = [];

  for (const request of requests) {
    try {
      let result;

      switch (request.type) {
        case 'search':
          result = await webSearch(request.query);
          results.push({
            type: 'search',
            query: request.query,
            fullMatch: request.fullMatch,
            ...result
          });
          break;

        case 'url':
          result = await analyzeUrl(request.url);
          results.push({
            type: 'url',
            url: request.url,
            fullMatch: request.fullMatch,
            ...result
          });
          break;

        case 'research':
          result = await research(request.query);
          results.push({
            type: 'research',
            query: request.query,
            fullMatch: request.fullMatch,
            ...result
          });
          break;
      }
    } catch (error) {
      results.push({
        type: request.type,
        query: request.query || request.url,
        fullMatch: request.fullMatch,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Format tool results for display in chat
 */
export function formatToolResults(results) {
  return results.map(result => {
    if (result.error) {
      return {
        type: result.type,
        query: result.query || result.url,
        error: result.error
      };
    }

    switch (result.type) {
      case 'search':
        return {
          type: 'search',
          query: result.query,
          summary: result.text,
          sources: result.sources,
          searchQueries: result.searchQueries
        };

      case 'url':
        return {
          type: 'url',
          url: result.url,
          summary: result.text
        };

      case 'research':
        return {
          type: 'research',
          query: result.query,
          summary: result.text,
          sources: result.sources
        };

      default:
        return result;
    }
  });
}
