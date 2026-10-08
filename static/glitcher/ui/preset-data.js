// Preset looks for the Glitcher: ready-made effect stacks, grouped in packs.
// Plain data, no DOM, so a Node test can check every effect id and parameter against the real registry
// (static/glitcher/tests/presets.test.mjs). A preset with "selection": "all" covers the whole image
// instead of the small wandering regions effects get by default.
// Generated from Teamcrafter's chain files; edit freely, nothing regenerates this.
export const PRESET_PACKS = [
  {
    "id": "classics",
    "name": "Glitch classics",
    "blurb": "Rows that slide, columns that sort, tape that tears. Each one keeps degrading while it plays.",
    "presets": [
      {
        "name": "Classic Glitch",
        "description": "Traditional glitch art: rows slide down and tear sideways",
        "chain": [
          {
            "type": "direction-movement",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "direction": "down",
              "speed": 3,
              "selectionAware": true
            }
          },
          {
            "type": "slice-glitch",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "mode": "horizontal",
              "offset": 20
            }
          }
        ]
      },
      {
        "name": "Psychedelic",
        "description": "A slow swirl with hue rotation screened over it",
        "chain": [
          {
            "type": "spiral-distortion",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "type": "spiral",
              "strength": 0.08,
              "direction": "cw",
              "opacity": 0.7,
              "blendMode": "overlay"
            }
          },
          {
            "type": "hue-shift",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "intensity": 80,
              "opacity": 0.6,
              "blendMode": "screen"
            }
          }
        ]
      },
      {
        "name": "Datamosh",
        "description": "Compression-style smearing: sorted columns, torn slices, split colour",
        "chain": [
          {
            "type": "pixel-sort",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "mode": "columnBrightness"
            }
          },
          {
            "type": "slice-glitch",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "mode": "both",
              "offset": 30
            }
          },
          {
            "type": "chromatic-aberration",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "intensity": 50,
              "opacity": 0.8,
              "blendMode": "normal"
            }
          }
        ]
      },
      {
        "name": "Retro VHS",
        "description": "Faded tape: washed film look, horizontal tearing, a little colour noise",
        "chain": [
          {
            "type": "vintage-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "filmType": "faded",
              "grainAmount": 40,
              "intensity": 50,
              "opacity": 0.9,
              "blendMode": "normal"
            }
          },
          {
            "type": "slice-glitch",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "mode": "horizontal",
              "offset": 15
            }
          },
          {
            "type": "color-noise",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "intensity": 30,
              "opacity": 0.5,
              "blendMode": "screen"
            }
          }
        ]
      }
    ]
  },
  {
    "id": "archive-damage",
    "name": "Archive damage",
    "blurb": "How a record gets old: nitrate film, rental tape, a faded poster, a projector. They age the whole picture and never run away.",
    "presets": [
      {
        "name": "Nitrate Decay",
        "description": "Silent-film nitrate: sepia stock, heavy grain, flecks and dust, a darkened frame edge",
        "selection": "all",
        "chain": [
          {
            "type": "vintage-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "filmType": "sepia",
              "grainAmount": 55,
              "intensity": 65
            }
          },
          {
            "type": "noise-texture",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "noiseType": "film",
              "amount": 45,
              "size": 2,
              "colorNoise": false,
              "intensity": 50
            }
          },
          {
            "type": "atmospheric-dust",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 55
            }
          },
          {
            "type": "vignette-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 55
            }
          }
        ]
      },
      {
        "name": "Vinegar Syndrome",
        "description": "Decaying acetate stock: a sour green-magenta cast, milky blacks, the frame slightly warped",
        "selection": "all",
        "chain": [
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": 28,
              "tint": -18,
              "vibrance": -20,
              "saturation": -35,
              "intensity": 70
            }
          },
          {
            "type": "liquify-warp",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "warpType": "push",
              "coveragePercent": 90,
              "strength": 22,
              "intensity": 60
            }
          },
          {
            "type": "atmospheric-fog",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 22
            }
          },
          {
            "type": "noise-texture",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "noiseType": "film",
              "amount": 25,
              "size": 1,
              "colorNoise": false,
              "intensity": 35
            }
          }
        ]
      },
      {
        "name": "Rental Tape Wear",
        "description": "A tape rented a hundred times: colour bleeding sideways, small tracking tears, chroma noise, washed colour",
        "selection": "all",
        "chain": [
          {
            "type": "vintage-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "filmType": "faded",
              "grainAmount": 30,
              "intensity": 40
            }
          },
          {
            "type": "chromatic-aberration",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 28
            }
          },
          {
            "type": "slice-glitch",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "mode": "horizontal",
              "offset": 5
            }
          },
          {
            "type": "color-noise",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 22,
              "opacity": 0.5,
              "blendMode": "screen"
            }
          },
          {
            "type": "noise-texture",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "noiseType": "digital",
              "amount": 38,
              "size": 3,
              "colorNoise": true,
              "intensity": 45
            }
          }
        ]
      },
      {
        "name": "Sun-Faded Poster",
        "description": "A poster left in a window: drained blues, warm paper, a little dust",
        "selection": "all",
        "chain": [
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": 22,
              "tint": 4,
              "vibrance": -25,
              "saturation": -55,
              "intensity": 80
            }
          },
          {
            "type": "vintage-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "filmType": "faded",
              "grainAmount": 18,
              "intensity": 45
            }
          },
          {
            "type": "atmospheric-dust",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 28
            }
          },
          {
            "type": "vignette-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 22
            }
          }
        ]
      },
      {
        "name": "CRT Phosphor",
        "description": "A tube in a dark arcade: scanlines, fringed colour, rich saturation, a dark corner falloff",
        "selection": "all",
        "chain": [
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": -8,
              "tint": 0,
              "vibrance": 20,
              "saturation": 30,
              "intensity": 70
            }
          },
          {
            "type": "chromatic-aberration",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 18
            }
          },
          {
            "type": "halftone-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "pattern": "lines",
              "dotSize": 3,
              "intensity": 30,
              "opacity": 0.5,
              "blendMode": "multiply"
            }
          },
          {
            "type": "vignette-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 60
            }
          }
        ]
      },
      {
        "name": "Photocopier Ghost",
        "description": "A copy of a copy: harsh toner dither, speckle, faint vertical banding",
        "selection": "all",
        "chain": [
          {
            "type": "dithering",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "algorithm": "atkinson",
              "colorMode": "monochrome",
              "intensity": 55,
              "opacity": 0.85,
              "blendMode": "multiply"
            }
          },
          {
            "type": "noise-texture",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "noiseType": "digital",
              "amount": 30,
              "size": 2,
              "colorNoise": false,
              "intensity": 40
            }
          },
          {
            "type": "slice-glitch",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "mode": "vertical",
              "offset": 3
            }
          }
        ]
      },
      {
        "name": "Water-Stained Print",
        "description": "A print that got wet in a drawer: blotchy tide-marks, yellowed paper, a swollen edge",
        "selection": "all",
        "chain": [
          {
            "type": "noise-texture",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "noiseType": "perlin",
              "amount": 50,
              "size": 8,
              "colorNoise": false,
              "intensity": 45,
              "opacity": 0.7,
              "blendMode": "multiply"
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": 30,
              "tint": 10,
              "vibrance": 0,
              "saturation": -30,
              "intensity": 70
            }
          },
          {
            "type": "atmospheric-fog",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 25
            }
          },
          {
            "type": "vintage-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "filmType": "sepia",
              "grainAmount": 25,
              "intensity": 35
            }
          },
          {
            "type": "liquify-warp",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "warpType": "bloat",
              "coveragePercent": 80,
              "strength": 12,
              "intensity": 50
            }
          }
        ]
      },
      {
        "name": "Projector Gate",
        "description": "A reel in a cinema projector: the frame weaves in the gate, soft vertical blur, warm stock, dark corners",
        "selection": "all",
        "chain": [
          {
            "type": "vintage-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "filmType": "kodachrome",
              "grainAmount": 45,
              "intensity": 55
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": 14,
              "tint": 0,
              "vibrance": 5,
              "saturation": 0,
              "intensity": 60
            }
          },
          {
            "type": "motion-blur-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "direction": "vertical",
              "intensity": 14
            }
          },
          {
            "type": "vignette-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 55
            }
          },
          {
            "type": "direction-movement",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "direction": "jitter",
              "speed": 1,
              "selectionAware": true
            }
          }
        ]
      }
    ]
  },
  {
    "id": "deep-survey",
    "name": "Deep Survey",
    "blurb": "Six looks from geophysics: core samples, heat maps, seismic traces. Written by an agent crew and checked in this Glitcher.",
    "presets": [
      {
        "name": "Borehole Core",
        "description": "Dense lithic pressure crushing structural boundaries into tactile mineral strata.",
        "selection": "all",
        "chain": [
          {
            "type": "emboss-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 40
            }
          },
          {
            "type": "halftone-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "pattern": "lines",
              "dotSize": 4,
              "intensity": 30
            }
          },
          {
            "type": "vintage-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "filmType": "faded",
              "grainAmount": 30,
              "intensity": 40
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": 20,
              "tint": -10,
              "vibrance": -30,
              "saturation": -40,
              "intensity": 50
            }
          }
        ]
      },
      {
        "name": "Thermal Bathymetry",
        "description": "Liquid heat gradients shearing deep contours through viscous fluid displacement.",
        "selection": "all",
        "chain": [
          {
            "type": "liquify-warp",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "warpType": "push",
              "coveragePercent": 80,
              "strength": 35,
              "intensity": 45
            }
          },
          {
            "type": "atmospheric-underwater",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 55
            }
          },
          {
            "type": "hue-shift",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 65
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": -60,
              "tint": 40,
              "vibrance": 40,
              "saturation": 35,
              "intensity": 60
            }
          }
        ]
      },
      {
        "name": "Seismic Reflection",
        "description": "Hard structural interfaces fracturing through echo and sheared mechanical strata.",
        "selection": "all",
        "chain": [
          {
            "type": "slice-glitch",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "mode": "horizontal",
              "offset": 18
            }
          },
          {
            "type": "motion-blur-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "direction": "horizontal",
              "intensity": 40
            }
          },
          {
            "type": "edge-detect-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 45
            }
          },
          {
            "type": "color-invert",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 40
            }
          },
          {
            "type": "chromatic-aberration",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 50
            }
          }
        ]
      },
      {
        "name": "Radon Luminescence",
        "description": "Micro-fissures leaking glowing radioactive particle trails across ambient subterranean fog.",
        "selection": "all",
        "chain": [
          {
            "type": "atmospheric-fog",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 50
            }
          },
          {
            "type": "noise-texture",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "noiseType": "digital",
              "amount": 40,
              "size": 1,
              "colorNoise": true,
              "intensity": 35
            }
          },
          {
            "type": "color-invert",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 25
            }
          },
          {
            "type": "cyberpunk-neon",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 45
            }
          }
        ]
      },
      {
        "name": "Magnetic Anomaly",
        "description": "Directional field lines shearing metallic mass along tight flux paths.",
        "selection": "all",
        "chain": [
          {
            "type": "direction-movement",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "direction": "jitter",
              "speed": 2,
              "selectionAware": false
            }
          },
          {
            "type": "spiral-distortion",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "type": "spiral",
              "strength": 0.05,
              "direction": "cw",
              "selectionAware": false
            }
          },
          {
            "type": "halftone-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "pattern": "lines",
              "dotSize": 3,
              "intensity": 45
            }
          },
          {
            "type": "experimental-chromatic_shift",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 55
            }
          }
        ]
      },
      {
        "name": "Lidar Scatter",
        "description": "Calibrated point-cloud scans mapping structural coordinates through diamond rasters.",
        "selection": "all",
        "chain": [
          {
            "type": "cyberpunk-glitch_scan",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 22
            }
          },
          {
            "type": "halftone-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "pattern": "diamond",
              "dotSize": 7,
              "intensity": 24
            }
          },
          {
            "type": "chromatic-aberration",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 14
            }
          }
        ]
      }
    ]
  },
  {
    "id": "deep-sea",
    "name": "Deep sea",
    "blurb": "Six looks from the ocean floor: glare, pressure, smoke, sonar, silt. Written by an agent crew and checked in this Glitcher.",
    "presets": [
      {
        "name": "Bioluminescent Flash",
        "description": "A harsh chromatic glare cutting through dense underwater gloom.",
        "selection": "all",
        "chain": [
          {
            "type": "atmospheric-underwater",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 65
            }
          },
          {
            "type": "experimental-chromatic_shift",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 60
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": -30,
              "tint": 20,
              "vibrance": 40,
              "saturation": 35,
              "intensity": 70
            }
          },
          {
            "type": "vignette-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 55
            }
          }
        ]
      },
      {
        "name": "Bathymetric Crush",
        "description": "Linear geometry warping inward under extreme deep-water pressure.",
        "selection": "all",
        "chain": [
          {
            "type": "liquify-warp",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "warpType": "pinch",
              "coveragePercent": 90,
              "strength": 65,
              "intensity": 75
            }
          },
          {
            "type": "spiral-distortion",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "type": "outsideIn",
              "strength": 0.05,
              "direction": "cw",
              "selectionAware": true
            }
          },
          {
            "type": "edge-detect-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 30
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": -40,
              "tint": -20,
              "vibrance": -30,
              "saturation": -20,
              "intensity": 60
            }
          }
        ]
      },
      {
        "name": "Hydrothermal Smoker",
        "description": "Intense heat haze and heavy particulate noise aggressively obscuring the subject.",
        "selection": "all",
        "chain": [
          {
            "type": "atmospheric-heat_haze",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 75
            }
          },
          {
            "type": "noise-texture",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "noiseType": "cellular",
              "amount": 65,
              "size": 4,
              "colorNoise": false,
              "intensity": 70
            }
          },
          {
            "type": "atmospheric-dust",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 60
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": 55,
              "tint": -35,
              "vibrance": 25,
              "saturation": 40,
              "intensity": 65
            }
          }
        ]
      },
      {
        "name": "Sonar Topography",
        "description": "Hard-edged thresholding and high-contrast lines mapping the unseen depths.",
        "selection": "all",
        "chain": [
          {
            "type": "edge-detect-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 65
            }
          },
          {
            "type": "halftone-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "pattern": "lines",
              "dotSize": 4,
              "intensity": 45
            }
          },
          {
            "type": "dithering",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "algorithm": "bayer",
              "colorMode": "monochrome",
              "colorLevels": 4,
              "serpentine": true,
              "intensity": 40
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": -40,
              "tint": 20,
              "vibrance": 40,
              "saturation": 30,
              "intensity": 45
            }
          }
        ]
      },
      {
        "name": "Silt Avalanche",
        "description": "Heavy downward motion blur and dust dragging the image into the abyss.",
        "selection": "all",
        "chain": [
          {
            "type": "direction-movement",
            "mode": "destructive",
            "enabled": true,
            "parameters": {
              "direction": "down",
              "speed": 5,
              "selectionAware": false
            }
          },
          {
            "type": "motion-blur-filter",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "direction": "vertical",
              "intensity": 85
            }
          },
          {
            "type": "atmospheric-dust",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 70
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": 20,
              "tint": -10,
              "vibrance": -45,
              "saturation": -40,
              "intensity": 60
            }
          }
        ]
      },
      {
        "name": "Abyssal Gigantism",
        "description": "Radial distortion pulling the subject aggressively outward from its center.",
        "selection": "all",
        "chain": [
          {
            "type": "liquify-warp",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "warpType": "bloat",
              "coveragePercent": 110,
              "strength": 70,
              "intensity": 80
            }
          },
          {
            "type": "experimental-kaleidoscope",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 60
            }
          },
          {
            "type": "chromatic-aberration",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "intensity": 55
            }
          },
          {
            "type": "color-grading",
            "mode": "non-destructive",
            "enabled": true,
            "parameters": {
              "temperature": 30,
              "tint": 80,
              "vibrance": 50,
              "saturation": 50,
              "intensity": 70
            }
          }
        ]
      }
    ]
  }
];
