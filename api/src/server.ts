import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

// Load environment variables from .env file
dotenv.config();

// Initialize PostgreSQL pool
const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

// Create tables if they don't exist
pool.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL
);
`);

const app = express();
const port = process.env.PORT || 3001;
const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';

if (!jwtSecret || jwtSecret === 'YOUR_VERY_SECRET_KEY_CHANGE_ME') {
    console.warn('WARNING: Using default or placeholder JWT secret. Set a strong JWT_SECRET in .env for production!');
}

// Middleware
app.use(cors()); // Configure origins properly for production: app.use(cors({ origin: 'YOUR_FRONTEND_URL' }));
app.use(express.json());

// --- Security Middleware --- (Refined)
app.use((req: Request, res: Response, next: NextFunction) => {
    const authority = req.headers[':authority:'] || req.headers['host'];
    const allowedHosts = [
        'localhost',
        `localhost:${port}`,
        process.env.HOST_ADDRESS
    ].filter(Boolean).map(host => host?.split(':')[0]); // Compare only hostnames

    // Ensure authority is a string before splitting
    const requestHost = typeof authority === 'string' ? authority.split(':')[0] : undefined;

    // console.log(`Request from host: ${requestHost} (Authority: ${authority})`);
    // console.log(`Allowed hosts: ${allowedHosts.join(', ')}`);

    if (!requestHost || !allowedHosts.includes(requestHost)) {
        console.warn(`Blocking request from unauthorized host: ${authority}`);
        return res.status(403).end(); // Forbidden
    }

    // Token verification for protected routes (example: /api/secure/*)
    if (req.path.startsWith('/api/secure')) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

        if (!token) {
            return res.status(401).json({ message: 'Unauthorized: No token provided.' });
        }

        try {
            const decoded = jwt.verify(token, jwtSecret!);
            // Optionally attach user info to request
            // (req as any).user = decoded; // Use a more specific type if possible
            console.log('Token verified:', decoded);
        } catch (err) {
            console.error('Token verification failed:', err);
            return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.' });
        }
    }

    next();
});

// --- API Routes --- (Refined with TS and basic logic)
app.get('/api', (req: Request, res: Response) => {
  res.json({ message: 'MailVoyage API is running! (TypeScript)' });
});

// Registration with PostgreSQL and bcrypt
app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required.' });
  }
  const client = await pool.connect();
  try {
    // Check existing username/email
    const userRes = await client.query('SELECT username, email FROM users WHERE username=$1 OR email=$2', [username, email]);
    const errors: Record<string,string> = {};
    for (const row of userRes.rows) {
      if (row.username === username) errors.username = 'Username is already taken';
      if (row.email === email) errors.email = 'Email is already registered';
    }
    if (Object.keys(errors).length) {
      return res.status(409).json({ message: 'Validation failed', errors });
    }
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    // Insert user
    const insertRes = await client.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, passwordHash]
    );
    const newUser = insertRes.rows[0];
    res.status(201).json({ message: 'Registration successful', user: newUser });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error during registration.' });
  } finally {
    client.release();
  }
});

// Login with PostgreSQL, bcrypt, and token issuance with refresh rotation
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  const client = await pool.connect();
  try {
    // Fetch user
    const userRes = await client.query('SELECT id, username, email, password_hash FROM users WHERE email=$1', [email]);
    if (!userRes.rowCount) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    const user = userRes.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    // Generate access token
    const accessToken = jwt.sign({ userId: user.id }, jwtSecret!, { expiresIn: jwtExpiresIn });
    // Generate refresh token
    const refreshToken = jwt.sign({ userId: user.id }, jwtSecret!, { expiresIn: '7d' });
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // Store refresh token
    await client.query(
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [refreshToken, user.id, expiresAt]
    );
    res.json({ message: 'Login successful', token: accessToken, refreshToken, user: { username: user.username, email: user.email } });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error during login.' });
  } finally {
    client.release();
  }
});

// Refresh token rotation
app.post('/api/auth/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ message: 'Refresh token is required' });
  const client = await pool.connect();
  try {
    // Validate stored token
    const rtRes = await client.query('SELECT user_id, expires_at FROM refresh_tokens WHERE token=$1', [refreshToken]);
    if (!rtRes.rowCount) return res.status(401).json({ message: 'Invalid refresh token' });
    const { user_id, expires_at } = rtRes.rows[0];
    if (new Date(expires_at) < new Date()) {
      await client.query('DELETE FROM refresh_tokens WHERE token=$1', [refreshToken]);
      return res.status(401).json({ message: 'Refresh token expired' });
    }
    // Rotate token
    await client.query('DELETE FROM refresh_tokens WHERE token=$1', [refreshToken]);
    const newRefreshToken = jwt.sign({ userId: user_id }, jwtSecret!, { expiresIn: '7d' });
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await client.query('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)', [newRefreshToken, user_id, newExpires]);
    const newAccessToken = jwt.sign({ userId: user_id }, jwtSecret!, { expiresIn: jwtExpiresIn });
    res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error during token refresh.' });
  } finally {
    client.release();
  }
});

// Example protected route
app.get('/api/secure/profile', (req: Request, res: Response) => {
    // If execution reaches here, the token was verified by the middleware
    // You could fetch user-specific data based on (req as any).user if you attached it
    res.json({ data: 'This is your protected user profile data.' });
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Backend server (TypeScript) listening on http://localhost:${port}`);
});
