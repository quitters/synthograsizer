/* ── Blob Simulator Bridge ─────────────────────────────────────────────
   Listens on the BroadcastChannel used by Softbody_Physics_Blob.html
   and bridges captured frames into the Synthograsizer as reference images.

   Channel: 'synthograsizer-blob-v1'
   ─────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const CHANNEL_NAME = 'synthograsizer-blob-v1';
  const MAX_REF_IMAGES = 14;

  let _channel = null;
  let _toastFn = null;

  function getStudio() {
    return window.studioIntegrationInstance || null;
  }

  function showToast(msg, type = 'info') {
    const studio = getStudio();
    if (studio && typeof studio.showToast === 'function') {
      studio.showToast(msg, type);
    } else {
      console.log('[BlobBridge]', msg);
    }
  }

  function dataURLtoFile(dataUrl, filename) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
  }

  function handleCanvasCapture(msg) {
    const studio = getStudio();
    if (!studio) {
      console.warn('[BlobBridge] studioIntegrationInstance not ready yet');
      return;
    }

    if (!msg.imageData || !msg.imageData.startsWith('data:image/')) {
      console.warn('[BlobBridge] Invalid imageData in canvas-capture message');
      return;
    }

    // Init ref images array if needed
    if (!studio.selectedRefImages) studio.selectedRefImages = [];

    if (studio.selectedRefImages.length >= MAX_REF_IMAGES) {
      showToast('Reference image limit reached (14). Remove some first.', 'warning');
      return;
    }

    // Convert dataURL → File (same format as handleRefImageSelect)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const modeTag = msg.mode || 'sandbox';
    const filename = `blob-${modeTag}-${timestamp}.png`;
    const file = dataURLtoFile(msg.imageData, filename);

    studio.selectedRefImages.push({ file, base64: msg.imageData });

    // Refresh the ref image grid if the studio modal is open
    if (typeof studio.renderRefImages === 'function') {
      studio.renderRefImages();
    }

    // Build a descriptive toast message
    let context = '';
    if (msg.mode === 'terrarium' && msg.labels && msg.labels.length > 0) {
      context = ` — ${msg.labels.join(', ')}`;
    } else if (msg.mode === 'pictionary' && msg.prompt) {
      context = ` — "${msg.prompt}"`;
    } else if (msg.blobCount) {
      context = ` (${msg.blobCount} blob${msg.blobCount > 1 ? 's' : ''})`;
    }

    showToast(`📷 Blob capture added as reference image${context}`, 'success');

    // Auto-populate the studio prompt input with context if it's empty
    _tryPopulatePrompt(msg);
  }

  function _tryPopulatePrompt(msg) {
    const studio = getStudio();
    if (!studio) return;

    // Only auto-populate if the Image Studio modal is currently open
    const modal = document.getElementById('image-studio-modal');
    if (!modal || modal.style.display === 'none') return;

    const promptInput = document.getElementById('studio-prompt');
    if (!promptInput || promptInput.value.trim() !== '') return;

    // Build a context-aware prompt suggestion
    let suggestion = '';
    if (msg.mode === 'terrarium' && msg.labels && msg.labels.length > 0) {
      const creatureList = msg.labels.join(', ');
      const presetTag = msg.presets ? ` (${msg.presets[0]} physics)` : '';
      suggestion = `A whimsical illustration of soft blob creatures: ${creatureList}${presetTag}`;
    } else if (msg.mode === 'pictionary' && msg.prompt) {
      suggestion = `Artistic depiction of "${msg.prompt}" made of soft squishy blob shapes`;
    } else {
      const count = msg.blobCount || 1;
      suggestion = `Abstract composition of ${count} soft gelatinous blob${count > 1 ? 's' : ''}`;
    }

    if (suggestion) {
      promptInput.value = suggestion;
      promptInput.dispatchEvent(new Event('input'));
    }
  }

  function handleMessage(e) {
    const msg = e.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'canvas-capture':
        handleCanvasCapture(msg);
        break;

      case 'mode-changed':
        // Log mode changes for debugging / future use
        console.log('[BlobBridge] Blob simulator mode:', msg.mode);
        break;

      case 'pictionary-result':
        if (msg.correct) {
          showToast(`🎉 Blob Pictionary: "${msg.prompt}" guessed correctly! (${msg.score}/${msg.total})`, 'success');
        }
        break;

      case 'pong':
        // Blob sim is alive and responding
        break;
    }
  }

  function sendToBlobSim(message) {
    if (_channel) {
      try {
        _channel.postMessage(message);
      } catch (e) {
        console.warn('[BlobBridge] Failed to post message to blob sim:', e);
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  window.BlobBridge = {
    /** Send a mode switch to the blob simulator */
    setMode(mode) {
      sendToBlobSim({ type: 'set-mode', mode });
    },

    /** Spawn terrarium creatures */
    spawnCreatures(creatures) {
      sendToBlobSim({ type: 'terrarium-spawn', creatures });
    },

    /** Apply a physics preset by name (e.g. "gelatin") */
    applyPreset(preset, blobIndex) {
      sendToBlobSim({ type: 'apply-preset', preset, blobIndex });
    },

    /** Set a color theme by name (e.g. "ocean") */
    setColorTheme(theme) {
      sendToBlobSim({ type: 'set-colors', theme });
    },

    /** Start a Pictionary round with a given prompt */
    startPictionary(prompt, duration = 60) {
      sendToBlobSim({ type: 'pictionary-start', prompt, duration });
    },

    /** Ping the blob sim to check if it's open */
    ping() {
      sendToBlobSim({ type: 'ping' });
    },

    isReady() {
      return _channel !== null;
    }
  };

  // ── Init ─────────────────────────────────────────────────────────

  function init() {
    try {
      _channel = new BroadcastChannel(CHANNEL_NAME);
      _channel.addEventListener('message', handleMessage);
      console.log('[BlobBridge] Listening on channel:', CHANNEL_NAME);
    } catch (e) {
      console.warn('[BlobBridge] BroadcastChannel not supported:', e);
    }
  }

  // Init immediately — studio-integration.js runs before this and sets
  // window.studioIntegrationInstance synchronously in its constructor
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
