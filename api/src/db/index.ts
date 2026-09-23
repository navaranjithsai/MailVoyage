import { Pool } from 'pg';
import { config } from '../utils/config.js'; // Use centralized config
import { logger } from '../utils/logger.js'; // Use logger
import { AppError } from '../utils/errors.js'; // Added AppError import

// Initialize PostgreSQL pool using the validated DATABASE_URL from config.
// The pool ceiling is env-tunable (DB_POOL_MAX) so deployments with many
// concurrent users can size it to their workload; the pg library default
// of 10 starves the poller workers + API requests under load.
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.dbPool.max,
  idleTimeoutMillis: config.dbPool.idleTimeoutMs,
  // Add other pool options if needed, e.g., ssl: { rejectUnauthorized: false } for some cloud providers
});

// FAILSAFE: a transient error on one idle client (network blip, Postgres
// restart, serverless cold-start race) must NOT kill the whole server.
// The pool replaces broken clients automatically; we log loudly instead.
pool.on('error', (err, _client) => {
  logger.error('Unexpected error on idle PostgreSQL client (server will stay up):', err);
});

/**
 * Initializes the database connection pool and performs a connectivity test.
 * Schema migrations should be handled separately.
 */
export const initializeDb = async (): Promise<void> => {
  try {
    // Test the connection by acquiring a client and releasing it
    const client = await pool.connect();
    try {
      logger.info('Attempting to connect to the database...');
      await client.query('SELECT NOW()'); // Simple query to test connection
      logger.info('Database connection verified successfully.');
    } finally {
      client.release(); // Release client back to the pool
    }
  } catch (err) {
    logger.error('Failed to connect to the database or execute initial query:', err);
    throw new AppError('Database connection failed', 500, false, { context: 'initializeDb', error: err });
  }

  // Remove manual table creation - migrations should handle this
  /*
  const migrations = [
    `CREATE TABLE IF NOT EXISTS users (
       id SERIAL PRIMARY KEY,
       username VARCHAR(255) UNIQUE NOT NULL,
       email VARCHAR(255) UNIQUE NOT NULL,
       password_hash TEXT NOT NULL
     );`,
  ];

  for (const sql of migrations) {
    await pool.query(sql);
  }
  logger.info('Manual table check skipped. Use migrations.');
  */
};

export default pool;
