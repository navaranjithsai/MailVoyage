import express from 'express';
import cors from 'cors';
import { json } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { hostCheck } from './middlewares/hostCheck.js';
import { errorHandler } from './middlewares/errorHandler.js';
import apiRouter from './routes/index.js'; // Import the main API router
import { config } from './utils/config.js'; // Use centralized config
import { logger } from './utils/logger.js'; // Use logger
import morgan from 'morgan'; // HTTP request logger middleware

const app = express();

// Security headers (CSP, HSTS, X-Frame-Options, no-sniff, referrer policy, …).
// Applied to every response including error responses thrown by later layers.
app.use(helmet());

// Middleware
// SECURITY: never combine origin '*' with credentials — the fetch spec
// forbids credentialed requests against a wildcard origin, and security
// scanners flag it as a misconfiguration. Map the configured CORS origin
// (which may be '*' for local dev) to a strict, explicit list instead.
const corsOriginList = config.corsOrigin === '*'
  ? []
  : config.corsOrigin.split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  // An empty allowlist rejects all cross-origin credentialed requests while
  // keeping same-origin requests working; explicit origins are echoed back.
  origin: corsOriginList.length === 0 ? false : corsOriginList,
  credentials: true,
})); // Add credentials: true for CORS
// Increase JSON body size limit to handle base64 encoded attachments and images
app.use(json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser()); // Use cookie-parser middleware

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