import { createServer } from 'http';
import app from './app.js';
import { config } from './utils/config.js'; // Use centralized config
import { initializeDb } from './db/index.js'; // Adjusted path and extension
import { logger } from './utils/logger.js'; // Use logger
import { wsService } from './services/websocket.service.js'; // WebSocket service
import { startMailPoller, stopMailPoller } from './services/mail-poller.service.js'; // Background mail poller

// ============================================================================
// Serverless platform detection — platform-agnostic
// ============================================================================

/**
 * True when running inside a serverless / Functions-as-a-Service runtime
 * where long-lived processes, `listen()`, WebSocket upgrades and `setInterval`
 * background jobs are impossible or meaningless. The platform imports the
 * Express `app` directly and scales per-invocation instead.
 *
 * Detected via the standard sentinel variables each provider injects:
 * - Vercel:              VERCEL=1
 * - Netlify Functions:    NETLIFY=1
 * - AWS Lambda:           AWS_LAMBDA_FUNCTION_NAME / AWS_EXECUTION_ENV
 * - Google Cloud Run:    K_SERVICE
 * - Google Cloud Fns:    FUNCTION_NAME / FUNCTION_TARGET
 * - Azure Functions:     WEBSITE_INSTANCE_ID / FUNCTIONS_WORKER_RUNTIME
 * - Cloud Foundry & co:   SERVERLESS=1 (generic opt-out)
 * - Any platform:         RUN_SERVERLESS=0 (manual opt-out)
 *
 * Persistent hosts (Docker, VPS, Render/Railway/Fly web services, local
 * computers) set none of these, so the full server + WebSocket + poller
 * runs there unchanged.
 */
function isServerlessRuntime(): boolean {
  if (process.env.RUN_SERVERLESS === '0') return false; // manual override
  if (process.env.RUN_SERVERLESS === '1') return true;  // manual override
  return Boolean(
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.K_SERVICE ||
    process.env.FUNCTION_NAME ||
    process.env.FUNCTION_TARGET ||
    process.env.WEBSITE_INSTANCE_ID ||
    process.env.FUNCTIONS_WORKER_RUNTIME ||
    process.env.SERVERLESS
  );
}

const serverless = isServerlessRuntime();

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

    // Start the persistent server only on non-serverless platforms. On
    // serverless runtimes the platform imports the 'app' instance directly
    // and invokes it per-request; listen()/WebSocket/poller are impossible.
    if (!serverless) {
      const port = config.port;
      
      // Create HTTP server from Express app
      const server = createServer(app);
      
      // Initialize WebSocket server (graceful - won't crash if fails).
      // Skipped entirely when ENABLE_WEBSOCKET=false (serverless platforms
      // or hosts that don't support long-lived WS upgrades) — clients
      // automatically fall back to manual sync + REST flag-updates.
      if (config.websocket.enabled) {
        try {
          wsService.initialize(server);
          logger.info('WebSocket server initialized');
        } catch (error) {
          logger.warn('WebSocket server failed to initialize, running without real-time sync:', error);
          // Continue without WebSocket - graceful degradation
        }
      } else {
        logger.info('WebSocket server disabled via ENABLE_WEBSOCKET=false — clients will use manual sync');
      }

      // Start background mail poller — checks IMAP/POP3 accounts for online
      // users every POLL_INTERVAL_SEC and pushes inbox_new_mail notifications.
      // Skipped when ENABLE_MAIL_POLLER=false (free tiers with CPU/duration
      // budgets, or deployments preferring on-demand sync only).
      if (config.mailPoller.enabled) {
        try {
          startMailPoller();
        } catch (error) {
          logger.warn('Mail poller failed to start, running without proactive new-mail detection:', error);
        }
      } else {
        logger.info('Mail poller disabled via ENABLE_MAIL_POLLER=false — users sync manually');
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
    } else {
      // Serverless branch (Vercel, Netlify, AWS Lambda, GCP, Azure…):
      // the platform imports `app` (exported below) and invokes it
      // per-request. No listen()/WebSocket/poller here — clients run in
      // manual-sync + REST mode automatically.
      logger.info('Serverless runtime detected — exporting Express app for per-request invocation (no WebSocket/poller).');
    }
  })
  .catch((err: Error) => { // Add type annotation for err
    logger.error('Failed to initialize database:', err);
    process.exit(1); // Exit if DB connection fails
  });

// Export the app instance for serverless environments like Vercel
export default app;
