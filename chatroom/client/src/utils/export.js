import JSZip from 'jszip';

/**
 * Export utilities for chat transcripts, session save states, and agent configs
 */

// ─── Markdown Export (human-readable transcript with full context) ────────────

/**
 * Export chat transcript as Markdown — rich enough to reconstruct the session.
 * Includes workflow results, image prompts, synth media, and artifacts.
 */
export function exportAsMarkdown(messages, agents, goal, metadata = {}) {
  const { tokenCount, workflows, artifacts } = metadata;
  const timestamp = new Date().toISOString().split('T')[0];
  const agentList = agents.map(a => `- **${a.name}**${a.bio ? ` — ${a.bio.slice(0, 120)}…` : ''}`).join('\n');

  let md = `# Chat Session Transcript\n\n`;
  md += `**Date:** ${timestamp}\n`;
  md += `**Goal:** ${goal || 'No goal specified'}\n`;
  md += `**Agents:** ${agents.length}\n`;
  if (tokenCount) md += `**Tokens:** ${tokenCount}\n`;
  md += `\n## Participants\n${agentList}\n\n`;
  md += `---\n\n`;
  md += `## Conversation\n\n`;

  for (const msg of messages) {
    // Skip non-chat messages (workflow inline cards, streaming placeholders, etc.)
    if (msg.type === 'workflow' || !msg.agentName || msg.isStreaming) continue;
    // Guard against undefined-ish fields that would render as literal "undefined"
    if (msg.agentName === 'undefined' || (!msg.content && !msg.images?.length && !msg.toolResults?.length && !msg.synthMedia?.length)) continue;

    const time = new Date(msg.timestamp).toLocaleTimeString();
    md += `### ${msg.agentName} (${time})\n\n`;
    md += `${msg.content || ''}\n\n`;

    // Inline images (from [IMAGE:] tags)
    if (msg.images && msg.images.length > 0) {
      for (const img of msg.images) {
        md += `> 🖼 **Image** — ${img.prompt || img.caption || 'generated'}\n`;
        if (img.id) md += `> ID: \`${img.id}\`\n`;
      }
      md += '\n';
    }

    // Synth media (from [SYNTH_IMAGE:] / [SYNTH_VIDEO:] tags)
    if (msg.synthMedia && msg.synthMedia.length > 0) {
      for (const sm of msg.synthMedia) {
        const icon = sm.type === 'video' ? '🎬' : '🖼';
        md += `> ${icon} **Synth ${sm.type}** — ${sm.prompt || 'generated'}\n`;
        if (sm.id) md += `> Media ID: \`${sm.id}\`\n`;
      }
      md += '\n';
    }

    // Synth results (template, narrative, analyze)
    if (msg.synthResults && msg.synthResults.length > 0) {
      for (const sr of msg.synthResults) {
        md += `> ⚙ **${sr.type}**`;
        if (sr.prompt) md += ` — ${sr.prompt.slice(0, 200)}`;
        md += '\n';
        if (sr.description) md += `> ${sr.description.slice(0, 300)}\n`;
      }
      md += '\n';
    }

    // Tool results
    if (msg.toolResults && msg.toolResults.length > 0) {
      for (const result of msg.toolResults) {
        if (result.type === 'search') {
          md += `> 🔍 **Web Search:** ${result.query}\n`;
          if (result.sources) {
            md += `> Sources: ${result.sources.map(s => s.title).join(', ')}\n`;
          }
        } else if (result.type === 'url') {
          md += `> 🔗 **URL Analysis:** ${result.url}\n`;
        } else if (result.type === 'research') {
          md += `> 📚 **Research:** ${result.query}\n`;
          if (result.summary) md += `> ${result.summary.slice(0, 300)}\n`;
        }
        md += '\n';
      }
    }

    // Workflow IDs referenced by this message
    if (msg.workflowIds && msg.workflowIds.length > 0) {
      md += `> ⚡ **Workflows launched:** ${msg.workflowIds.map(id => `\`${id}\``).join(', ')}\n\n`;
    }
  }

  // ── Workflow summaries ──────────────────────────────────────────────────────
  if (workflows && workflows.size > 0) {
    md += `---\n\n## Workflows\n\n`;
    for (const [id, wf] of workflows) {
      md += `### ⚡ ${wf.name || id}\n`;
      md += `**Status:** ${wf.status}`;
      if (wf.startedAt) md += ` | **Started:** ${new Date(wf.startedAt).toLocaleTimeString()}`;
      if (wf.completedAt) md += ` | **Completed:** ${new Date(wf.completedAt).toLocaleTimeString()}`;
      md += '\n\n';
      if (wf.steps && wf.steps.length > 0) {
        md += `| Step | Type | Status | Output |\n`;
        md += `|------|------|--------|--------|\n`;
        for (const s of wf.steps) {
          const type = s.type?.replace(/^synth_/, '') ?? s.type;
          const status = s.status ?? 'pending';
          let output = '—';
          if (s.result) {
            if (s.result.mediaId) output = `media:\`${s.result.mediaId}\``;
            else if (s.result.text) output = s.result.text.slice(0, 80) + '…';
            else if (s.result.description) output = s.result.description.slice(0, 80) + '…';
          }
          if (s.error) output = `⚠ ${s.error.slice(0, 60)}`;
          md += `| ${s.id} | ${type} | ${status} | ${output} |\n`;
        }
        md += '\n';
      }
    }
  }

  // ── Artifacts ──────────────────────────────────────────────────────────────
  if (artifacts && Object.keys(artifacts).length > 0) {
    md += `---\n\n## Artifacts\n\n`;
    for (const [filename, art] of Object.entries(artifacts)) {
      md += `### 📄 ${filename}\n`;
      md += `**Language:** ${art.language || 'unknown'} | **Last edited by:** ${art.lastEditBy || 'unknown'}`;
      if (art.versions) md += ` | **Versions:** ${art.versions.length}`;
      md += '\n\n';
      md += '```' + (art.language || '') + '\n';
      md += art.content || '';
      md += '\n```\n\n';
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  md += `---\n\n`;
  if (tokenCount) md += `**Total Tokens Used:** ${tokenCount}\n`;
  md += `**Messages:** ${messages.filter(m => m.agentName && m.agentName !== 'undefined' && m.type !== 'workflow').length}\n`;
  if (workflows && workflows.size > 0) md += `**Workflows:** ${workflows.size}\n`;

  return md;
}

// ─── JSON Export (full save state for branching) ─────────────────────────────

/**
 * Export full session state as JSON — restorable save state.
 * Includes all message data, workflow state, and artifacts.
 * Media base64 is excluded (too large); media IDs are preserved for re-fetch.
 */
export function exportAsJSON(messages, agents, goal, metadata = {}) {
  const { tokenCount, workflows, artifacts } = metadata;

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: '2.0',
    goal,
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      bio: a.bio,
      color: a.color,
      avatar: a.avatar,
    })),
    messages: messages
      .filter(m => m.type !== 'workflow') // skip pseudo-messages
      .map(m => ({
        id: m.id,
        agentId: m.agentId,
        agentName: m.agentName,
        color: m.color,
        content: m.content,
        timestamp: m.timestamp,
        isUser: m.isUser,
        tokenCount: m.tokenCount,
        // Images — include prompts and IDs, strip base64 data
        images: m.images?.map(img => ({
          id: img.id,
          prompt: img.prompt,
          caption: img.caption,
          mimeType: img.mimeType,
          referenceId: img.referenceId,
        })) ?? undefined,
        // Tool results — full data
        toolResults: m.toolResults ?? undefined,
        // Synth media — IDs and prompts (no base64)
        synthMedia: m.synthMedia?.map(sm => ({
          id: sm.id,
          type: sm.type,
          mimeType: sm.mimeType,
          prompt: sm.prompt,
        })) ?? undefined,
        // Synth results — full objects
        synthResults: m.synthResults ?? undefined,
        // Workflow references
        workflowIds: m.workflowIds ?? undefined,
      })),
    // Full workflow state
    workflows: workflows
      ? [...workflows.entries()].map(([id, wf]) => ({
          id,
          name: wf.name,
          status: wf.status,
          agentId: wf.agentId,
          agentName: wf.agentName,
          startedAt: wf.startedAt,
          completedAt: wf.completedAt,
          steps: (wf.steps ?? []).map(s => ({
            id: s.id,
            type: s.type,
            status: s.status,
            error: s.error,
            result: s.result ? stripBase64(s.result) : undefined,
          })),
        }))
      : [],
    // Artifacts with version history
    artifacts: artifacts
      ? Object.fromEntries(
          Object.entries(artifacts).map(([filename, art]) => [filename, {
            filename: art.filename,
            language: art.language,
            content: art.content,
            lastEditBy: art.lastEditBy,
            versions: art.versions ?? [],
          }])
        )
      : {},
    metadata: {
      tokenCount: tokenCount ?? 0,
      messageCount: messages.filter(m => m.type !== 'workflow').length,
      participantCount: agents.length,
      workflowCount: workflows ? workflows.size : 0,
      artifactCount: artifacts ? Object.keys(artifacts).length : 0,
    },
  }, null, 2);
}

/** Strip base64 blobs from result objects (keep IDs, prompts, metadata) */
function stripBase64(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.length > 1000) {
      // Likely base64 data — replace with length indicator
      out[k] = `[base64:${v.length} chars]`;
    } else if (typeof v === 'object' && v !== null) {
      out[k] = stripBase64(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ─── Agent Config Export/Import ──────────────────────────────────────────────

/**
 * Export agent configurations
 */
export function exportAgentConfigs(agents) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: '1.0',
    agents: agents.map(a => ({
      name: a.name,
      bio: a.bio,
      color: a.color
    }))
  }, null, 2);
}

/**
 * Parse imported agent configs
 */
export function parseAgentConfigs(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (data.agents && Array.isArray(data.agents)) {
      return data.agents.map(a => ({
        name: a.name || 'Unnamed Agent',
        bio: a.bio || '',
        color: a.color || generateColor()
      }));
    }
    throw new Error('Invalid agent config format');
  } catch (e) {
    throw new Error(`Failed to parse agent config: ${e.message}`);
  }
}

// ─── File Utils ──────────────────────────────────────────────────────────────

/**
 * Download a file
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a random color for agents
 */
function generateColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 60%, 45%)`;
}

// ─── Session Persistence (localStorage) ──────────────────────────────────────

/**
 * Save session to localStorage
 */
export function saveSession(key, data) {
  try {
    localStorage.setItem(`chatroom_${key}`, JSON.stringify({
      savedAt: new Date().toISOString(),
      ...data
    }));
    return true;
  } catch (e) {
    console.error('Failed to save session:', e);
    return false;
  }
}

/**
 * Load session from localStorage
 */
export function loadSession(key) {
  try {
    const data = localStorage.getItem(`chatroom_${key}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Failed to load session:', e);
    return null;
  }
}

/**
 * List all saved sessions
 */
export function listSavedSessions() {
  const sessions = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('chatroom_session_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        sessions.push({
          key: key.replace('chatroom_', ''),
          name: data.name || 'Unnamed Session',
          savedAt: data.savedAt,
          messageCount: data.messages?.length || 0,
          goal: data.goal
        });
      } catch (e) {
        // Skip invalid entries
      }
    }
  }
  return sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

/**
 * Delete a saved session
 */
export function deleteSession(key) {
  localStorage.removeItem(`chatroom_${key}`);
}

// ─── Media ZIP Export ────────────────────────────────────────────────────────

/**
 * Export all media as a ZIP file
 * @param {Array} messages - Messages containing images
 * @param {string} sessionName - Name for the ZIP file
 */
export async function exportMediaAsZip(messages, sessionName = 'media') {
  const zip = new JSZip();
  const mediaFolder = zip.folder('media');
  const imagesFolder = mediaFolder.folder('images');

  let imageIndex = 1;
  const manifest = [];

  // Extract images from messages
  for (const msg of messages) {
    if (msg.images && msg.images.length > 0) {
      for (const image of msg.images) {
        // Determine file extension
        let extension = 'png';
        if (image.mimeType === 'image/jpeg') extension = 'jpg';
        else if (image.mimeType === 'image/webp') extension = 'webp';
        else if (image.mimeType === 'image/gif') extension = 'gif';

        const filename = `image_${String(imageIndex).padStart(3, '0')}_${sanitizeFilename(image.prompt || image.caption || 'generated')}.${extension}`;

        // Add to zip (convert base64 to binary)
        imagesFolder.file(filename, image.imageData, { base64: true });

        // Add to manifest
        manifest.push({
          index: imageIndex,
          filename: `images/${filename}`,
          prompt: image.prompt,
          caption: image.caption,
          agentName: msg.agentName,
          timestamp: msg.timestamp,
          id: image.id
        });

        imageIndex++;
      }
    }
  }

  // Add manifest file
  mediaFolder.file('manifest.json', JSON.stringify({
    exportedAt: new Date().toISOString(),
    totalImages: imageIndex - 1,
    items: manifest
  }, null, 2));

  // Generate and download
  const blob = await zip.generateAsync({ type: 'blob' });
  const ts = new Date().toISOString().split('T')[0];
  downloadBlob(blob, `${sessionName}_media_${ts}.zip`);

  return { imageCount: imageIndex - 1 };
}

/**
 * Export media from API response
 * @param {Array} mediaItems - Media items from server
 * @param {string} sessionName - Name for the ZIP file
 */
export async function exportMediaFromApi(mediaItems, sessionName = 'media') {
  const zip = new JSZip();
  const mediaFolder = zip.folder('media');
  const imagesFolder = mediaFolder.folder('images');
  const videosFolder = mediaFolder.folder('videos');

  const manifest = [];

  for (const item of mediaItems) {
    const folder = item.mimeType?.startsWith('video/') ? videosFolder : imagesFolder;
    const subfolder = item.mimeType?.startsWith('video/') ? 'videos' : 'images';

    folder.file(item.filename, item.data, { base64: true });

    manifest.push({
      filename: `${subfolder}/${item.filename}`,
      prompt: item.prompt,
      agentName: item.agentName,
      createdAt: item.createdAt,
      id: item.id
    });
  }

  // Add manifest file
  mediaFolder.file('manifest.json', JSON.stringify({
    exportedAt: new Date().toISOString(),
    totalItems: mediaItems.length,
    items: manifest
  }, null, 2));

  // Generate and download
  const blob = await zip.generateAsync({ type: 'blob' });
  const ts = new Date().toISOString().split('T')[0];
  downloadBlob(blob, `${sessionName}_media_${ts}.zip`);

  return { itemCount: mediaItems.length };
}

/**
 * Download a Blob
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}
