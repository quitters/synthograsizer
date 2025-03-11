export function createRainbowWaves() {
  return {
    // Configurable parameters
    waveCount: 5,
    waveHeight: 100,
    waveSpeed: 0.02,
    colorSpeed: 0.5,
    noiseScale: 0.01,
    strokeWeight: 2,
    alpha: 180,

    setup(p) {
      p.colorMode(p.HSB, 360, 100, 100, 255);
      p.noFill();
    },

    draw(p) {
      p.background(0, 0, 10);
      
      for (let i = 0; i < this.waveCount; i++) {
        const hue = (p.frameCount * this.colorSpeed + i * 360 / this.waveCount) % 360;
        p.stroke(hue, 80, 100, this.alpha);
        p.strokeWeight(this.strokeWeight);
        
        p.beginShape();
        for (let x = 0; x < p.width; x += 10) {
          const noiseFactor = p.noise(
            x * this.noiseScale, 
            (i * 100 + p.frameCount * this.waveSpeed) * this.noiseScale
          );
          
          const y = p.height/2 + 
                    this.waveHeight * noiseFactor * Math.sin(i + x/100);
          
          p.vertex(x, y);
        }
        p.endShape();
      }
    }
  };
}
