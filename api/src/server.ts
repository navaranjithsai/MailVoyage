import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

// --- Basic In-Memory Store (Replace with DB later) ---
type User = {
    id: string;
    username: string;
    email: string;
    passwordHash: string; // In a real app, NEVER store plain passwords
}
const users: User[] = [];
// ------------------------------------------------------

// Load environment variables from .env file
dotenv.config();

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

// Registration
app.post('/api/auth/register', (req: Request, res: Response) => {
    const { username, email, password } = req.body;
    console.log('Register attempt:', { username, email }); // Log received data

    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required.' });
    }

    // Check if user already exists
    if (users.some(u => u.email === email)) {
        return res.status(409).json({ message: 'Email already registered.' }); // Conflict
    }

    // **IMPORTANT**: Hash the password before storing!
    // Use a library like bcrypt in a real application.
    const passwordHash = `hashed_${password}`; // Placeholder
    const newUser: User = {
        id: Date.now().toString(), // Simple unique ID
        username,
        email,
        passwordHash
    };
    users.push(newUser);
    console.log('User registered:', { id: newUser.id, username, email });
    console.log('Current users:', users.map(u => u.email)); // Log current users for debugging

    res.status(201).json({ message: 'Registration successful.' });
});

// Login
app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body;
    console.log('Login attempt:', { email }); // Log received data

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = users.find(u => u.email === email);

    // **IMPORTANT**: Compare hashed passwords!
    // Use bcrypt.compareSync(password, user.passwordHash) in a real app.
    const isPasswordCorrect = user && `hashed_${password}` === user.passwordHash; // Placeholder comparison

    if (!user || !isPasswordCorrect) {
        return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Generate JWT
    const payload = { userId: user.id, email: user.email, username: user.username };
    try {
        // Correctly pass expiresIn within the options object
        if (!jwtSecret) {
            throw new Error('JWT secret is not defined.');
        }
        const token = jwt.sign(payload, jwtSecret!, { expiresIn: jwtExpiresIn } as jwt.SignOptions);
        console.log('Login successful for:', email);
        res.json({
            message: 'Login successful',
            token,
            user: { username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Error signing JWT:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
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
