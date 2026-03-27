import React, { useState, useRef, useEffect, useCallback } from 'react';

const P5_CDN = 'https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js';

/**
 * Build a self-contained HTML document that runs the artifact code.
 * Supports: .html (rendered as-is), .js (wrapped in a p5.js sketch harness),
 * .css (injected into a blank page with a preview div).
 */
function buildPreviewDoc(filename, content, allArtifacts) {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'html' || ext === 'htm') {
    // If there are companion .js or .css artifacts, inject them
    let doc = content;
    for (const [name, art] of Object.entries(allArtifacts)) {
      if (name === filename) continue;
      const artExt = name.split('.').pop()?.toLowerCase();
      if (artExt === 'css') {
        doc = doc.replace('</head>', `<style>${art.content}</style></head>`);
      }
      if (artExt === 'js' && !doc.includes(art.content.slice(0, 40))) {
        doc = doc.replace('</body>', `<script>${art.content}<\/script></body>`);
      }
    }
    return doc;
  }

  if (ext === 'js') {
    // Wrap as p5.js sketch
    const cssArt = Object.values(allArtifacts).find(a => a.filename.endsWith('.css'));
    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; overflow: hidden; background: #111; }
  canvas { display: block; }
  ${cssArt?.content ?? ''}
</style>
<script src="${P5_CDN}"><\/script>
</head><body>
<script>
try {
${content}
} catch(e) {
  document.body.innerHTML = '<pre style="color:#e94560;padding:1em;">Error: ' + e.message + '</pre>';
}
<\/script>
</body></html>`;
  }

  // Fallback: code block
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body{margin:0;padding:1em;background:#1a1a2e;color:#e0e0e0;font-family:monospace;white-space:pre-wrap;font-size:13px;}</style>
</head><body>${escapeHtml(content)}</body></html>`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function ArtifactPreview({ artifacts }) {
  const iframeRef = useRef(null);
  const [activeFile, setActiveFile] = useState(null);
  const [viewVersion, setViewVersion] = useState(null);
  const [isCodeView, setIsCodeView] = useState(false);

  const filenames = Object.keys(artifacts);

  // Auto-select first artifact or .html file
  useEffect(() => {
    if (filenames.length === 0) { setActiveFile(null); return; }
    if (activeFile && artifacts[activeFile]) return;
    const html = filenames.find(f => f.endsWith('.html'));
    setActiveFile(html ?? filenames[0]);
  }, [filenames.join(',')]);

  const art = activeFile ? artifacts[activeFile] : null;
  const displayContent = viewVersion !== null
    ? art?.versions?.find(v => v.version === viewVersion)?.content ?? art?.content
    : art?.content;

  // Render preview in iframe
  const renderPreview = useCallback(() => {
    if (!iframeRef.current || !art || !displayContent) return;
    const doc = buildPreviewDoc(activeFile, displayContent, artifacts);
    iframeRef.current.srcdoc = doc;
  }, [activeFile, displayContent, artifacts]);

  useEffect(() => {
    if (!isCodeView) renderPreview();
  }, [renderPreview, isCodeView]);

  if (filenames.length === 0) {
    return (
      <div className="artifact-empty">
        <div className="artifact-empty-icon">◈</div>
        <div className="artifact-empty-text">
          Artifacts will appear here when agents create code files
        </div>
      </div>
    );
  }

  const versionCount = art?.versions?.length ?? 0;

  return (
    <div className="artifact-panel">
      {/* Tab bar */}
      {filenames.length > 0 && (
        <div className="artifact-tabs">
          {filenames.map(f => (
            <button
              key={f}
              className={`artifact-tab ${f === activeFile ? 'artifact-tab-active' : ''}`}
              onClick={() => { setActiveFile(f); setViewVersion(null); }}
            >
              {f}
              <span className="artifact-tab-version">v{artifacts[f]?.versions?.length ?? 1}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="artifact-toolbar">
        <div className="artifact-toolbar-left">
          <button
            className={`artifact-view-btn ${!isCodeView ? 'active' : ''}`}
            onClick={() => setIsCodeView(false)}
          >▶ Preview</button>
          <button
            className={`artifact-view-btn ${isCodeView ? 'active' : ''}`}
            onClick={() => setIsCodeView(true)}
          >{ } Code</button>
        </div>
        <div className="artifact-toolbar-right">
          {versionCount > 1 && (
            <select
              className="artifact-version-select"
              value={viewVersion ?? versionCount}
              onChange={e => {
                const v = Number(e.target.value);
                setViewVersion(v === versionCount ? null : v);
              }}
            >
              {art.versions.map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version} — {v.agentName ?? 'unknown'}
                </option>
              ))}
            </select>
          )}
          {art?.lastEditBy && (
            <span className="artifact-edit-by">edited by {art.lastEditBy}</span>
          )}
        </div>
      </div>

      {/* Content */}
      {isCodeView ? (
        <pre className="artifact-code">{displayContent}</pre>
      ) : (
        <iframe
          ref={iframeRef}
          className="artifact-iframe"
          sandbox="allow-scripts allow-modals"
          title="Artifact Preview"
        />
      )}
    </div>
  );
}
