import JSZip from 'jszip';

/**
 * Export utilities for chat transcripts and agent configs
 */

/**
 * Export chat transcript as Markdown
 */
export function exportAsMarkdown(messages, agents, goal, metadata = {}) {
  const timestamp = new Date().toISOString().split('T')[0];
  const agentList = agents.map(a => `- **${a.name}**`).join('\n');

  let md = `# Chat Session Transcript\n\n`;
  md += `**Date:** ${timestamp}\n`;
  md += `**Goal:** ${goal || 'No goal specified'}\n\n`;
  md += `## Participants\n${agentList}\n\n`;
  md += `---\n\n`;
  md += `## Conversation\n\n`;

  for (const msg of messages) {
    // Skip non-chat messages (workflow inline cards, etc.)
    if (msg.type === 'workflow' || !msg.agentName) continue;

    const time = new Date(msg.timestamp).toLocaleTimeString();
    md += `### ${msg.agentName} (${time})\n\n`;
    md += `${msg.content || ''}\n\n`;

    if (msg.images && msg.images.length > 0) {
      md += `*[${msg.images.length} image(s) generated]*\n\n`;
    }

    if (msg.toolResults && msg.toolResults.length > 0) {
      for (const result of msg.toolResults) {
        if (result.type === 'search') {
          md += `> **Web Search:** ${result.query}\n`;
          if (result.sources) {
            md += `> Sources: ${result.sources.map(s => s.title).join(', ')}\n`;
          }
        } else if (result.type === 'url') {
          md += `> **URL Analysis:** ${result.url}\n`;
        }
        md += '\n';
      }
    }
  }

  if (metadata.tokenCount) {
    md += `---\n\n`;
    md += `**Total Tokens Used:** ${metadata.tokenCount}\n`;
  }

  return md;
}

/**
 * Export chat as JSON (includes all data)
 */
export function exportAsJSON(messages, agents, goal, metadata = {}) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: '1.0',
    goal,
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      bio: a.bio,
      color: a.color
    })),
    messages: messages.map(m => ({
      id: m.id,
      agentId: m.agentId,
      agentName: m.agentName,
      content: m.content,
      timestamp: m.timestamp,
      isUser: m.isUser,
      tokenCount: m.tokenCount,
      hasImages: m.images?.length > 0,
      hasToolResults: m.toolResults?.length > 0
    })),
    metadata: {
      ...metadata,
      messageCount: messages.length,
      participantCount: agents.length
    }
  }, null, 2);
}

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
  const timestamp = new Date().toISOString().split('T')[0];
  downloadBlob(blob, `${sessionName}_media_${timestamp}.zip`);

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
  const timestamp = new Date().toISOString().split('T')[0];
  downloadBlob(blob, `${sessionName}_media_${timestamp}.zip`);

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
