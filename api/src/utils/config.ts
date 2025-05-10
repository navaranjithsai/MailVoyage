import dotenvSafe from 'dotenv-safe';
import path from 'path';
import { z } from 'zod';
import { fileURLToPath } from 'url'; // Import fileURLToPath

// Derive __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../../.env');
const envExamplePath = path.join(__dirname, '../../.env.example');

// Load environment variables safely
dotenvSafe.config({
  path: envPath,
  example: envExamplePath,
  allowEmptyValues: false, // Disallow empty strings, make them explicit if needed
});

// Define schema for environment variables using Zod
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().positive().default(3001),
  DATABASE_URL: z.string().url().optional(), // Made optional
  CORS_ORIGIN: z.string().url().or(z.literal('*')).default('*'),
  HOST_ADDRESS: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  // Individual PostgreSQL connection parameters (optional)
  PG_HOST: z.string().optional(),
  PG_PORT: z.coerce.number().int().positive().optional(),
  PG_USER: z.string().optional(),
  PG_PASSWORD: z.string().optional(),
  PG_DATABASE: z.string().optional(),
  // ... other variables ...
}).superRefine((data, ctx) => {
  if (!data.DATABASE_URL) {
    const allPgParamsPresent = data.PG_HOST && data.PG_PORT && data.PG_USER && data.PG_PASSWORD && data.PG_DATABASE;
    if (!allPgParamsPresent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either DATABASE_URL or all individual PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE variables must be defined.',
        path: ['DATABASE_URL'], // Points to the general area of concern
      });
    }
  }
});

// Validate environment variables
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    '❌ Invalid environment variables:',
    parsedEnv.error.issues, // Show all issues, including custom ones from superRefine
  );
  // Optionally provide more guidance
  console.error(`Check your .env file against .env.example at ${envExamplePath}`);
  throw new Error('Invalid environment variables.');
}

// Export validated and typed config object
export const config = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  port: parsedEnv.data.PORT,
  // Conditionally construct databaseUrl if not directly provided
  databaseUrl: parsedEnv.data.DATABASE_URL 
    ? parsedEnv.data.DATABASE_URL 
    : (parsedEnv.data.PG_HOST && parsedEnv.data.PG_PORT && parsedEnv.data.PG_USER && parsedEnv.data.PG_PASSWORD && parsedEnv.data.PG_DATABASE 
        ? `postgresql://${parsedEnv.data.PG_USER}:${encodeURIComponent(parsedEnv.data.PG_PASSWORD || '')}@${parsedEnv.data.PG_HOST}:${parsedEnv.data.PG_PORT}/${parsedEnv.data.PG_DATABASE}` 
        : undefined), // This case should ideally be caught by superRefine
  corsOrigin: parsedEnv.data.CORS_ORIGIN,
  jwtSecret: parsedEnv.data.JWT_SECRET,
  jwtExpiresIn: parsedEnv.data.JWT_EXPIRES_IN,
  // jwtRefreshSecret: parsedEnv.data.JWT_REFRESH_SECRET,
  // jwtRefreshExpiresIn: parsedEnv.data.JWT_REFRESH_EXPIRES_IN,
  // logLevel: parsedEnv.data.LOG_LEVEL,
  allowedHosts: [
    'localhost',
    `localhost:${parsedEnv.data.PORT}`,
    parsedEnv.data.HOST_ADDRESS,
    // Add Vercel deployment URLs if needed (can be done via env vars)
    process.env.VERCEL_URL, // Example Vercel system env var
  ].filter(Boolean).map(host => host?.split(':')[0] as string), // Filter out undefined/empty and get hostname
};