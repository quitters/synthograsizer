# Prompt Metadata Manager

The Prompt Metadata Manager is a tool for extracting, managing, and organizing prompt metadata from AI-generated images. It provides a comprehensive way to analyze, archive, and reuse the creative prompts behind your favorite AI artworks.

## Directory Structure

```
prompt-manager/
├── assets/           # Manager-specific assets
├── css/              # Manager-specific CSS files
├── js/               # Manager-specific JavaScript files
│   └── utils/        # Utility scripts for metadata extraction
│       └── prompt_templating.js  # Script for prompt-to-Synthograsizer template feature
├── pages/            # HTML pages
│   └── prompt-metadata-manager.html  # Main manager page with prompt-to-template UI
└── index.html        # Redirect to main manager page
```

## Key Features

- Extract metadata from AI-generated PNG images
- Support for multiple AI image generation tools (Stable Diffusion, ComfyUI, etc.)
- Batch processing for multiple images
- History management for previously extracted prompts
- Export functionality for prompts and metadata
- Template creation for reusable prompts
- **Convert Prompt to Synthograsizer Template:**
  - Select a prompt and use the "Send to Synthograsizer" button to launch an interactive template editor.
  - Edit variables, preview the template, and export to Synthograsizer format.
  - Powered by `js/utils/prompt_templating.js`.

## JavaScript Files

- `metadata_extractor.js` - Core functionality for extracting metadata from PNG files
- `prompt_templating.js` - Script for prompt-to-Synthograsizer template feature

## Getting Started

1. Open `pages/prompt-metadata-manager.html` in your browser
2. Drag and drop a PNG image or click to select one
3. View the extracted metadata and prompt information
4. Save interesting prompts to your history
5. Export prompts as needed for reuse
6. **To create a Synthograsizer template from a prompt:**
   - Click the "Send to Synthograsizer" button after extracting a prompt.
   - The template editor modal will appear, allowing you to select variables, edit names, and preview/export the template.
   - When finished, export the template for use in the Synthograsizer app.

## Development Notes

This Prompt Metadata Manager implementation is separated from the main Synthograsizer to avoid conflicts and allow independent development of each component.

---

### Prompt-to-Template Feature Details

- The prompt-to-template feature is implemented in `js/utils/prompt_templating.js`.
- The UI is integrated into `pages/prompt-metadata-manager.html` and provides an interactive modal for template creation.
- The feature allows you to:
  - Select words/phrases as variables
  - Edit variable names and values
  - Preview both template and example outputs
  - Export a Synthograsizer-compatible JSON template

If you encounter issues with the template editor, ensure that `js/utils/prompt_templating.js` is present and up-to-date.
