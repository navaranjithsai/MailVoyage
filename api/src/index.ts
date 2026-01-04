import { createServer } from 'http';
import app from './app.js';
import { config } from './utils/config.js'; // Use centralized config
import { initializeDb } from './db/index.js'; // Adjusted path and extension
import { logger } from './utils/logger.js'; // Use logger
import { wsService } from './services/websocket.service.js'; // WebSocket service

// Initialize Database
initializeDb()
  .then(() => {
    logger.info('Database initialized successfully.');

    // Start the server only if not in a serverless environment (like Vercel)
    // Vercel will import the 'app' instance directly.
    if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
      const port = config.port;
      
      // Create HTTP server from Express app
      const server = createServer(app);
      
      // Initialize WebSocket server (graceful - won't crash if fails)
      try {
        wsService.initialize(server);
        logger.info('WebSocket server initialized');
      } catch (error) {
        logger.warn('WebSocket server failed to initialize, running without real-time sync:', error);
        // Continue without WebSocket - graceful degradation
      }
      
      server.listen(port, () => {
        logger.info(`Server listening on http://localhost:${port}`);
        logger.info(`WebSocket available at ws://localhost:${port}/ws`);
      });

      // Graceful shutdown
      const shutdown = () => {
        logger.info('Shutting down server...');
        wsService.shutdown();
        server.close(() => {
          logger.info('Server closed');
          process.exit(0);
        });
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    }
  })
  .catch((err: Error) => { // Add type annotation for err
    logger.error('Failed to initialize database:', err);
    process.exit(1); // Exit if DB connection fails
  });

// Export the app instance for serverless environments like Vercel
export default app;
