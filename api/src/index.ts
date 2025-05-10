import app from './app.js';
import { config } from './utils/config.js'; // Use centralized config
import { initializeDb } from './db/index.js'; // Adjusted path and extension
import { logger } from './utils/logger.js'; // Use logger

// Initialize Database
initializeDb()
  .then(() => {
    logger.info('Database initialized successfully.');

    // Start the server only if not in a serverless environment (like Vercel)
    // Vercel will import the 'app' instance directly.
    if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
      const port = config.port;
      app.listen(port, () => {
        logger.info(`Server listening on http://localhost:${port}`);
      });
    }
  })
  .catch((err: Error) => { // Add type annotation for err
    logger.error('Failed to initialize database:', err);
    process.exit(1); // Exit if DB connection fails
  });

// Export the app instance for serverless environments like Vercel
export default app;
