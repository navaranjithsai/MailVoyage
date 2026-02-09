import dotenvSafe from 'dotenv-safe';
import path from 'path';
import { z } from 'zod';
import { fileURLToPath } from 'url';

// Derive __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../../.env');
const envExamplePath = path.join(__dirname, '../../.env.example');

dotenvSafe.config({
  path: envPath,
  example: envExamplePath,
  allowEmptyValues: false,
});


const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().positive().default(3001),
  DATABASE_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().url().or(z.literal('*')).default('*'),
  HOST_ADDRESS: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_COOKIE_EXPIRES_IN: z.coerce.number().int().positive().default(10 * 60 * 60 * 1000), // Default 10 hours in ms
  PWD_SECRET: z.string().min(8, 'PWD_SECRET must be at least 8 characters long'),
  PG_HOST: z.string().optional(),
  PG_PORT: z.coerce.number().int().positive().optional(),
  PG_USER: z.string().optional(),
  PG_PASSWORD: z.string().optional(),
  PG_DATABASE: z.string().optional(),
  // SMTP Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.string().transform(val => val === 'true').optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
}).superRefine((data, ctx) => {
  if (!data.DATABASE_URL) {
    const pgParamsProvided = data.PG_HOST && data.PG_PORT && data.PG_USER && data.PG_DATABASE;
    if (!pgParamsProvided) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'If DATABASE_URL is not set, then PG_HOST, PG_PORT, PG_USER, and PG_DATABASE must all be defined.',
        path: ['DATABASE_URL'],
      });
    }
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  parsedEnv.error.issues.forEach(issue => {
    console.error(`  Path: ${issue.path.join('.') || 'general'}, Message: ${issue.message}`);
  });
  console.error(`Please check your .env file at "${envPath}" against the example at "${envExamplePath}".`);
  throw new Error('Invalid environment variables. Halting application.');
}

// Export validated and typed config object
export const config = {
  nodeEnv: parsedEnv.data.NODE_ENV,
  port: parsedEnv.data.PORT,
  databaseUrl: parsedEnv.data.DATABASE_URL
    ? parsedEnv.data.DATABASE_URL
    : (parsedEnv.data.PG_HOST && parsedEnv.data.PG_PORT && parsedEnv.data.PG_USER && parsedEnv.data.PG_DATABASE
        ? `postgresql://${parsedEnv.data.PG_USER}:${encodeURIComponent(parsedEnv.data.PG_PASSWORD || '')}@${parsedEnv.data.PG_HOST}:${parsedEnv.data.PG_PORT}/${parsedEnv.data.PG_DATABASE}`
        : undefined),
  corsOrigin: parsedEnv.data.CORS_ORIGIN,
  jwtSecret: parsedEnv.data.JWT_SECRET,
  jwtExpiresIn: parsedEnv.data.JWT_EXPIRES_IN,
  jwtCookieExpiresIn: parsedEnv.data.JWT_COOKIE_EXPIRES_IN,
  pwdSecret: parsedEnv.data.PWD_SECRET,
  allowedHosts: [
    'localhost',
    parsedEnv.data.PORT ? `localhost:${parsedEnv.data.PORT}` : null,
    parsedEnv.data.HOST_ADDRESS,
    process.env.VERCEL_URL,
  ].filter(Boolean).map(host => String(host).split(':')[0]) as string[],
  // SMTP Configuration
  smtp: {
    host: parsedEnv.data.SMTP_HOST,
    port: parsedEnv.data.SMTP_PORT,
    secure: parsedEnv.data.SMTP_SECURE,
    user: parsedEnv.data.SMTP_USER,
    pass: parsedEnv.data.SMTP_PASS,
    fromName: parsedEnv.data.SMTP_FROM_NAME || 'MailVoyage',
    fromEmail: parsedEnv.data.SMTP_FROM_EMAIL || parsedEnv.data.SMTP_USER,
  },
};