import { Pool } from 'pg';
import { config } from '../utils/config.js'; // Use centralized config
import { logger } from '../utils/logger.js'; // Use logger
import { AppError } from '../utils/errors.js'; // Added AppError import

// Initialize PostgreSQL pool using the validated DATABASE_URL from config
const pool = new Pool({
  connectionString: config.databaseUrl,
  // Add other pool options if needed, e.g., ssl: { rejectUnauthorized: false } for some cloud providers
});

pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle PostgreSQL client', { error: err });
  process.exit(-1); // Exit if the pool encounters a critical error
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
