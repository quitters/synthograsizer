(() => {
  'use strict';

  // Keep the landing copy accurate on self-hosted instances as well as the service.
  fetch('/api/health')
    .then(response => response.ok ? response.json() : null)
    .then(health => {
      if (!health || health.hosted !== false) return;
      document.querySelector('[data-generation-note]').textContent =
        'Explore freely. This local instance uses your own API key.';
      document.querySelector('[data-demo-alt]').hidden = false;
    })
    .catch(() => { /* Static previews keep the hosted default. */ });
})();
