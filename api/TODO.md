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
