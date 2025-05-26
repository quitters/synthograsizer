# Prompt Metadata Manager

The Prompt Metadata Manager is a tool for extracting, managing, and organizing prompt metadata from AI-generated images. It provides a comprehensive way to analyze, archive, and reuse the creative prompts behind your favorite AI artworks.

## Directory Structure

```
prompt-manager/
├── assets/           # Manager-specific assets
├── css/              # Manager-specific CSS files
├── js/               # Manager-specific JavaScript files
│   └── utils/        # Utility scripts for metadata extraction
├── pages/            # HTML pages
└── index.html        # Redirect to main manager page
```

## Key Features

- Extract metadata from AI-generated PNG images
- Support for multiple AI image generation tools (Stable Diffusion, ComfyUI, etc.)
- Batch processing for multiple images
- History management for previously extracted prompts
- Export functionality for prompts and metadata
- Template creation for reusable prompts

## JavaScript Files

- `metadata_extractor.js` - Core functionality for extracting metadata from PNG files

## Getting Started

1. Open `index.html` in your browser
2. Drag and drop a PNG image or click to select one
3. View the extracted metadata and prompt information
4. Save interesting prompts to your history
5. Export prompts as needed for reuse

## Development Notes

This Prompt Metadata Manager implementation is separated from the main Synthograsizer to avoid conflicts and allow independent development of each component.
