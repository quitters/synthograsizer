// Standalone light workspace: the existing engine owns pixels and effects.
const $ = id => document.getElementById(id);
let app;
let comparing = false;
const status = message => { $('workspace-status').textContent = message; };
// Strip the legacy buttons' leading emoji so progress reads as plain prose.
const plain = text => text.replace(/^[^\p{L}\p{N}]+/u, '').trim();
window.addEventListener('glitcher:workspace-status', event => status(event.detail));

function compare(show) {
  const original = app?.canvasManager.originalImageData;
  if (show && !original) return;
  comparing = show;
  const canvas = $('workspace-original');
  if (show) {
    canvas.width = original.width;
    canvas.height = original.height;
    canvas.getContext('2d').putImageData(original, 0, 0);
  }
  canvas.hidden = !show;
  $('workspace-comparison-label').hidden = !show;
  $('workspace-compare').textContent = show ? 'Show edited' : 'Show original';
  $('workspace-compare').setAttribute('aria-pressed', String(show));
}

function syncExportSettings() {
  const frames = $('workspace-frames');
  const valid = frames.checkValidity();
  const fps = Number($('workspace-fps').value);
  $('v2-record-btn').disabled = !valid || !app?.canvasManager.isImageLoaded();
  if (!valid) { $('workspace-duration').textContent = 'Choose a whole number from 30 to 600 frames.'; return; }
  $('record-frames-range').value = frames.value;
  $('record-frames-range').dispatchEvent(new Event('input', { bubbles: true }));
  $('record-fps-select').value = String(fps);
  $('record-fps-select').dispatchEvent(new Event('change', { bubbles: true }));
  $('workspace-duration').textContent = `${(Number(frames.value) / fps).toFixed(1)} seconds at ${fps} fps`;
}

function init(instance) {
  if (app) return;
  app = instance;
  const manager = app.canvasManager;
  // Surface errors from the existing loader where a person can read them.
  const reportError = manager.showError.bind(manager);
  manager.showError = message => { reportError(message); status(message); };
  manager.onImageLoad(() => {
    compare(false);
    ['workspace-reset', 'workspace-export', 'workspace-compare', 'v2-play-btn'].forEach(id => { $(id).disabled = false; });
    const name = $('image-input').files?.[0]?.name || 'Imported image';
    $('v2-media-label').textContent = name;
    $('v2-media-label').title = name;
    $('workspace-media-type').textContent = manager.animationMode ? 'Animated media' : 'Image';
    const speed = $('v2-speed-btn');
    speed.disabled = !manager.animationMode;
    speed.title = manager.animationMode
      ? 'Change source playback speed'
      : 'Source playback speed applies to GIFs and video';
    // Per-effect masks refer to dimensions of the previous media.
    app.effectChainManager.chain.forEach(effect => { effect.selectionMask = null; });
    app.effectChainManager.emit('chainUpdated', app.effectChainManager.chain);
    status('Media loaded. Add an effect to begin.');
  });
  $('workspace-import').addEventListener('click', () => $('image-input').click());
  $('workspace-sample').addEventListener('click', async () => {
    const button = $('workspace-sample');
    button.disabled = true;
    status('Loading sample…');
    try {
      const response = await fetch(new URL('../assets/studio-sample.svg', import.meta.url));
      if (!response.ok) throw new Error('Sample could not be loaded. Please import your own image.');
      const data = new DataTransfer();
      data.items.add(new File([await response.blob()], 'Field study.svg', { type: 'image/svg+xml' }));
      $('image-input').files = data.files;
      await manager.handleFileSelect();
    } catch (error) { status(error.message); }
    finally { button.disabled = false; }
  });
  $('workspace-compare').addEventListener('click', () => compare(!comparing));
  $('workspace-reset').addEventListener('click', () => {
    compare(false);
    // Pause so reset pixels remain visible instead of immediately degrading again.
    if (!app.isPaused) app.togglePlayPause();
    app.resetImage();
    status('Source image restored. Press Play to run your effects again.');
  });
  $('workspace-export').addEventListener('click', () => {
    compare(false);
    syncExportSettings();
    $('workspace-export-dialog').showModal();
  });
  $('workspace-help').addEventListener('click', () => $('workspace-help-dialog').showModal());
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('workspace-frames').addEventListener('input', syncExportSettings);
  $('workspace-fps').addEventListener('change', syncExportSettings);
  $('v2-preview-toggle').addEventListener('click', () => {
    $('v2-preview-toggle').setAttribute('aria-pressed', String($('selection-preview-checkbox').checked));
  });
  document.querySelectorAll('[data-starter]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.starter;
    let effect = app.effectChainManager.getEffect(id);
    if (!effect) {
      effect = app.effectFactory.createEffect(id);
      app.effectChainManager.addEffect(effect);
    }
    // Use the normal card selection path to keep the properties panel in sync.
    document.querySelector(`.chain-node[data-id="${id}"] .node-label`)?.click();
    status(`${effect.name} ready. Adjust its controls in the right panel.`);
  }));
  const record = $('record-btn');
  const snapshot = $('snapshot-btn');
  let wasRecording = false;
  new MutationObserver(() => {
    const saved = snapshot.textContent.includes('Saved');
    $('v2-snapshot-btn').textContent = saved ? 'PNG download started ✓' : 'Save image as PNG ↗';
  }).observe(snapshot, { childList: true, subtree: true, characterData: true });
  new MutationObserver(() => {
    const busy = record.disabled;
    $('v2-record-btn').disabled = busy;
    $('workspace-frames').disabled = busy;
    $('workspace-fps').disabled = busy;
    if (busy) {
      $('workspace-record-status').textContent = plain(record.textContent);
    } else {
      // The engine downloads the file and then restores the button, so without
      // this the progress line would simply empty out at the end.
      $('workspace-record-status').textContent = wasRecording ? 'Video download started.' : '';
    }
    wasRecording = busy;
  }).observe(record, { attributes: true, childList: true, subtree: true, characterData: true });
  syncExportSettings();
}

window.addEventListener('glitcher:workspace-ready', event => init(event.detail), { once: true });
// The modules can finish in either order after DOMContentLoaded.
if (window.glitcherApp?.studioMode && window.glitcherApp?.effectChainManager) init(window.glitcherApp);

// This page has one editing mode; keep the legacy mode shortcut from hiding it.
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!$('workspace-export').disabled) $('workspace-export').click();
  }
}, true);
