import { GoogleGenerativeAI } from '@google/generative-ai';
import { synthClient } from 'workflow-engine';
export { parseWorkflowRequests, stripWorkflowTags, workflowEngine } from 'workflow-engine';
export { getPreset, searchPresets, applyPreset, getCategories, getPresetsByCategory, listPresetsCompact } from 'workflow-engine';
export { getTemplate, listTemplates, buildWorkflow, listTemplatesForPrompt, listStylesForPrompt } from 'workflow-engine';

/**
 * Unified Tools Service
 * Handles web search (Google Search grounding) and URL context capabilities
 * Follows the same tag-based pattern as image generation
 */

const TOOL_MODEL = 'gemini-3.1-pro-preview-customtools';

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

// ============================================================================
// SYNTH_* TAG PARSING (Synthograsizer integration)
// ============================================================================

/**
 * Parse pipe-separated options string into a key=value object.
 * First segment is always the primary value (prompt/id/etc.).
 * Remaining segments are parsed as key=value pairs if they contain "=",
 * or are ignored if they don't.
 *
 * Example: "a forest at night | aspect_ratio=16:9 | num_images=2"
 * → { _primary: "a forest at night", aspect_ratio: "16:9", num_images: "2" }
 */
function parsePipeOptions(raw) {
  const parts = raw.split('|').map(s => s.trim());
  const result = { _primary: parts[0] };
  for (let i = 1; i < parts.length; i++) {
    const eqIdx = parts[i].indexOf('=');
    if (eqIdx !== -1) {
      const key = parts[i].slice(0, eqIdx).trim();
      const val = parts[i].slice(eqIdx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

/**
 * Parse agent response text for SYNTH_* tool tags.
 * Supported tags:
 *   [SYNTH_IMAGE: prompt | option=value ...]
 *   [SYNTH_VIDEO: prompt | option=value ...]
 *   [SYNTH_TEMPLATE: description | mode=story]
 *   [SYNTH_STORY: description]                  (shorthand for mode=story)
 *   [SYNTH_REMIX_TEMPLATE: template_id | instructions]
 *   [SYNTH_NARRATIVE: desc1 | desc2 | mode=dream]
 *   [SYNTH_TRANSFORM: image_id | intent]
 *   [SYNTH_ANALYZE: image_id]
 *
 * @param {string} text
 * @returns {Array} parsed request objects
 */
export function parseSynthRequests(text) {
  const requests = [];

  const tagPatterns = [
    { tag: 'SYNTH_IMAGE',          type: 'synth_image' },
    { tag: 'SYNTH_VIDEO',          type: 'synth_video' },
    { tag: 'SYNTH_TEMPLATE',       type: 'synth_template' },
    { tag: 'SYNTH_STORY',          type: 'synth_story' },
    { tag: 'SYNTH_REMIX_TEMPLATE', type: 'synth_remix_template' },
    { tag: 'SYNTH_NARRATIVE',      type: 'synth_narrative' },
    { tag: 'SYNTH_TRANSFORM',      type: 'synth_transform' },
    { tag: 'SYNTH_ANALYZE',        type: 'synth_analyze' },
  ];

  for (const { tag, type } of tagPatterns) {
    const pattern = new RegExp(`\\[${tag}:\\s*([\\s\\S]+?)\\]`, 'gi');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1].trim().replace(/\s*\n\s*/g, ' ');
      const parsed = parsePipeOptions(raw);
      requests.push({ type, fullMatch: match[0], parsed });
    }
  }

  return requests;
}

/**
 * Strip SYNTH_* tags from text.
 * @param {string} text
 * @returns {string}
 */
export function stripSynthTags(text) {
  const tags = [
    'SYNTH_IMAGE', 'SYNTH_VIDEO', 'SYNTH_TEMPLATE', 'SYNTH_STORY',
    'SYNTH_REMIX_TEMPLATE', 'SYNTH_NARRATIVE', 'SYNTH_TRANSFORM', 'SYNTH_ANALYZE',
  ];
  let cleaned = text;
  for (const tag of tags) {
    cleaned = cleaned.replace(new RegExp(`\\[${tag}:\\s*[\\s\\S]+?\\]`, 'gi'), '');
  }
  return cleaned.trim();
}

/**
 * Execute parsed SYNTH_* requests against the Synthograsizer API.
 * Returns an array of result objects with type + outcome fields.
 * @param {Array} requests  output of parseSynthRequests()
 * @param {Function} [getMediaById]  optional lookup fn(id) → {data, mimeType}
 * @returns {Promise<Array>}
 */
export async function executeSynthRequests(requests, getMediaById = null) {
  const results = [];

  for (const req of requests) {
    const { type, parsed } = req;
    try {
      let result;

      switch (type) {
        case 'synth_image': {
          const { _primary: prompt, ...opts } = parsed;
          result = await synthClient.generateImage(prompt, opts);
          results.push({ type, fullMatch: req.fullMatch, prompt, ...result, mediaType: 'image' });
          break;
        }

        case 'synth_video': {
          const { _primary: prompt, ...opts } = parsed;
          result = await synthClient.generateVideo(prompt, opts);
          results.push({ type, fullMatch: req.fullMatch, prompt, ...result, mediaType: 'video' });
          break;
        }

        case 'synth_template': {
          const { _primary: description, mode = 'text' } = parsed;
          result = await synthClient.generateTemplate(description, mode);
          results.push({ type, fullMatch: req.fullMatch, description, mode, ...result });
          break;
        }

        case 'synth_story': {
          const { _primary: description } = parsed;
          result = await synthClient.generateTemplate(description, 'story');
          results.push({ type, fullMatch: req.fullMatch, description, mode: 'story', ...result });
          break;
        }

        case 'synth_remix_template': {
          // parsed._primary = template_id or JSON string, second segment = instructions
          const parts = req.fullMatch
            .replace(/^\[SYNTH_REMIX_TEMPLATE:\s*/i, '')
            .replace(/\]$/, '')
            .split('|');
          const templateRef = parts[0]?.trim() || '';
          const instructions = parts.slice(1).join('|').trim();
          // If templateRef looks like JSON, parse it; otherwise pass as-is
          let template = templateRef;
          try { template = JSON.parse(templateRef); } catch (_) { /* keep as string */ }
          result = await synthClient.remixTemplate(template, instructions);
          results.push({ type, fullMatch: req.fullMatch, instructions, ...result });
          break;
        }

        case 'synth_narrative': {
          // All pipe segments except the last "mode=x" are descriptions
          const { mode = 'story', ...rest } = parsed;
          const descriptions = Object.entries(rest)
            .filter(([k]) => k !== '_primary' && !k.includes('='))
            .map(([, v]) => v);
          descriptions.unshift(parsed._primary);
          result = await synthClient.generateNarrative(descriptions, mode);
          results.push({ type, fullMatch: req.fullMatch, descriptions, mode, ...result });
          break;
        }

        case 'synth_transform': {
          const parts = req.fullMatch
            .replace(/^\[SYNTH_TRANSFORM:\s*/i, '')
            .replace(/\]$/, '')
            .split('|');
          const imageRef = parts[0]?.trim();
          const intent = parts.slice(1).join('|').trim();
          // Resolve image_id → base64 via optional lookup
          let imageBase64 = imageRef;
          if (getMediaById) {
            const media = getMediaById(imageRef);
            if (media?.data) imageBase64 = media.data;
          }
          result = await synthClient.smartTransform(imageBase64, intent);
          results.push({ type, fullMatch: req.fullMatch, intent, ...result, mediaType: 'image' });
          break;
        }

        case 'synth_analyze': {
          const imageRef = parsed._primary;
          let imageBase64 = imageRef;
          if (getMediaById) {
            const media = getMediaById(imageRef);
            if (media?.data) imageBase64 = media.data;
          }
          result = await synthClient.analyzeImage(imageBase64);
          results.push({ type, fullMatch: req.fullMatch, imageRef, ...result });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      results.push({ type, fullMatch: req.fullMatch, error: err.message });
    }
  }

  return results;
}

/**
 * Format SYNTH_* results for display / transcript inclusion.
 * Returns lightweight summaries — full media data is stored separately.
 * @param {Array} results  output of executeSynthRequests()
 * @returns {Array}
 */
export function formatSynthResults(results) {
  return results.map(r => {
    if (r.error) {
      return { type: r.type, error: r.error };
    }
    switch (r.type) {
      case 'synth_image':
        return { type: r.type, prompt: r.prompt, hasImage: !!r.image, mediaType: 'image' };
      case 'synth_video':
        return { type: r.type, prompt: r.prompt, hasVideo: !!r.video, mediaType: 'video' };
      case 'synth_template':
      case 'synth_story':
        return { type: r.type, description: r.description, mode: r.mode, template: r.template };
      case 'synth_remix_template':
        return { type: r.type, instructions: r.instructions, template: r.template };
      case 'synth_narrative':
        return { type: r.type, descriptions: r.descriptions, mode: r.mode, prompts: r.prompts };
      case 'synth_transform':
        return { type: r.type, intent: r.intent, hasImage: !!r.image, mediaType: 'image' };
      case 'synth_analyze':
        return { type: r.type, imageRef: r.imageRef, analysis: r.analysis };
      default:
        return r;
    }
  });
}

// ============================================================================
// SYNTH_STYLE & WORKFLOW_TEMPLATE TAG PARSING
// ============================================================================

import { getPreset, applyPreset } from 'workflow-engine';
import { buildWorkflow } from 'workflow-engine';

/**
 * Parse [SYNTH_STYLE: subject | style=oil_painting] tags.
 * Returns params suitable for image generation with a style preset applied.
 * @param {string} text
 * @returns {Array<{ fullMatch, subject, styleId, applied }>}
 */
export function parseSynthStyleRequests(text) {
  const results = [];
  const pattern = /\[SYNTH_STYLE:\s*([\s\S]+?)\]/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1].trim().replace(/\s*\n\s*/g, ' ');
    const parsed = parsePipeOptions(raw);
    const subject = parsed._primary;
    const styleId = parsed.style || 'oil_painting';
    const preset = getPreset(styleId);

    if (!preset) {
      results.push({ fullMatch: match[0], subject, styleId, error: `Unknown style: ${styleId}` });
      continue;
    }

    const applied = applyPreset(preset, subject);
    results.push({ fullMatch: match[0], subject, styleId, applied, presetName: preset.name });
  }

  return results;
}

/**
 * Parse [WORKFLOW_TEMPLATE: template_id | param=value | ...] tags.
 * Returns params to build and submit a named workflow template.
 * @param {string} text
 * @returns {Array<{ fullMatch, templateId, params, definition?, error? }>}
 */
export function parseWorkflowTemplateRequests(text) {
  const results = [];
  const pattern = /\[WORKFLOW_TEMPLATE:\s*([\s\S]+?)\]/gi;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1].trim().replace(/\s*\n\s*/g, ' ');
    const parsed = parsePipeOptions(raw);
    const templateId = parsed._primary;
    const { _primary, ...params } = parsed;

    // Handle array-like params: transforms=a,b,c → transforms: ['a','b','c']
    // and styles=a,b,c → styles: ['a','b','c']
    for (const key of ['transforms', 'styles']) {
      if (typeof params[key] === 'string' && params[key].includes(',')) {
        params[key] = params[key].split(',').map(s => s.trim());
      }
    }

    // Parse boolean-like params
    for (const key of ['refine']) {
      if (params[key] === 'true') params[key] = true;
      else if (params[key] === 'false') params[key] = false;
    }

    // Parse numeric params
    for (const key of ['image_count']) {
      if (params[key] !== undefined) params[key] = Number(params[key]);
    }

    try {
      const definition = buildWorkflow(templateId, params);
      results.push({ fullMatch: match[0], templateId, params, definition });
    } catch (err) {
      results.push({ fullMatch: match[0], templateId, params, error: err.message });
    }
  }

  return results;
}

/**
 * Strip SYNTH_STYLE and WORKFLOW_TEMPLATE tags from text.
 * @param {string} text
 * @returns {string}
 */
export function stripStyleAndTemplateTags(text) {
  return text
    .replace(/\[SYNTH_STYLE:\s*[\s\S]+?\]/gi, '')
    .replace(/\[WORKFLOW_TEMPLATE:\s*[\s\S]+?\]/gi, '')
    .trim();
}
