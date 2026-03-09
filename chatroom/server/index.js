import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import agentsRouter from './routes/agents.js';
import chatRouter from './routes/chat.js';
import { initializeGemini } from './services/gemini.js';
import { initializeImageGen } from './services/imageGen.js';
import { initializeTools } from './services/tools.js';

// Load environment variables from parent directory
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

// Prevent crashes from unhandled stream/promise errors (e.g. Gemini SDK stream parse failures)
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception (recovered):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection (recovered):', reason?.message || reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8000'],
  credentials: true
}));
app.use(express.json({ limit: '100mb' })); // Large limit for media uploads (up to 14 files)

// Initialize Gemini with API key
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('ERROR: GEMINI_API_KEY is not set in environment variables');
  console.error('Create a .env file with: GEMINI_API_KEY=your_api_key_here');
  process.exit(1);
}
initializeGemini(apiKey);
initializeImageGen(apiKey);
initializeTools(apiKey);
console.log('Gemini API initialized (text, image, search, and URL tools)');

// Routes
app.use('/api/agents', agentsRouter);
app.use('/api/chat', chatRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../client/dist/index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/agents`);
  console.log(`  POST /api/agents`);
  console.log(`  DELETE /api/agents/:id`);
  console.log(`  GET  /api/chat/stream (SSE)`);
  console.log(`  POST /api/chat/start`);
  console.log(`  POST /api/chat/stop`);
  console.log(`  POST /api/chat/inject`);
  console.log(`  GET  /api/chat/history`);
});
