import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

// Initialize PostgreSQL pool
const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

/**
 * Initialize database connection and run migrations
 */
export async function initializeDb() {
  try {
    await pool.connect();
    console.log('Database connected successfully');
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }

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
  console.log('Migrations applied successfully');
}

export default pool;