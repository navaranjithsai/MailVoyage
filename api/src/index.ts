import { createServer } from 'http';
import app from './app.js';
import { config } from './utils/config.js'; // Use centralized config
import { initializeDb } from './db/index.js'; // Adjusted path and extension
import { logger } from './utils/logger.js'; // Use logger
import { wsService } from './services/websocket.service.js'; // WebSocket service
import { startMailPoller, stopMailPoller } from './services/mail-poller.service.js'; // Background mail poller

// ============================================================================
// Global safety nets — prevent network errors (ECONNRESET, etc.) from
// crashing the entire API server. These fire when an EventEmitter (like
// ImapFlow or net.Socket) emits 'error' with no listener, or when a Promise
// rejects without a .catch(). We log but do NOT exit so the server stays up.
// ============================================================================
process.on('uncaughtException', (err: Error) => {
  logger.error('🔴 Uncaught exception (server will stay up):', err);
});
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('🔴 Unhandled promise rejection (server will stay up):', reason);
});

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

      // Start background mail poller — checks IMAP/POP3 accounts for online users
      // every 120s and pushes inbox_new_mail WebSocket notifications.
      try {
        startMailPoller();
      } catch (error) {
        logger.warn('Mail poller failed to start, running without proactive new-mail detection:', error);
      }
      
      server.listen(port, () => {
        logger.info(`Server listening on http://localhost:${port}`);
        logger.info(`WebSocket available at ws://localhost:${port}/ws`);
      });

      // Graceful shutdown
      const shutdown = () => {
        logger.info('Shutting down server...');
        stopMailPoller();
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
