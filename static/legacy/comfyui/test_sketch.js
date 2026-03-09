// Minimal p5.js + p5.comfyui-helper test
let comfy;

function setup() {
  noCanvas();
  // Attempt to connect to ComfyUI server (default ws://127.0.0.1:8188)
  comfy = new p5.ComfyUIHelper({
    host: '127.0.0.1', // Change if your server is elsewhere
    port: 8188,
    secure: false
  });

  comfy.on('connected', () => {
    document.getElementById('status').textContent = 'Connected to ComfyUI server!';
    console.log('Connected to ComfyUI server!');
  });

  comfy.on('error', (err) => {
    document.getElementById('status').textContent = 'Connection error: ' + err;
    console.error('ComfyUI connection error:', err);
  });

  comfy.connect();
}
