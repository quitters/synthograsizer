import React, { useState, useEffect, useRef } from 'react';
import { CAT_ICONS } from '../data/workflowData';

const API_BASE = '/chatroom/api';

// ─── StylePicker ──────────────────────────────────────────────────────────────
// 🎨 button that opens a popover with style preset categories + chips.
// Clicking a preset calls onSelect(tagString) so the parent can insert it
// into the message input.

export function StylePicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  // Fetch preset list once (static data, won't change)
  useEffect(() => {
    if (presets.length > 0) return;
    setLoading(true);
    fetch(`${API_BASE}/workflows/presets`)
      .then((r) => r.json())
      .then((data) => {
        setPresets(data);
        const cats = [...new Set(data.map((p) => p.category))];
        setCategories(cats);
        setActiveCategory(cats[0] ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = presets.filter((p) => p.category === activeCategory);

  return (
    <div className="style-picker" ref={ref}>
      <button
        type="button"
        className={`style-picker-trigger${open ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Insert a style preset tag"
      >
        🎨
      </button>

      {open && (
        <div className="sp-popover">
          <div className="sp-header">Style Presets</div>

          {loading ? (
            <div className="sp-loading">Loading…</div>
          ) : (
            <>
              {/* Category icon strip */}
              <div className="sp-cats">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`sp-cat${activeCategory === cat ? ' active' : ''}`}
                    onClick={() => setActiveCategory(cat)}
                    title={cat}
                  >
                    {CAT_ICONS[cat] ?? '●'}
                    <span className="sp-cat-label">{cat}</span>
                  </button>
                ))}
              </div>

              {/* Preset chip grid */}
              <div className="sp-grid">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="sp-preset"
                    onClick={() => {
                      onSelect(`[SYNTH_STYLE: {subject} | style=${p.id}]`);
                      setOpen(false);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <div className="sp-footer">
                Replace <code>{'{subject}'}</code> with your image subject.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
