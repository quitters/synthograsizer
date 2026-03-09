# External Libraries Required

This directory should contain the following external libraries for full animated media support:

## Required Libraries

### 1. libgif-js (for GIF parsing)
- **File**: `libgif.js`
- **Source**: https://github.com/buzzfeed/libgif-js
- **Purpose**: Parse and extract frames from animated GIF files
- **Size**: ~50KB

### 2. gif.js (for GIF generation - optional)
- **File**: `gif.js` and `gif.worker.js`
- **Source**: https://github.com/jnordberg/gif.js
- **Purpose**: Generate animated GIFs from canvas frames
- **Size**: ~70KB total

## Installation

1. Download libgif-js:
   ```bash
   wget https://raw.githubusercontent.com/buzzfeed/libgif-js/master/libgif.js
   ```

2. Download gif.js (optional, for export):
   ```bash
   wget https://raw.githubusercontent.com/jnordberg/gif.js/master/dist/gif.js
   wget https://raw.githubusercontent.com/jnordberg/gif.js/master/dist/gif.worker.js
   ```

## Usage

The libraries are loaded in the HTML file:

```html
<!-- Add to index.html before main.js -->
<script src="libs/libgif.js"></script>
<script src="libs/gif.js"></script>
```

## Fallback Behavior

If these libraries are not present:
- GIF files will load as static images (first frame only)
- GIF export will not be available
- Video files will still work using native HTML5 video APIs

## Notes

- The application will function without these libraries but with reduced functionality
- Error messages will indicate when libraries are missing
- Consider using a CDN for production deployments
