/**
 * workflow-engine — shared workflow orchestration package
 *
 * Re-exports everything consumers need from the workflow engine,
 * templates, library, synth client, style presets, and routes.
 */

// Core engine
export {
  workflowEngine,
  extractWorkflowTags,
  parseWorkflowRequests,
  stripWorkflowTags,
} from './workflowEngine.js';

// Templates & presets
export {
  getTemplate,
  listTemplates,
  buildWorkflow,
  listTemplatesForPrompt,
  listStylesForPrompt,
} from './workflowTemplates.js';

export {
  stylePresets,
  getPreset,
  searchPresets,
  applyPreset,
  getCategories,
  getPresetsByCategory,
  listPresetsCompact,
} from './stylePresets.js';

// Persistence
export { workflowLibrary } from './workflowLibrary.js';

// Trace store (observability — every event captured per workflow run)
export { traceStore, estimateStepCost } from './traceStore.js';

// API client
export { synthClient } from './synthClient.js';

// Routes (factory)
export { createWorkflowRoutes } from './routes/workflows.js';
export { createTraceRoutes } from './routes/traces.js';
