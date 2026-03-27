/**
 * Artifact Store
 * ──────────────
 * Manages shared mutable code artifacts that agents collaboratively edit.
 * Each artifact is versioned — every save creates a new version.
 *
 * Pattern mirrors mediaStore.js (Map-based singleton, session-scoped).
 */

import { v4 as uuidv4 } from 'uuid';

class ArtifactStore {
  constructor() {
    /** @type {Map<string, Artifact>} filename → artifact */
    this.artifacts = new Map();
    this.sessionId = null;
  }

  startSession(sessionId, clearPrevious = true) {
    this.sessionId = sessionId;
    if (clearPrevious) this.artifacts.clear();
  }

  /**
   * Create or update an artifact.
   * @param {string} filename  — e.g. "sketch.js", "game.html"
   * @param {string} content   — full file content
   * @param {string} agentId   — who made the edit
   * @param {string} agentName — display name
   * @returns {Artifact}
   */
  save(filename, content, agentId = null, agentName = null) {
    const existing = this.artifacts.get(filename);

    if (existing) {
      existing.versions.push({
        version: existing.versions.length + 1,
        content,
        agentId,
        agentName,
        timestamp: new Date().toISOString(),
      });
      existing.content = content;
      existing.updatedAt = new Date().toISOString();
      existing.lastEditBy = agentName ?? agentId;
      return existing;
    }

    const artifact = {
      id: uuidv4(),
      filename,
      language: inferLanguage(filename),
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastEditBy: agentName ?? agentId,
      sessionId: this.sessionId,
      versions: [{
        version: 1,
        content,
        agentId,
        agentName,
        timestamp: new Date().toISOString(),
      }],
    };

    this.artifacts.set(filename, artifact);
    return artifact;
  }

  /** Get artifact by filename. */
  get(filename) {
    return this.artifacts.get(filename) ?? null;
  }

  /** Get a specific version's content. */
  getVersion(filename, version) {
    const art = this.artifacts.get(filename);
    if (!art) return null;
    const v = art.versions.find(v => v.version === version);
    return v?.content ?? null;
  }

  /** List all artifacts (metadata only, no content). */
  list() {
    return [...this.artifacts.values()].map(a => ({
      id: a.id,
      filename: a.filename,
      language: a.language,
      versionCount: a.versions.length,
      lastEditBy: a.lastEditBy,
      updatedAt: a.updatedAt,
    }));
  }

  /** Get all artifacts with content (for system prompt injection). */
  getAll() {
    return [...this.artifacts.values()];
  }

  /** Delete an artifact. */
  delete(filename) {
    return this.artifacts.delete(filename);
  }

  clear() {
    this.artifacts.clear();
  }
}

function inferLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    html: 'html', htm: 'html', css: 'css',
    py: 'python', json: 'json', md: 'markdown',
    glsl: 'glsl', frag: 'glsl', vert: 'glsl',
  };
  return map[ext] ?? ext ?? 'text';
}

export const artifactStore = new ArtifactStore();
