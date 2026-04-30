/**
 * Storyboard Panel — Interactive visual storyboard for bespoke-beat story templates.
 *
 * Renders beat cards in act groups, supports per-beat regeneration, image/video
 * generation, and JSON export.  Designed for the new bespoke-beat story schema.
 */

import { StoryEngine, isBespokeStoryTemplate } from './story-engine.js?v=2';
import { normalizeTemplate, getValueText } from './template-normalizer.js';

export class StoryboardPanel {
  /**
   * @param {Object} app - The SynthograsizerSmall app instance
   */
  constructor(app) {
    this.app = app;
    this.template = null;
    this.engine = null;
    this.sequence = []; // Current generated sequence [{beat, act, text, ...}]
    this.beatMedia = {}; // beatId → { imageData, videoUrl, status }
    this._bound = false;
    this._bindGlobalEvents();
  }

  // ─── Public API ────────────────────────────────────────────────

  /**
   * Open the storyboard panel for the current template.
   */
  open() {
    const template = this.app?.currentTemplate;
    if (!template || !isBespokeStoryTemplate(template)) {
      this._toast('No bespoke-beat story template loaded.', 'warning');
      return;
    }

    this.template = JSON.parse(JSON.stringify(template)); // deep clone
    this.engine = new StoryEngine(this.template);
    this.sequence = this.engine.generateSequence({
      getWeightedRandomIndex: (w) => this.app.getWeightedRandomIndex(w)
    });

    this._render();
    document.getElementById('storyboard-overlay').style.display = '';
  }

  /**
   * Close the storyboard panel.
   */
  close() {
    document.getElementById('storyboard-overlay').style.display = 'none';
  }

  // ─── Rendering ─────────────────────────────────────────────────

  _render() {
    const summary = this.engine.getSummary();
    const titleEl = document.getElementById('storyboard-title');
    const metaEl = document.getElementById('storyboard-meta');
    const bodyEl = document.getElementById('storyboard-body');

    if (titleEl) titleEl.textContent = `🎬 ${summary.title}`;
    if (metaEl) {
      const parts = [`${summary.totalBeats} beats`];
      if (summary.duration_seconds) parts.push(`${summary.duration_seconds}s total`);
      if (summary.beat_duration_seconds) parts.push(`${summary.beat_duration_seconds}s/beat`);
      if (summary.characters.length) parts.push(`${summary.characters.length} character${summary.characters.length > 1 ? 's' : ''}`);
      metaEl.textContent = parts.join(' · ');
    }

    if (!bodyEl) return;
    bodyEl.innerHTML = '';

    // Render anchors summary
    const anchors = summary.anchors || {};
    if (Object.keys(anchors).length > 0) {
      const anchorsEl = document.createElement('div');
      anchorsEl.className = 'storyboard-anchors';
      anchorsEl.innerHTML = `
        <div class="storyboard-anchors-title">🔗 Shared Anchors</div>
        <div class="storyboard-anchors-grid">
          ${Object.entries(anchors).map(([key, val]) => `
            <div class="storyboard-anchor-chip">
              <span class="anchor-key">{{${key}}}</span>
              <span class="anchor-value">${this._truncate(val, 80)}</span>
            </div>
          `).join('')}
        </div>
      `;
      bodyEl.appendChild(anchorsEl);
    }

    // Render characters
    const chars = summary.characters || [];
    if (chars.length > 0) {
      const charsEl = document.createElement('div');
      charsEl.className = 'storyboard-characters';
      charsEl.innerHTML = `
        <div class="storyboard-characters-title">👥 Characters</div>
        <div class="storyboard-characters-grid">
          ${chars.map(c => `
            <div class="storyboard-character-chip">
              <span class="char-id">{{${c.id}}}</span>
              <span class="char-name">${c.name}</span>
              <span class="char-anchors">${this._truncate(c.anchors, 60)}</span>
            </div>
          `).join('')}
        </div>
      `;
      bodyEl.appendChild(charsEl);
    }

    // Render acts and beats
    const acts = summary.acts || [];
    const beatsByAct = {};
    for (const entry of this.sequence) {
      if (!beatsByAct[entry.act]) beatsByAct[entry.act] = [];
      beatsByAct[entry.act].push(entry);
    }

    for (const act of acts) {
      const actName = act.name || 'Unnamed Act';
      const beats = beatsByAct[actName] || [];

      const actGroup = document.createElement('div');
      actGroup.className = 'storyboard-act-group';
      actGroup.innerHTML = `
        <div class="storyboard-act-header">
          <span class="act-name">${actName}</span>
          <span class="act-beat-count">${beats.length} beat${beats.length !== 1 ? 's' : ''}</span>
        </div>
      `;

      const grid = document.createElement('div');
      grid.className = 'storyboard-beat-grid';

      for (const entry of beats) {
        const card = this._createBeatCard(entry);
        grid.appendChild(card);
      }

      actGroup.appendChild(grid);
      bodyEl.appendChild(actGroup);
    }

    // Handle any unassigned beats
    const assignedBeats = new Set(this.sequence.filter(e => e.act !== 'Unassigned').map(e => e.beat));
    const unassigned = this.sequence.filter(e => e.act === 'Unassigned');
    if (unassigned.length > 0) {
      const group = document.createElement('div');
      group.className = 'storyboard-act-group';
      group.innerHTML = `<div class="storyboard-act-header"><span class="act-name">Unassigned</span></div>`;
      const grid = document.createElement('div');
      grid.className = 'storyboard-beat-grid';
      for (const entry of unassigned) grid.appendChild(this._createBeatCard(entry));
      group.appendChild(grid);
      bodyEl.appendChild(group);
    }
  }

  /**
   * Create a single beat card element.
   */
  _createBeatCard(entry) {
    const card = document.createElement('div');
    card.className = 'storyboard-beat-card';
    card.dataset.beatId = entry.beat;

    const media = this.beatMedia[entry.beat] || {};
    const hasImage = media.imageData;
    const hasVideo = media.videoUrl;

    card.innerHTML = `
      <div class="beat-card-header">
        <span class="beat-number">#${entry.beat}</span>
        <span class="beat-shot">${entry.shot || ''}</span>
      </div>
      <div class="beat-card-media" id="beat-media-${entry.beat}">
        ${hasImage
          ? `<img src="${media.imageData}" alt="Beat ${entry.beat}" class="beat-thumb" />`
          : `<div class="beat-placeholder">
              <span class="beat-placeholder-icon">🎬</span>
            </div>`
        }
        ${hasVideo ? '<span class="beat-video-badge">▶ Video</span>' : ''}
      </div>
      <div class="beat-card-purpose">${entry.purpose || ''}</div>
      <div class="beat-card-prompt" title="${this._escapeAttr(entry.text)}">${this._truncate(entry.text, 120)}</div>
      <div class="beat-card-chars">
        ${(entry.characters || []).map(cid => `<span class="beat-char-tag">${cid}</span>`).join('')}
      </div>
      <div class="beat-card-actions">
        <button class="beat-action-btn beat-regen-btn" data-beat="${entry.beat}" title="Regenerate this beat">🔄</button>
        <button class="beat-action-btn beat-img-btn" data-beat="${entry.beat}" title="Generate image">🖼️</button>
        <button class="beat-action-btn beat-vid-btn" data-beat="${entry.beat}" title="Generate video">🎥</button>
        <button class="beat-action-btn beat-copy-btn" data-beat="${entry.beat}" title="Copy prompt">📋</button>
      </div>
    `;

    // Card action handlers
    card.querySelector('.beat-regen-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._regenerateBeat(entry.beat);
    });
    card.querySelector('.beat-img-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._generateBeatImage(entry.beat);
    });
    card.querySelector('.beat-vid-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._generateBeatVideo(entry.beat);
    });
    card.querySelector('.beat-copy-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._copyBeatPrompt(entry.beat);
    });

    return card;
  }

  // ─── Beat Actions ──────────────────────────────────────────────

  /**
   * Regenerate a single beat's prompt via the backend story-beat API.
   */
  async _regenerateBeat(beatId) {
    const card = document.querySelector(`.storyboard-beat-card[data-beat-id="${beatId}"]`);
    if (card) card.classList.add('beat-loading');

    try {
      const res = await fetch('/api/generate/template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'story-beat',
          current_template: this.template,
          target_beat_id: beatId,
          prompt: '' // No user direction — just re-gen
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      // The response is the replacement beat object inside data.template
      let newBeat = data.template;
      if (newBeat && typeof newBeat === 'object') {
        // Update the beat in our local template
        const beats = this.template.story.beats;
        const idx = beats.findIndex(b => b.id === beatId);
        if (idx >= 0) {
          beats[idx] = { ...beats[idx], ...newBeat, id: beatId };
        }

        // Re-run engine
        this.engine = new StoryEngine(this.template);
        this.sequence = this.engine.generateSequence({
          getWeightedRandomIndex: (w) => this.app.getWeightedRandomIndex(w)
        });

        this._render();
        this._toast(`Beat #${beatId} regenerated`, 'success');
      }
    } catch (err) {
      console.error('Beat regeneration failed:', err);
      this._toast(`Failed to regenerate beat #${beatId}: ${err.message}`, 'error');
    } finally {
      if (card) card.classList.remove('beat-loading');
    }
  }

  /**
   * Generate an image for a specific beat via the image generation API.
   */
  async _generateBeatImage(beatId) {
    const entry = this.sequence.find(e => e.beat === beatId);
    if (!entry) return;

    const card = document.querySelector(`.storyboard-beat-card[data-beat-id="${beatId}"]`);
    if (card) card.classList.add('beat-loading');

    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: entry.text,
          aspect_ratio: '16:9'
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.image) {
        if (!this.beatMedia[beatId]) this.beatMedia[beatId] = {};
        this.beatMedia[beatId].imageData = data.image.startsWith('data:')
          ? data.image
          : `data:image/png;base64,${data.image}`;
        this.beatMedia[beatId].status = 'image-done';

        // Update just the media area
        const mediaEl = document.getElementById(`beat-media-${beatId}`);
        if (mediaEl) {
          mediaEl.innerHTML = `<img src="${this.beatMedia[beatId].imageData}" alt="Beat ${beatId}" class="beat-thumb" />`;
        }
        this._toast(`Beat #${beatId} image generated`, 'success');
      }
    } catch (err) {
      console.error('Beat image generation failed:', err);
      this._toast(`Failed to generate image for beat #${beatId}: ${err.message}`, 'error');
    } finally {
      if (card) card.classList.remove('beat-loading');
    }
  }

  /**
   * Generate a video for a specific beat via the video generation API.
   */
  async _generateBeatVideo(beatId) {
    const entry = this.sequence.find(e => e.beat === beatId);
    if (!entry) return;

    const card = document.querySelector(`.storyboard-beat-card[data-beat-id="${beatId}"]`);
    if (card) card.classList.add('beat-loading');

    try {
      // If we have an image for this beat, use it as start frame for Veo
      const imageData = this.beatMedia[beatId]?.imageData;
      const body = {
        prompt: entry.text,
        aspect_ratio: '16:9'
      };
      if (imageData) {
        // Strip data URI prefix for base64
        body.start_frame_image = imageData.replace(/^data:image\/[^;]+;base64,/, '');
      }

      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.video_url || data.video) {
        if (!this.beatMedia[beatId]) this.beatMedia[beatId] = {};
        this.beatMedia[beatId].videoUrl = data.video_url || data.video;
        this.beatMedia[beatId].status = 'video-done';

        // Show video badge on card
        const mediaEl = document.getElementById(`beat-media-${beatId}`);
        if (mediaEl && !mediaEl.querySelector('.beat-video-badge')) {
          const badge = document.createElement('span');
          badge.className = 'beat-video-badge';
          badge.textContent = '▶ Video';
          mediaEl.appendChild(badge);
        }
        this._toast(`Beat #${beatId} video generated`, 'success');
      }
    } catch (err) {
      console.error('Beat video generation failed:', err);
      this._toast(`Failed to generate video for beat #${beatId}: ${err.message}`, 'error');
    } finally {
      if (card) card.classList.remove('beat-loading');
    }
  }

  /**
   * Copy a beat's expanded prompt to clipboard.
   */
  async _copyBeatPrompt(beatId) {
    const entry = this.sequence.find(e => e.beat === beatId);
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.text);
      this._toast(`Beat #${beatId} prompt copied`, 'success');
    } catch {
      this._toast('Clipboard access denied', 'warning');
    }
  }

  /**
   * Export the current storyboard as Story JSON.
   */
  _exportStoryJSON() {
    const story = this.template.story || {};
    const output = {
      story_name: story.title || 'Untitled Story',
      source: 'synthograsizer-story-engine',
      description: `Story sequence: ${story.title || 'Untitled'}`,
      total_beats: this.sequence.length,
      duration_seconds: story.duration_seconds || null,
      beat_duration_seconds: story.beat_duration_seconds || null,
      anchors: story.anchors || {},
      characters: (story.characters || []).map(c => ({
        id: c.id, name: c.name, anchors: c.anchors
      })),
      acts: (story.acts || []).map(act => {
        const actBeats = this.sequence.filter(e => e.act === act.name);
        return {
          name: act.name,
          beats: actBeats.map(b => ({
            beat: b.beat,
            shot: b.shot || '',
            purpose: b.purpose || '',
            prompt: b.text,
            characters: b.characters || [],
            image: this.beatMedia[b.beat]?.imageData ? '[generated]' : null,
            video: this.beatMedia[b.beat]?.videoUrl || null
          }))
        };
      }),
      flat_prompts: this.sequence.map(e => e.text),
      tags: this.template.tags || []
    };

    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard_${(story.title || 'untitled').replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this._toast('Story JSON exported', 'success');
  }

  // ─── Helpers ───────────────────────────────────────────────────

  _bindGlobalEvents() {
    if (this._bound) return;
    this._bound = true;

    // Close button
    document.addEventListener('click', (e) => {
      if (e.target.id === 'storyboard-close') this.close();
      if (e.target.id === 'storyboard-overlay') this.close();
      if (e.target.id === 'storyboard-export-json') this._exportStoryJSON();
      if (e.target.id === 'storyboard-generate-all') this._generateAllImages();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('storyboard-overlay');
        if (overlay && overlay.style.display !== 'none') {
          this.close();
        }
      }
    });
  }

  /**
   * Generate images for all beats sequentially.
   */
  async _generateAllImages() {
    const btn = document.getElementById('storyboard-generate-all');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

    for (const entry of this.sequence) {
      if (!this.beatMedia[entry.beat]?.imageData) {
        await this._generateBeatImage(entry.beat);
      }
    }

    if (btn) { btn.disabled = false; btn.textContent = '▶ Generate All Beats'; }
    this._toast('All beat images generated', 'success');
  }

  _toast(msg, level = 'info') {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, level);
    } else {
      console.log(`[Storyboard] ${level}: ${msg}`);
    }
  }

  _truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  _escapeAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}
