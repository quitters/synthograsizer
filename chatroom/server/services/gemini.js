import { GoogleGenerativeAI } from '@google/generative-ai';
import { countTokens } from '../utils/tokenCounter.js';
import { synthClient } from './synthClient.js';
import { listPresetsCompact } from './stylePresets.js';
import { listTemplatesForPrompt } from './workflowTemplates.js';

// Use Gemini 3 Pro Preview
const MODEL_NAME = 'gemini-3-pro-preview';

// Max attempts to continue a truncated response
const MAX_CONTINUATION_ATTEMPTS = 2;

let genAI = null;

export function initializeGemini(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

/**
 * Clean up response text - remove any accidental name prefixes
 */
function cleanResponse(text, agentName) {
  if (!text) return text;

  let cleaned = text.trim();

  // Remove common prefix patterns the model might add
  // Be careful not to be too aggressive - only remove obvious name prefixes
  const patterns = [
    new RegExp(`^\\[?${escapeRegex(agentName)}\\]?:\\s*`, 'i'),
    new RegExp(`^${escapeRegex(agentName)}:\\s*`, 'i'),
    new RegExp(`^\\*\\*${escapeRegex(agentName)}\\*\\*:\\s*`, 'i'),
    /^\[[\w\s.'-]+\]:\s*/,  // [Name]: prefix
  ];

  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the system prompt for an agent.
 * Tool instructions are only included when tools are available.
 * Async: checks Synthograsizer health once to decide whether to include SYNTH_* tools.
 */
async function buildSystemPrompt(agent, allAgents, goal, options = {}) {
  const { enableTools = true } = options;

  // Check Synthograsizer availability (uses 30 s cache, never throws)
  let synthAvailable = false;
  if (enableTools) {
    try {
      const health = await synthClient.healthCheck();
      synthAvailable = health?.status === 'ok';
    } catch (_) {
      synthAvailable = false;
    }
  }

  const otherAgents = allAgents
    .filter(a => a.id !== agent.id)
    .map(a => `- ${a.name}`)
    .join('\n');

  let prompt = `You are roleplaying as ${agent.name} in a collaborative ideation panel discussion.

YOUR CHARACTER BIO AND INSTRUCTIONS:
${agent.bio}

THE SHARED GOAL FOR THIS SESSION:
${goal}

OTHER PANELISTS (you are NOT these people - they will speak for themselves):
${otherAgents}

CRITICAL RULES:
1. You are ONLY ${agent.name}. NEVER write dialogue or responses for other panelists.
2. Do NOT prefix your response with your name or any name tag like "[${agent.name}]:" - just speak directly.
3. Do NOT simulate a multi-person conversation. Write ONLY your single response.
4. Keep responses focused and concise (2-4 paragraphs). Always complete your thought - never stop mid-sentence.
5. Respond naturally to what others have said - build on, challenge, or refine ideas.
6. Address other panelists by name when responding to their points.
7. Stay in character. Do not mention being an AI or break the fourth wall.`;

  if (enableTools) {
    prompt += `

TOOLS (use sparingly, only when they add value):
- Image: [IMAGE: detailed description] - Generate a visual
- Remix: [REMIX: imageId | changes] - Iterate on a previous image
- Search: [SEARCH: query] - Search the web for current info
- URL: [ANALYZE_URL: url] - Analyze a webpage
- Research: [RESEARCH: topic] - Deep research combining search + analysis`;

    if (synthAvailable) {
      prompt += `

SYNTHOGRASIZER TOOLS (generative AI pipeline — use when producing creative media or templates):
- Generate image:    [SYNTH_IMAGE: prompt | aspect_ratio=16:9 | negative_prompt=blurry | num_images=1]
- Generate video:    [SYNTH_VIDEO: prompt | aspect_ratio=16:9 | duration=5]
- Generate template: [SYNTH_TEMPLATE: description | mode=text]  (modes: text|image|hybrid|story|workflow)
- Story template:    [SYNTH_STORY: story concept description]
- Remix template:    [SYNTH_REMIX_TEMPLATE: {template JSON or id} | instructions for changes]
- Narrative prompts: [SYNTH_NARRATIVE: scene 1 | scene 2 | scene 3 | mode=story]  (modes: story|documentary|abstract|dream)
- Transform image:   [SYNTH_TRANSFORM: imageId | intent description]
- Analyze image:     [SYNTH_ANALYZE: imageId]
Pipe-separate options: key=value after the primary content.

Workflow step types also include:
- synth_text: freeform LLM generation — params: { prompt }. Result: { text }
- synth_fetch: fetch external URL data — params: { url, format=text|json, selector? }. Result: { text, data }. Use for real-world data (weather, APIs, RSS feeds) as creative input.

WORKFLOW TOOLS (multi-step creative pipelines — use to plan and execute a full sequence of generation steps):
- Submit workflow: [WORKFLOW: { "name": "...", "steps": [...] }]
- Check status:   [WORKFLOW_STATUS: workflow_id]
- Cancel:         [WORKFLOW_CANCEL: workflow_id]

Workflow step types match the SYNTH_* tools above (synth_image, synth_video, synth_template, synth_story, synth_narrative, synth_analyze, synth_transform).
Each step has: id (unique string), type, params (object), dependsOn (array of step ids, optional).
Steps without dependsOn run in the first wave; steps in the same wave run in parallel.
Use {{stepId.field}} in params to reference output fields from a completed dependency step.

Example workflow:
[WORKFLOW: {
  "name": "Dreamscape Series",
  "steps": [
    { "id": "tpl", "type": "synth_template", "params": { "description": "ethereal dreamscape", "mode": "story" } },
    { "id": "img1", "type": "synth_image", "params": { "prompt": "{{tpl.promptTemplate}}" }, "dependsOn": ["tpl"] },
    { "id": "img2", "type": "synth_image", "params": { "prompt": "{{tpl.promptTemplate}} at sunset" }, "dependsOn": ["tpl"] },
    { "id": "analyze", "type": "synth_analyze", "params": { "image_id": "{{img1.mediaId}}" }, "dependsOn": ["img1"] },
    { "id": "narr", "type": "synth_narrative", "params": { "descriptions": ["{{analyze.description}}", "dream sequence"], "mode": "dream" }, "dependsOn": ["analyze"] }
  ]
}]

Workflows execute in the background — the conversation continues while they run. Progress events are broadcast to the UI.

STYLE PRESETS (use with SYNTH_STYLE for one-shot styled image generation):
- Style transfer: [SYNTH_STYLE: subject description | style=preset_id]
  Example: [SYNTH_STYLE: a fox in deep snow | style=ukiyo_e]

Available style presets by category:
${listPresetsCompact()}

WORKFLOW TEMPLATES (pre-built named workflows — shorthand for common multi-step pipelines):
- Invoke template: [WORKFLOW_TEMPLATE: template_id | param=value | ...]
  Example: [WORKFLOW_TEMPLATE: style_transfer | subject=a cathedral at dusk | style=oil_painting | refine=true]
  Example: [WORKFLOW_TEMPLATE: refinement_loop | prompt=ethereal forest with bioluminescent mushrooms]
  Example: [WORKFLOW_TEMPLATE: style_comparison | subject=a red fox | styles=oil_painting,glitch,ukiyo_e,claymation]
  Example: [WORKFLOW_TEMPLATE: narrative_dreamscape | concept=abandoned space station | image_count=4]
  Example: [WORKFLOW_TEMPLATE: progressive_transform | prompt=a serene lake | transforms=add storm clouds,make it night,add aurora borealis]
  Example: [WORKFLOW_TEMPLATE: img_to_video | prompt=a lonely lighthouse at night | cinematic_style=noir | duration=8]
  Example: [WORKFLOW_TEMPLATE: memory_visualization | memory=summer afternoons at grandmother's garden | life_stage=childhood | degradation_depth=4]
  Example: [WORKFLOW_TEMPLATE: multi_image_composite | subjects=a samurai,a robot,a wizard | scene=playing poker in a smoky saloon]
  Example: [WORKFLOW_TEMPLATE: branching_narrative | theme=deep sea mystery | scenario=you wake up in a submarine | endings=4]
  Example: [WORKFLOW_TEMPLATE: cinematic_short | concept=the last robot discovers a flower | mood=melancholic | scene_count=4]

Available templates:
${listTemplatesForPrompt()}`;
    }
  }

  prompt += `

ENDING THE CONVERSATION:
When the goal is achieved, say "[CONSENSUS REACHED]" in your message.

Remember: Write ONLY ${agent.name}'s response. One voice. One perspective.`;

  return prompt;
}

/**
 * Build conversation transcript with sliding window
 * Keeps recent messages in full, summarizes older ones to control input size
 */
function buildConversationPrompt(messages, goal, agentName) {
  if (messages.length === 0) {
    return `The discussion is just beginning. The shared goal is: ${goal}

Please provide your opening statement to kick off the discussion. Remember, write ONLY your response - do not simulate other participants.`;
  }

  // Sliding window: keep last 15 messages in full, summarize older ones
  const WINDOW_SIZE = 15;
  const recentMessages = messages.slice(-WINDOW_SIZE);
  const olderMessages = messages.length > WINDOW_SIZE ? messages.slice(0, -WINDOW_SIZE) : [];

  let transcript = `CONVERSATION TRANSCRIPT:\n`;
  transcript += `========================================\n`;

  // Summarize older messages if any
  if (olderMessages.length > 0) {
    transcript += `[Earlier discussion - ${olderMessages.length} messages summarized]\n`;
    // Group by speaker and note their key contributions
    const speakerSummaries = {};
    for (const msg of olderMessages) {
      if (!speakerSummaries[msg.agentName]) {
        speakerSummaries[msg.agentName] = [];
      }
      // Take first 80 chars of each older message as a brief note
      const brief = (msg.content || '').slice(0, 80).replace(/\n/g, ' ');
      speakerSummaries[msg.agentName].push(brief);
    }
    for (const [name, briefs] of Object.entries(speakerSummaries)) {
      transcript += `  ${name} discussed: ${briefs.map(b => b + '...').join('; ')}\n`;
    }
    transcript += `\n`;
  }

  // Full recent messages
  for (const msg of recentMessages) {
    transcript += `[${msg.agentName}]: ${msg.content}`;
    // Note if the message included images - include IDs for remix capability
    if (msg.images && msg.images.length > 0) {
      for (const img of msg.images) {
        transcript += `\n  [Image generated - ID: ${img.id} | Prompt: "${img.prompt || img.caption}"]`;
        if (img.referenceId) {
          transcript += ` (remixed from ${img.referenceId})`;
        }
      }
    }
    // Note if the message included tool results
    if (msg.toolResults && msg.toolResults.length > 0) {
      for (const result of msg.toolResults) {
        if (result.type === 'search') {
          transcript += `\n  [Web search for "${result.query}" returned: ${result.summary?.slice(0, 200)}...]`;
          if (result.sources && result.sources.length > 0) {
            transcript += `\n  [Sources: ${result.sources.map(s => s.title).join(', ')}]`;
          }
        } else if (result.type === 'url') {
          transcript += `\n  [URL analysis of ${result.url}: ${result.summary?.slice(0, 200)}...]`;
        } else if (result.type === 'research') {
          transcript += `\n  [Research on "${result.query}": ${result.summary?.slice(0, 200)}...]`;
        }
      }
    }
    transcript += `\n\n`;
  }

  transcript += `========================================\n\n`;
  transcript += `Now it's YOUR turn to respond as ${agentName}.\n`;
  transcript += `Write ONLY your response. Do NOT include a name prefix. Do NOT write responses for other panelists.\n`;
  transcript += `Engage with what was said above and contribute your unique perspective. Complete your full thought.`;

  return transcript;
}

/**
 * Extract finish reason from Gemini streaming result
 */
async function getFinishReason(streamResult) {
  try {
    const response = await streamResult.response;
    return response.candidates?.[0]?.finishReason || 'UNKNOWN';
  } catch {
    return 'ERROR';
  }
}

/**
 * Check if a MIME type is a visual/image type that Gemini can view inline
 */
function isVisualMedia(mimeType) {
  return mimeType && (
    mimeType.startsWith('image/') ||
    mimeType === 'video/mp4' ||
    mimeType === 'video/webm'
  );
}

/**
 * Check if a MIME type is a text-based file that can be included as text content
 */
function isTextMedia(mimeType) {
  return mimeType && (
    mimeType === 'application/json' ||
    mimeType === 'text/plain' ||
    mimeType === 'text/csv' ||
    mimeType === 'text/html' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/xml' ||
    mimeType === 'application/xml' ||
    mimeType === 'text/css' ||
    mimeType === 'text/javascript' ||
    mimeType === 'application/javascript'
  );
}

/**
 * Build multipart content parts for Gemini API including session media
 * Returns an array of content parts: text parts + inline media
 */
function buildContentParts(promptText, sessionMedia = []) {
  const parts = [];

  if (sessionMedia.length > 0) {
    // Add a text preface about the uploaded media
    let mediaPreface = `\nSESSION REFERENCE MATERIALS (${sessionMedia.length} files uploaded by the user):\n`;

    for (const media of sessionMedia) {
      if (isVisualMedia(media.mimeType)) {
        // Add description text
        mediaPreface += `- [Image/Media: "${media.name}" - ID: ${media.id}] (attached below, can be remixed with [REMIX: ${media.id} | changes])\n`;
      } else if (isTextMedia(media.mimeType)) {
        // Decode and include text content inline
        try {
          const textContent = Buffer.from(media.data, 'base64').toString('utf-8');
          // Truncate very large text files
          const maxTextLen = 5000;
          const truncated = textContent.length > maxTextLen
            ? textContent.slice(0, maxTextLen) + `\n... [truncated, ${textContent.length} chars total]`
            : textContent;
          mediaPreface += `- [File: "${media.name}" (${media.mimeType})]:\n\`\`\`\n${truncated}\n\`\`\`\n`;
        } catch {
          mediaPreface += `- [File: "${media.name}" - could not decode]\n`;
        }
      } else if (media.mimeType === 'application/pdf') {
        mediaPreface += `- [PDF: "${media.name}" - ID: ${media.id}] (attached below)\n`;
      } else {
        mediaPreface += `- [File: "${media.name}" (${media.mimeType}) - ID: ${media.id}]\n`;
      }
    }

    mediaPreface += `\nYou may reference, analyze, critique, or remix these materials in your response.\n`;

    // Add the preface + main prompt as text
    parts.push({ text: mediaPreface + '\n' + promptText });

    // Add visual media as inlineData parts
    for (const media of sessionMedia) {
      if (isVisualMedia(media.mimeType) || media.mimeType === 'application/pdf') {
        parts.push({
          inlineData: {
            mimeType: media.mimeType,
            data: media.data
          }
        });
      }
    }
  } else {
    // No session media, just text
    parts.push({ text: promptText });
  }

  return parts;
}

/**
 * Generate a streaming response from an agent
 * Includes truncation detection, auto-continuation, and session media support
 */
export async function* generateAgentResponse(agent, allAgents, messages, goal, sessionMedia = []) {
  if (!genAI) {
    throw new Error('Gemini not initialized. Call initializeGemini first.');
  }

  const systemPrompt = await buildSystemPrompt(agent, allAgents, goal);

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 1.0, // Gemini 3 recommends 1.0
    },
  });

  // Build the full prompt with conversation history
  const promptText = buildConversationPrompt(messages, goal, agent.name);

  // Only include session media on the first turn to avoid sending large payloads every turn
  // After the first turn, media context is carried via transcript references
  const includeMedia = messages.length === 0 || messages.length <= 2;
  const contentParts = buildContentParts(promptText, includeMedia ? sessionMedia : []);

  // For text files that were included inline, add a note to later turns too
  const hasTextMedia = sessionMedia.some(m => isTextMedia(m.mimeType));
  if (!includeMedia && sessionMedia.length > 0) {
    // Remind agents about available media without re-sending the data
    const mediaReminder = `\n[Note: ${sessionMedia.length} reference file(s) were provided at session start: ${sessionMedia.map(m => m.name).join(', ')}. Refer to them by name or ID if needed.]\n`;
    contentParts[0].text = mediaReminder + contentParts[0].text;
  }

  try {
    let fullResponse = '';
    let continuationAttempts = 0;
    let currentParts = contentParts;
    let wasTruncated = false;

    // Initial generation + continuation loop
    while (continuationAttempts <= MAX_CONTINUATION_ATTEMPTS) {
      const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: currentParts }]
      });

      let chunkText = '';
      let streamError = null;
      try {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            chunkText += text;
            fullResponse += text;
            yield { type: 'chunk', text };
          }
        }
      } catch (streamErr) {
        console.error(`[${agent.name}] Stream parse error: ${streamErr.message}`);
        streamError = streamErr;
        // If we got partial content, continue with what we have
        // Otherwise, re-throw to trigger the outer catch
        if (!chunkText) {
          throw streamErr;
        }
      }

      // Check finish reason (may fail if stream errored)
      let finishReason;
      try {
        finishReason = await getFinishReason(result);
      } catch (e) {
        finishReason = streamError ? 'STREAM_ERROR' : 'UNKNOWN';
      }
      console.log(`[${agent.name}] finishReason: ${finishReason}, tokens so far: ${countTokens(fullResponse)}, attempt: ${continuationAttempts}`);

      // If the model finished naturally, we're done
      if (finishReason !== 'MAX_TOKENS') {
        break;
      }

      // Response was truncated - attempt continuation
      wasTruncated = true;
      continuationAttempts++;

      if (continuationAttempts > MAX_CONTINUATION_ATTEMPTS) {
        console.warn(`[${agent.name}] Max continuation attempts reached, response may be incomplete`);
        break;
      }

      console.log(`[${agent.name}] Response truncated (MAX_TOKENS), attempting continuation ${continuationAttempts}/${MAX_CONTINUATION_ATTEMPTS}`);

      // Build continuation prompt (text-only for continuations, no need to re-send media)
      currentParts = [{ text: `${promptText}\n\n[Your response so far]: ${fullResponse}\n\nYour previous response was cut off. Continue EXACTLY where you left off - do not repeat what you already said. Complete your thought.` }];
    }

    if (wasTruncated) {
      console.log(`[${agent.name}] Response recovered after ${continuationAttempts} continuation(s), final length: ${countTokens(fullResponse)} tokens`);
    }

    // Clean up the response (remove any accidental name prefixes)
    const cleanedResponse = cleanResponse(fullResponse, agent.name);

    // Calculate tokens for this response
    const tokenCount = countTokens(cleanedResponse);

    yield {
      type: 'complete',
      fullResponse: cleanedResponse,
      tokenCount,
      wasTruncated
    };
  } catch (error) {
    yield { type: 'error', error: error.message };
  }
}

/**
 * Non-streaming version for simpler use cases
 */
export async function generateAgentResponseSync(agent, allAgents, messages, goal) {
  if (!genAI) {
    throw new Error('Gemini not initialized. Call initializeGemini first.');
  }

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: await buildSystemPrompt(agent, allAgents, goal),
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 1.0, // Gemini 3 recommends 1.0
    },
  });

  const prompt = buildConversationPrompt(messages, goal, agent.name);
  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Check for truncation
  const finishReason = result.response.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    console.warn(`[${agent?.name}] Sync response was truncated (MAX_TOKENS)`);
  }

  return {
    content: response,
    tokenCount: countTokens(response)
  };
}
