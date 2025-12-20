# MailVoyage API TODO List

## Testing
- **Set up a testing framework:** Choose and configure a testing framework (e.g., Vitest, Jest, Mocha/Chai).
- **Unit Tests:**
    - `auth.service.ts`:
        - [ ] Test user registration (password hashing).
        - [ ] Test user login (password comparison, token generation).
        - [ ] Test password reset request logic.
        - [ ] Test password reset with token logic.
        - [ ] Mock database interactions.
    - `mail.service.ts`:
        - [ ] Test `saveMailServerConfig` (mock DB).
        - [ ] Test `getMailServerConfig` (mock DB, test decryption if implemented).
        - [ ] Test `sendEmail` (mock nodemailer, test config error).
        - [ ] Test `fetchEmails` (mock imapflow, test config error, test parsing).
        - [ ] Test `listFolders` (mock imapflow).
        - [ ] Test `createFolder` (mock imapflow).
    - `token.service.ts`:
        - [ ] Test token generation.
        - [ ] Test token verification (valid, invalid, expired).
    - `user.service.ts`:
        - [ ] Test user retrieval and update logic (mock DB).
    - `utils/validationSchemas.ts`:
        - [ ] Test all Zod schemas with valid and invalid data.
- **Integration Tests:**
    - [ ] Test controller-service interaction for key auth flows (register, login).
    - [ ] Test controller-service interaction for key mail flows (send, fetch).
    - [ ] Test `auth` middleware (token validation).
    - [ ] Test `validateRequest` middleware with various schemas.
    - [ ] Test `errorHandler` middleware.
- **API Endpoint Tests (e.g., using Supertest):**
    - [ ] `/auth/register` (POST) - success, validation errors.
    - [ ] `/auth/login` (POST) - success, failure (wrong credentials), validation errors.
    - [ ] `/auth/logout` (POST) - success (if server-side invalidation is implemented).
    - [ ] `/auth/forgot-password` (POST) - success, validation errors.
    - [ ] `/auth/reset-password` (POST) - success, invalid token, validation errors.
    - [ ] `/auth/validate-token` (GET/POST) - success with valid token, failure with invalid/missing token.
    - [ ] `/mail/config` (POST) - success, validation errors, auth.
    - [ ] `/mail/send` (POST) - success, validation errors, config errors, auth.
    - [ ] `/mail/fetch` (GET/POST) - success, config errors, auth.
    - [ ] `/users/me` (GET) - success, auth.

## Environment & Configuration
- [ ] Verify `.env` loading: Add a temporary log in `src/index.ts` or `src/server.ts` to check if `process.env` variables are loaded correctly during startup. Remove before production.
- [ ] Implement actual encryption/decryption for sensitive data in `mail.service.ts` (currently placeholders).
- [ ] Define proper TypeScript types/interfaces for `MailServerConfig` and `MailData` in `mail.service.ts`.

## Code Quality & Refinement
- **Review Controller Naming:** Ensure consistency (e.g., `auth.controller.ts` is good, if an `authController.ts` (no dot) exists, consolidate and remove it).
- **Database Implementation:**
    - [ ] Design and implement database schemas for:
        - Users (already partially there via `user.model.ts` if it's a Prisma schema or similar)
        - User Mail Server Configurations (SMTP/IMAP credentials, associated with user ID)
        - Stored Emails (if caching or offline access is a feature)
        - Password Reset Tokens (with expiry)
    - [ ] Replace placeholder database logic in services (e.g., `mail.service.ts` `saveMailServerConfig`, `getMailServerConfig`) with actual database operations using `pg` or an ORM.
- **Security:**
    - [ ] Review JWT token handling: Consider HttpOnly cookies for storing tokens to mitigate XSS.
    - [ ] Implement rate limiting for sensitive endpoints (login, password reset).
    - [ ] Ensure proper input sanitization beyond Zod validation if direct DB queries are built.
- **Logout Implementation:** Clarify and implement server-side token invalidation for logout if required (e.g., token blacklist or session management).

## Features & Enhancements
- [ ] Implement actual mail fetching logic beyond placeholders in `mail.service.ts` (e.g., pagination, searching, filtering for `fetchEmails`).
- [ ] Implement `listFolders` and `createFolder` in `mail.service.ts`.
- [ ] Attachment handling for sending and fetching emails.
- [ ] Real-time notifications (e.g., using WebSockets for new mail).

## Vercel Deployment Specifics
- [ ] Ensure `vercel.json` is configured correctly if needed for serverless functions, rewrites, or cron jobs.
- [ ] Test environment variable configuration in Vercel.

<br>
---
<br>
# Migration Consolidation Action Plan

## Goal
Consolidate all existing migration files into a single, clean migration file that:
- Reflects the **current production database schema** accurately
- Does **NOT** affect existing production databases
- Allows new users cloning the repo to run one migration to set up the entire schema

---

## Phase 1: Extract Current Schema from PostgreSQL (Safe, Read-Only)

### Step 1.1: Export Schema Using pg_dump
Run this command to extract the current schema (structure only, no data):

```bash
pg_dump --schema-only --no-owner --no-privileges -h <PG_HOST> -U <PG_USER> -d <PG_DATABASE> > current_schema.sql
```

**Flags explained:**
- `--schema-only`: Only exports table structures, indexes, constraints (no data)
- `--no-owner`: Removes ownership statements (portable)
- `--no-privileges`: Removes GRANT/REVOKE statements

### Step 1.2: Review the Exported Schema
Open `current_schema.sql` and identify:
- [ ] All tables and their columns
- [ ] Primary keys and foreign keys
- [ ] Indexes
- [ ] Constraints (UNIQUE, NOT NULL, CHECK, etc.)
- [ ] Any sequences (for SERIAL/auto-increment columns)

### Step 1.3: Document Tables to Include
From the exported schema, list all application tables (exclude system tables):
- [ ] `users`
- [ ] `email_accounts`
- [ ] `smtp_accounts`
- [ ] `sent_mails`
- [ ] (Add any others found in the export)

---

## Phase 2: Create the Consolidated Migration File

### Step 2.1: Create a New Migration File
Create a single file with a new timestamp, e.g.:
```
20251220000000_consolidated_initial_schema.ts
```

### Step 2.2: Write the Migration
Structure the migration file with:

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create tables in dependency order (tables with no FKs first)
  
  // 1. Users table (no foreign keys)
  await knex.schema.createTable('users', (table) => {
    // ... columns from exported schema
  });

  // 2. Email accounts (depends on users)
  await knex.schema.createTable('email_accounts', (table) => {
    // ... columns from exported schema
  });

  // 3. SMTP accounts (depends on users)
  await knex.schema.createTable('smtp_accounts', (table) => {
    // ... columns from exported schema
  });

  // 4. Sent mails (depends on users/accounts)
  await knex.schema.createTable('sent_mails', (table) => {
    // ... columns from exported schema
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop in reverse order (tables with FKs first)
  await knex.schema.dropTableIfExists('sent_mails');
  await knex.schema.dropTableIfExists('smtp_accounts');
  await knex.schema.dropTableIfExists('email_accounts');
  await knex.schema.dropTableIfExists('users');
}
```

### Step 2.3: Add Safety Check (CRITICAL)
At the **beginning** of the `up()` function, add a check to skip if tables already exist:

```typescript
export async function up(knex: Knex): Promise<void> {
  // Safety: Skip if this is an existing database with tables already created
  const hasUsersTable = await knex.schema.hasTable('users');
  if (hasUsersTable) {
    console.log('Tables already exist. Skipping consolidated migration.');
    return;
  }

  // ... rest of migration
}
```

This ensures:
- ✅ **Production**: Migration runs but does nothing (tables exist)
- ✅ **New clones**: Migration creates all tables from scratch

---

## Phase 3: Handle Migration History

### Step 3.1: Understand the Problem
- Production database has `knex_migrations` table tracking all 13 migration files
- New clones will only have the 1 consolidated migration
- Running migrations on production should NOT re-run or fail

### Step 3.2: Solution - Mark Migration as "Already Run" on Existing DBs
The safety check in Step 2.3 handles this automatically. When the consolidated migration runs on production:
1. It checks if tables exist → they do
2. It skips all CREATE statements
3. Knex marks it as "completed" in `knex_migrations`

### Step 3.3: Alternative - Seed Migration History (Optional)
If you want the migration history to show the consolidated file on existing DBs without running it:
```sql
-- Run manually on production AFTER deploying the new migration file
INSERT INTO knex_migrations (name, batch, migration_time)
VALUES ('20251220000000_consolidated_initial_schema.ts', 
        (SELECT COALESCE(MAX(batch), 0) + 1 FROM knex_migrations),
        NOW())
ON CONFLICT DO NOTHING;
```

---

## Phase 4: Clean Up Old Migration Files

### Step 4.1: Archive Old Migrations (Recommended)
Move old files to an archive folder (keep for reference):
```
api/src/db/migrations_archive/   <- Move all 13 files here
api/src/db/migrations/           <- Only consolidated file remains
```

### Step 4.2: Or Delete Old Migrations
If you don't need history, delete all files in `migrations/` except the new consolidated one.

**⚠️ WARNING**: Only do this AFTER:
- [ ] Consolidated migration is tested on a fresh database
- [ ] Production database has been updated (safety check passed)

---

## Phase 5: Testing (Before Merging)

### Step 5.1: Test on Fresh Database
```bash
# Create a new empty database
createdb mailvoyage_test

# Update .env to point to test database temporarily
# Run migration
npm run migrate

# Verify all tables exist with correct structure
psql mailvoyage_test -c "\dt"
psql mailvoyage_test -c "\d users"
psql mailvoyage_test -c "\d email_accounts"
# ... etc
```

### Step 5.2: Test on Existing Database (Simulated Production)
```bash
# Use a copy of production or your dev database
# Run migration - should skip with "Tables already exist" message
npm run migrate
```

### Step 5.3: Verify Application Works
- [ ] Start API server
- [ ] Test login/register
- [ ] Test email account operations
- [ ] Test SMTP operations
- [ ] Test sent mails

---

## Execution Checklist

- [ ] **Phase 1**: Export schema from PostgreSQL
- [ ] **Phase 1**: Review and document all tables
- [ ] **Phase 2**: Create consolidated migration file
- [ ] **Phase 2**: Add safety check for existing tables
- [ ] **Phase 3**: Decide on migration history strategy
- [ ] **Phase 4**: Archive/delete old migration files
- [ ] **Phase 5**: Test on fresh database
- [ ] **Phase 5**: Test on existing database
- [ ] **Phase 5**: Full application testing
- [ ] **Deploy**: Commit and push changes

---

## Quick Reference Commands

```bash
# Export current schema (read-only, safe)
pg_dump --schema-only --no-owner --no-privileges -h localhost -U postgres -d mailvoyage > current_schema.sql

# List all tables in current database
psql -h localhost -U postgres -d mailvoyage -c "\dt"

# Describe a specific table
psql -h localhost -U postgres -d mailvoyage -c "\d+ users"

# Create new migration file (when ready)
npx knex migrate:make consolidated_initial_schema -x ts

# Run migrations
npm run migrate

# Rollback (if needed)
npm run migrate:rollback
```

---
