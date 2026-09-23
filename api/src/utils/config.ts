import dotenvSafe from 'dotenv-safe';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Derive __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../../.env');
const envExamplePath = path.join(__dirname, '../../.env.example');

// SERVERLESS COMPATIBILITY: on platforms like Vercel/Netlify/Lambda the
// environment comes from the dashboard, not a .env file — and dotenv-safe
// unconditionally reads the example file and THROWS when required variables
// are missing. Only run it when both files actually exist (local dev /
// self-hosted); otherwise trust the real process.env, which is fully
// validated by the zod schema below either way.
if (fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  dotenvSafe.config({
    path: envPath,
    example: envExamplePath,
    allowEmptyValues: false,
  });
}


const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().positive().default(3001),
  DATABASE_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().url().or(z.literal('*')).default('*'),
  HOST_ADDRESS: z.string().optional(),
  // Explicit host allowlist for the host-check middleware: comma-separated
  // domains (no port), e.g. "myapp.com,api.myapp.com". When set, the
  // middleware accepts exactly these hosts plus the auto-detected platform
  // hosts below — needed for ANY cloud deployment (Render, Railway, Fly,
  // AWS, Azure, GCP) where the Host header is the platform domain.
  ALLOWED_HOSTS: z.string().optional(),
  // Render.com injects RENDER_EXTERNAL_HOSTNAME automatically.
  RENDER_EXTERNAL_HOSTNAME: z.string().optional(),
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
  TOTP_ENCRYPTION_KEY: z.string().min(32).optional(),
  TWO_FACTOR_ISSUER: z.string().min(2).default('MailVoyage'),
  TWO_FACTOR_LOGIN_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(300),
  TWO_FACTOR_SETUP_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(600),
  TWO_FACTOR_OTP_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(600),
  TWO_FACTOR_OTP_RESEND_INTERVAL_SEC: z.coerce.number().int().positive().default(30),
  TWO_FACTOR_RECOVERY_CODE_COUNT: z.coerce.number().int().min(5).max(20).default(10),
  AUTH_RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(900),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_LOCK_SEC: z.coerce.number().int().positive().default(300),
  // ── Scalability tunables (all optional with safe defaults) ─────────────
  // PostgreSQL pool ceiling — raise for deployments with many concurrent
  // users; each poller worker + API request holds a client while working.
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // Background mail poller cadence and fan-out.
  POLL_INTERVAL_SEC: z.coerce.number().int().positive().default(120),
  POLL_MAX_USERS_PER_CYCLE: z.coerce.number().int().positive().default(25),
  POLL_ACCOUNT_TIMEOUT_SEC: z.coerce.number().int().positive().default(15),
  // Debounce window for immediate (login-triggered) polls, so reconnect
  // storms don't open one mail-server connection per user simultaneously.
  POLL_IMMEDIATE_DEBOUNCE_SEC: z.coerce.number().int().positive().default(20),
  // ── Feature switches (graceful degradation) ─────────────────────────────
  // ENABLE_WEBSOCKET=false disables the WS server entirely (serverless /
  // restricted hosts). Clients already fall back to manual sync + REST
  // flag-updates, so nothing breaks — real-time pings simply stop.
  ENABLE_WEBSOCKET: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
  // ENABLE_MAIL_POLLER=false disables the background poller (free tiers
  // with strict CPU/duration budgets, or deployments that only want the
  // manual Sync button). Clients fetch new mail on demand instead.
  ENABLE_MAIL_POLLER: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),
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

const derivedTotpEncryptionKey = parsedEnv.data.TOTP_ENCRYPTION_KEY
  ? parsedEnv.data.TOTP_ENCRYPTION_KEY
  : crypto.createHash('sha256').update(parsedEnv.data.JWT_SECRET).digest('hex');

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
  // Host allowlist for the host-check middleware. Composed of:
  // 1. localhost (local dev, and Docker where the browser hits localhost)
  // 2. HOST_ADDRESS / ALLOWED_HOSTS — explicitly configured custom domains
  // 3. Platform-injected hostnames (Vercel, Render) so cloud deploys work
  //    out of the box instead of 403-ing every request on the platform domain
  // Ports are stripped (the middleware compares hostname only) and the
  // list is de-duplicated.
  allowedHosts: [
    'localhost',
    parsedEnv.data.HOST_ADDRESS,
    parsedEnv.data.ALLOWED_HOSTS?.split(',').map(h => h.trim()).filter(Boolean),
    process.env.VERCEL_URL,
    parsedEnv.data.RENDER_EXTERNAL_HOSTNAME,
  ]
    .flat()
    .filter((host): host is string => Boolean(host))
    .map(host => String(host).split(':')[0])
    .filter((host, idx, arr) => arr.indexOf(host) === idx),
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
  twoFactor: {
    issuer: parsedEnv.data.TWO_FACTOR_ISSUER,
    encryptionKey: derivedTotpEncryptionKey,
    loginTokenTtlSec: parsedEnv.data.TWO_FACTOR_LOGIN_TOKEN_TTL_SEC,
    setupTokenTtlSec: parsedEnv.data.TWO_FACTOR_SETUP_TOKEN_TTL_SEC,
    otpTokenTtlSec: parsedEnv.data.TWO_FACTOR_OTP_TOKEN_TTL_SEC,
    otpResendIntervalSec: parsedEnv.data.TWO_FACTOR_OTP_RESEND_INTERVAL_SEC,
    recoveryCodeCount: parsedEnv.data.TWO_FACTOR_RECOVERY_CODE_COUNT,
  },
  authRateLimit: {
    windowSec: parsedEnv.data.AUTH_RATE_LIMIT_WINDOW_SEC,
    maxAttempts: parsedEnv.data.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
    lockSec: parsedEnv.data.AUTH_RATE_LIMIT_LOCK_SEC,
  },
  // Scalability tunables — see the schema above for defaults and intent.
  dbPool: {
    max: parsedEnv.data.DB_POOL_MAX,
    idleTimeoutMs: parsedEnv.data.DB_POOL_IDLE_TIMEOUT_MS,
  },
  mailPoller: {
    enabled: parsedEnv.data.ENABLE_MAIL_POLLER,
    intervalSec: parsedEnv.data.POLL_INTERVAL_SEC,
    maxUsersPerCycle: parsedEnv.data.POLL_MAX_USERS_PER_CYCLE,
    accountTimeoutSec: parsedEnv.data.POLL_ACCOUNT_TIMEOUT_SEC,
    immediateDebounceSec: parsedEnv.data.POLL_IMMEDIATE_DEBOUNCE_SEC,
  },
  websocket: {
    enabled: parsedEnv.data.ENABLE_WEBSOCKET,
  },
};