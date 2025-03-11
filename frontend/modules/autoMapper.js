export class AutoMapper {
  constructor() {
    this.parameterTypes = new Map([
      ['number', 'continuous'],
      ['boolean', 'discrete'],
      ['string', 'discrete']
    ]);
  }

  analyze(sketch) {
    const params = [];
    
    // Analyze sketch properties
    for (const key in sketch) {
      if (typeof sketch[key] !== 'function') {
        params.push(this.analyzeParameter(key, sketch[key]));
      }
    }

    // Look for special p5.js parameters
    const p5Params = this.getP5Parameters();
    params.push(...p5Params);

    return params;
  }

  analyzeParameter(path, value) {
    const type = typeof value;
    return {
      path,
      type: this.parameterTypes.get(type) || 'continuous',
      current: value,
      suggestedRange: this.getSuggestedRange(value)
    };
  }

  getSuggestedRange(value) {
    if (typeof value === 'number') {
      // Common ranges based on parameter values
      if (value >= 0 && value <= 1) return [0, 1];
      if (value >= 0 && value <= 100) return [0, 100];
      if (value >= 0 && value <= 255) return [0, 255];
      if (value >= -1 && value <= 1) return [-1, 1];
      
      // Default range based on current value
      const magnitude = Math.abs(value);
      return [0, magnitude * 2];
    }
    return [0, 1]; // Default range for non-numeric values
  }

  getP5Parameters() {
    return [
      {
        path: 'frameRate',
        type: 'continuous',
        current: 60,
        suggestedRange: [1, 120]
      },
      {
        path: 'width',
        type: 'continuous',
        current: window.innerWidth,
        suggestedRange: [100, 4000]
      },
      {
        path: 'height',
        type: 'continuous',
        current: window.innerHeight,
        suggestedRange: [100, 4000]
      },
      {
        path: 'pixelDensity',
        type: 'continuous',
        current: 1,
        suggestedRange: [1, 4]
      }
    ];
  }
}
