import express from 'express';
import cors from 'cors';
import { json } from 'express';
import { hostCheck } from './middlewares/hostCheck.js';
import { errorHandler } from './middlewares/errorHandler.js';
import apiRouter from './routes/index.js'; // Import the main API router
import { config } from './utils/config.js'; // Use centralized config
import { logger } from './utils/logger.js'; // Use logger
import morgan from 'morgan'; // HTTP request logger middleware

const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(json());

// Request logging (using morgan)
// Use 'combined' format for production, 'dev' for development
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev', {
  stream: {
    write: (message: string) => logger.http(message.trim()), // Pipe morgan logs through our logger - Add type
  },
}));

app.use(hostCheck); // Keep host check if necessary

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Mount API routers under /api
app.use('/api', apiRouter);

// Global error handler - Should be last middleware
app.use(errorHandler);

export default app;