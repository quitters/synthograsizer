(() => {
  'use strict';
  const hero = document.getElementById('hero-art');
  const shared = document.getElementById('commons-art');
  const shape = document.getElementById('shape');
  const texture = document.getElementById('texture');
  let seed = 0;

  function surface(canvas) {
    const { width, height } = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    return { ctx, width, height };
  }

  function drawHero() {
    const { ctx, width: w, height: h } = surface(hero);
    const form = Number(shape.value) / 100;
    const density = Number(texture.value);
    ctx.fillStyle = '#f7f5ec';
    ctx.fillRect(0, 0, w, h);
    // A deterministic plotted sculpture, rendered locally without generation calls.
    ctx.fillStyle = '#dea174';
    ctx.beginPath();
    ctx.arc(w * .66, h * .36, Math.min(w, h) * .245, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(w * .48, h * .51);
    ctx.rotate(-.3 + form * .42);
    const scale = Math.min(w * .34, h * .38);
    const lines = Math.round(55 + density * .68);
    for (let i = 0; i < lines; i++) {
      const u = i / lines * Math.PI * 2;
      ctx.beginPath();
      for (let j = 0; j <= 220; j++) {
        const v = j / 220 * Math.PI * 2;
        const radius = 1 + .32 * Math.cos(v * (2 + form) + u * 2 + seed);
        const x = scale * (radius * Math.cos(u) + .38 * Math.cos(v + u));
        const y = scale * (.62 * radius * Math.sin(u) + .56 * Math.sin(v));
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 7 === 0 ? '#55725966' : '#294e3b80';
      ctx.lineWidth = .48;
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#8e9b8266';
    for (let i = 0; i < 65; i++) {
      const x = ((i * 137.508) % w);
      const y = ((i * 71.213) % h);
      ctx.fillRect(x, y, .7, .7);
    }
  }

  function drawCommons() {
    const { ctx, width: w, height: h } = surface(shared);
    ctx.clearRect(0, 0, w, h);
    const colors = ['#7d9365', '#aa7a4c', '#537c76'];
    for (let group = 0; group < 3; group++) {
      for (let line = 0; line < 34; line++) {
        ctx.beginPath();
        for (let step = 0; step <= 160; step++) {
          const t = step / 160;
          const x = w * (.08 + .84 * t);
          const envelope = Math.sin(t * Math.PI);
          const y = h * .52 + Math.sin(t * Math.PI * 2 + group * .9 + line * .032) * h * .3 * envelope + (line - 17) * h * .007;
          if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = colors[group] + 'b0';
        ctx.lineWidth = .65;
        ctx.stroke();
      }
    }
  }
  function update() {
    document.getElementById('shape-value').value = shape.value;
    document.getElementById('texture-value').value = texture.value;
    drawHero();
  }
  shape.addEventListener('input', update);
  texture.addEventListener('input', update);
  document.getElementById('remix').addEventListener('click', () => {
    seed += 1.7;
    shape.value = (Number(shape.value) + 37) % 101;
    texture.value = 35 + ((Number(texture.value) + 23) % 66);
    update();
  });
  const observer = new ResizeObserver(() => { drawHero(); drawCommons(); });
  observer.observe(hero.parentElement);
  observer.observe(shared.parentElement);
  update();
  drawCommons();

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
