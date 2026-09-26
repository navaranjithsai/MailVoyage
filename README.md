<div align="center">

# MailVoyage - Modern Email Client for Developers and Users

![Docker Pulls](https://img.shields.io/docker/pulls/navaranjithsai/mailvoyage)
[![GitHub Total Clones](https://img.shields.io/badge/dynamic/json?color=success&label=Clones&query=%24.clones.total_count&url=https%3A%2F%2Fgist.githubusercontent.com%2Fnavaranjithsai%2F67a85ef027cb66937c5f1b17b1436e8d%2Fraw%2Ftraffic.json&logo=github)](https://github.com/navaranjithsai/MailVoyage)
[![GitHub license](https://img.shields.io/github/license/navaranjithsai/MailVoyage
)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Made with Love](https://img.shields.io/badge/Made%20with-❤️-red.svg)](https://github.com/navaranjithsai)

---
</div>

MailVoyage is a modern, developer-friendly email client designed to simplify email management and testing. It provides a unified platform for sending, receiving, and testing emails across multiple providers, all in one place. Built with React, TypeScript, and Vite, MailVoyage is optimized for performance, scalability, and ease of use. The application supports serverless deployments, making it ideal for integration with platforms like Vercel. The current auth stack also includes two-factor authentication, password change in Settings, and rate-limited challenge flows.

## Documentation and Wiki

For complete setup, architecture notes, deployment guides, known issues, and roadmap updates, check the project Wiki:

- https://github.com/navaranjithsai/MailVoyage/wiki

The README is the quick-start overview. The Wiki is the source for deeper and continuously updated documentation.


## Recent Commits

<div align="center">

<picture>
  <source
    srcset="https://github-commits-card.navaranjith-sai1234.workers.dev/?theme=dark&repo=MailVoyage&u=navaranjithsai&count=3"
    media="(prefers-color-scheme: dark)"
  />
  <source
    srcset="https://github-commits-card.navaranjith-sai1234.workers.dev/?u=navaranjithsai&repo=MailVoyage&theme=light"
    media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
  />
  <img src="https://github-commits-card.navaranjith-sai1234.workers.dev/?u=navaranjithsai&repo=MailVoyage&theme=dark" alt="GitHub Commits Card Demo" />
</picture>

<br/>
</div>
<br/>

## Features

### For Developers
- **Email Testing**: Test emails with real SMTP configurations and preview them in a user-friendly interface.
- **Multi-Provider Support**: Configure and test emails from various providers like Gmail, SMTP2Go, and others.
- **Advanced Search**: Filter emails by sender, subject, date range, attachments, and more.
- **Serverless Integration**: Deploy the backend API seamlessly on Vercel for serverless environments.

### For Users
- **Unified Inbox**: Manage emails from multiple providers in one place.
- **Email Sending**: Send emails with attachments, priority settings, and advanced formatting.
- **Offline-first Experience**: Read cached inbox data, queue actions offline, and sync when connectivity returns.
- **Tracker Blocking**: Invisible open-tracking pixels (1×1 beacons, ESP `/e/o/` and `/tr/op/` endpoints) are stripped from incoming mail before they load — the sender never learns the mail was opened. Toggle in Settings → Privacy; a yellow notice appears above any mail where pixels were blocked.
- **Dark Mode**: Enjoy a modern UI with light and dark theme support.
- **Account Security**: Two-factor authentication, recovery codes, and password change in Settings.

## Tech Stack
- **Frontend**: React 19, TypeScript 5.9, TailwindCSS, Framer Motion, Dexie v4 (IndexedDB)
- **Backend**: Node.js 20+, Express 5, PostgreSQL, Knex migrations
- **Email Protocols**: IMAP (ImapFlow), POP3 (node-pop3), SMTP (Nodemailer)
- **Validation**: Zod 4 for schema validation
- **Real-time**: WebSocket (ws) for live sync
- **Security**: AES-256-GCM client-side encryption (Web Crypto API), HttpOnly cookie JWT, TOTP 2FA, recovery codes, and auth rate limiting
- **Deployment**: Docker, Docker Compose, and Vercel (with serverless limitations)

---

## Architecture

### Inbox Data Flow

```
Mail Server (Gmail, Outlook, etc.)
       │
       ▼  (IMAP / POP3 — read-only fetch)
  API Server (Express)
       │
       ├─► inbox_cache (PostgreSQL) ── server-side cache, latest N per account
       │
       ▼  (REST API response)
  Frontend (React)
       │
       ▼  (AES-256-GCM encrypted)
  IndexedDB (Dexie) ── local offline cache, latest N per account
       │
       ▼
  UI Components (InboxPage, EmailPage, DashboardPage)
```

### Key Architectural Decisions

| Decision | Rationale |
|---|---|
| **All operations are local-only** | Delete, archive, star, read/unread, and label changes only affect the local copy in IndexedDB and/or the server-side `inbox_cache`. They **never** modify or send commands back to the mail server. This protects the user's actual mailbox. |
| **IMAP + POP3 support** | Both protocols are supported for fetching. IMAP provides richer metadata (read/unread flags, UIDs, multiple mailboxes). POP3 is supported as a fallback for providers that don't offer IMAP. |
| **Per-user cache limit contract** | Each user sets their own cache limit (5–100, default 15) in Settings → Data Management. The server-side `inbox_cache` keeps only the latest N mails per account and evicts anything older — enforced on every sync and immediately when the limit is lowered. |
| **"Load older" mails are client-only** | When a user digs into history beyond the cached window, those older mails are fetched **transit-only**: stored in the browser's IndexedDB (Dexie) but **never** persisted to the server cache. This keeps the cache limit meaningful and prevents dug-up history from reappearing on other devices. |
| **Client-side encryption** | Sensitive mail fields (from, subject, body) are encrypted with AES-256-GCM before storing in IndexedDB. The encryption key is derived per-session. |
| **Minimal API calls** | Settings are cached in `localStorage` to avoid repeated API requests. The dashboard refreshes from local Dexie on focus/visibility change rather than hitting the API. |
| **Fair poller scheduling** | The background mail poller rotates through ALL connected users across cycles (env-tunable `POLL_MAX_USERS_PER_CYCLE`), with bounded parallel mail-server connections and per-account locks — no user is starved at any scale. |
| **Failsafe-first boot** | Transient DB errors never kill the server; the WebSocket server, poller, and every sync layer have independent catch/cooldown paths. Serverless runtimes are auto-detected (Vercel, Netlify, AWS Lambda, GCP, Azure) and degrade to manual sync with explicit boot logs. |

---

## Security & Account Protection

MailVoyage now ships with the current account-security flow exposed in the app and backend:

- Login may return a short-lived 2FA challenge instead of setting the session cookie immediately.
- Authenticator-app sign-in, email OTP fallback, and recovery codes are available for second-factor verification.
- Password change is available in Settings and requires the current password.
- Password reset uses a signed challenge bound to the browser tab session.
- Login, 2FA, and password-reset flows are rate-limited server-side.
- Auth cookies remain HttpOnly and SameSite-strict in the current implementation.

---

## IMAP & POP3 Support

### IMAP (recommended)
- Full support for mailbox selection, UID-based incremental sync, read/unread flags
- Supports **SSL**, **STARTTLS**, and **NONE** security modes
- Pagination via sequence number ranges
- TLS minimum version: 1.2

### POP3
- Fetches from the single POP3 inbox (no mailbox concept)
- Uses `UIDL` for message listing, `RETR` for full message retrieval
- Supports **SSL** and unencrypted connections
- No read/unread flag support (POP3 protocol limitation — all fetched mails default to unread)
- Pagination via message number ranges (newest first)

### Configuration

When adding an email account, set `incoming_type` to either `IMAP` or `POP3`:

| Field | Description | Example |
|---|---|---|
| `incoming_type` | Protocol to use | `IMAP` or `POP3` |
| `incoming_host` | Mail server hostname | `imap.gmail.com` or `pop.gmail.com` |
| `incoming_port` | Server port | `993` (IMAP SSL), `995` (POP3 SSL), `143` (IMAP), `110` (POP3) |
| `incoming_security` | Connection security | `SSL`, `STARTTLS`, or `NONE` |

---

## Local-Only Operations

The following operations only affect the local copy of emails. They **do not** send any commands to the original mail server:

| Operation | What happens locally |
|---|---|
| **Delete** | Removes the mail from IndexedDB (Dexie) |
| **Archive** | Moves mail to `ARCHIVE` mailbox in Dexie, adds `archived` label, marks as read |
| **Star / Unstar** | Toggles `isStarred` flag in Dexie |
| **Mark Read / Unread** | Toggles `isRead` flag in Dexie |
| **Labels** | Stored as a JSON array in the Dexie record |

> **Important**: The original mail on the mail server remains completely untouched. These changes only persist in the local browser database and the server-side `inbox_cache`.

---

## Cache Management

### Cache Limit

The inbox cache limit is a **per-user preference** controlling how many emails are kept per email account:

- **Default**: 15 emails per account
- **Configurable**: 5–100 via Settings → Data Management (slider)
- **Applies to both**: Server-side PostgreSQL cache and client-side IndexedDB
- **Rotation**: When new mails are synced, the oldest mails beyond the limit are automatically deleted
- **Decreasing the limit**: Requires an explicit confirmation dialog — the app predicts exactly how many cached mails will be removed and the confirm action is styled as a destructive (red) action. The server cache is trimmed immediately on save.

### How it works

1. **Sync from server**: IMAP/POP3 fetch → save to `inbox_cache` table → trim to the user's limit
2. **Save to client**: API response → encrypt → save to IndexedDB
3. **Settings cached**: The cache limit is stored in `localStorage` (`inbox_cache_limit`) to avoid repeated API calls; every sync path reads the user's own value — no hardcoded numbers
4. **Load older mail**: Fetching history beyond the cached window returns mails **client-only** (Dexie), never persisting them to the server cache — the limit stays meaningful and other devices never see the dug-up history

### Scalability & degradation tunables

All optional with safe defaults — see [`api/.env.example`](api/.env.example) and [`DEPLOYMENT.md`](DEPLOYMENT.md):

| Variable | Default | Purpose |
|---|---|---|
| `DB_POOL_MAX` | 20 | PostgreSQL pool ceiling |
| `POLL_INTERVAL_SEC` | 120 | Background poller cadence |
| `POLL_MAX_USERS_PER_CYCLE` | 25 | Users checked per poll cycle (fair rotation) |
| `ENABLE_WEBSOCKET` | true | Disable on hosts without socket upgrades |
| `ENABLE_MAIL_POLLER` | true | Disable on CPU-limited free tiers |
| `ALLOWED_HOSTS` | — | Extra hostnames the API may serve (cloud deploys) |

---

## Installation

### Prerequisites
- Node.js (v20 or higher)
- PostgreSQL (for local development)

### Steps
1. Clone the repository:
  ```bash
  git clone https://github.com/navaranjithsai/MailVoyage.git
  cd mailvoyage
  ```

2. Install dependencies:
  ```bash
  npm install
  npm run install:api
  ```

3. Set up environment variables:
  - Create `api/.env` from `api/.env.example` and fill in required values.
  - Keep secrets only in `api/.env` (this file is git-ignored).
  - Keep `api/.env.example` committed so contributors know required variables.
  - If you want password-reset email delivery or email OTP fallback for 2FA, configure the `SMTP_*` values.
  - Optional 2FA tuning is available through `TOTP_ENCRYPTION_KEY`, `TWO_FACTOR_*`, and `AUTH_RATE_LIMIT_*` variables.

  Example:
  ```bash
  # macOS / Linux
  cp api/.env.example api/.env
  ```

  ```powershell
  # Windows PowerShell
  Copy-Item api/.env.example api/.env
  ```

  > Important: API config expects `JWT_COOKIE_EXPIRES_IN` (uppercase).

4. Start the development server:
  ```bash
  npm run dev
  ```

## Running Locally

### Development (hot reload)

```bash
npm run dev        # frontend (Vite, http://localhost:5173) + API (Express, http://localhost:3001) together
# or split terminals:
npm run dev:web    # frontend only
npm run dev:api    # API only (includes a migrate:latest on start)
```

The Vite dev server proxies `/api` and `/ws` to `localhost:3001`, so live
WebSocket sync works out of the box during development.

### Production build, local verification

Run the compiled output exactly as a server would — the closest local check
to a real deployment short of Docker:

```bash
# 1. Build both
npm run build:all          # frontend → dist/ ; API → api/dist/ (+ API migrations run)

# 2. Start the production API (runs migrations first, then serves on :3001)
npm run start:api

# 3. Serve the built frontend with the same /api + /ws proxies (port 4173)
npm run preview:prod
```

Open **http://localhost:4173/** — this exercises the real minified bundle,
the production API boot path, migrations, and WebSocket sync together.

### Verify the stack

```bash
curl http://localhost:3001/health   # API liveness → {"status":"UP",...}
curl http://localhost:4173/health   # preview-served frontend (via proxy)
```

For Docker, serverless, and other production environments, see
[DEPLOYMENT.md](DEPLOYMENT.md) and the [Deployment](#deployment) section below.

## Deployment

### Docker (Recommended)

Pull the pre-built image from Docker Hub:

```bash
docker pull navaranjithsai/mailvoyage:latest
docker run -d -p 80:80 navaranjithsai/mailvoyage:latest
```

Or build locally:

```bash
docker build -t mailvoyage .
docker run -d -p 80:80 mailvoyage
```

### Docker Compose (Full Stack)

Run both frontend and API together:

```bash
# Create root-level .env for docker-compose variable interpolation
# (DATABASE_URL, JWT_SECRET, PWD_SECRET, HOST_ADDRESS, CORS_ORIGIN, etc.)

# Start all services
docker compose -f docker-compose.prod.yml up -d
```

> Compose note: this repo's compose file now uses API-native keys (`HOST_ADDRESS`, `PWD_SECRET`) to match runtime config directly.

### CI/CD — Local Build + Automatic Release Pipeline

MailVoyage uses a **local-first versioning** workflow. You bump the version locally,
and CI handles the rest (tag, Docker image, GitHub Release) — zero bot commits.

#### Developer Workflow

```bash
# 1. Bump version + lint + build everything
npm run release

# 2. Commit your changes (version bump is included)
git add -A
git commit -m "feat: my awesome feature"

# 3. Push — CI creates tag, Docker image, and GitHub Release
git push origin main
```

**Available scripts:**

| Script | What it does |
|---|---|
| `npm run version:bump` | Bump CalVer version in `package.json` files only |
| `npm run release` | Bump + lint + build frontend & API |
| `npm run release:quick` | Bump + build frontend only (skip lint & API) |

**Version format:** CalVer `YYYY.M.BUILD` (e.g. `2026.2.1`, `2026.2.2`, `2026.3.1`).
Build number auto-increments per month from existing git tags.

#### What CI does on push to `main`

1. **Reads** the version from `package.json` (already bumped locally)
2. **Creates** an annotated git tag (`v2026.2.4`)
3. **Builds** a multi-platform Docker image (`linux/amd64` + `linux/arm64`)
4. **Pushes** to [Docker Hub](https://hub.docker.com/r/navaranjithsai/mailvoyage)
5. **Creates** a GitHub Release with auto-generated release notes

#### CI Pipelines

| Workflow | Trigger | Purpose |
|---|---|---|
| **Docker Publish** (`docker-publish.yml`) | Push to main | Tag, build Docker image, publish to Docker Hub, GitHub Release |
| **CI** (`ci.yml`) | Manual (`workflow_dispatch`) | Lint, type-check, build verification + profile-based tests (frontend + API) |
| **CodeQL** (`codeql.yml`) | Manual (`workflow_dispatch`) | Security vulnerability scanning |

#### Test Running (Local + Manual CI)

- Quick local check: `npm run test`
- Interactive selector (phase menu): `npm run test:ui`
- Phase runs: `npm run test:phase1` through `npm run test:phase7`
- Combined phase run: `npm run test:all:phases`
- Coverage run (frontend + API): `npm run test:coverage:all`

> Phase 6 covers frontend cache-config and older-mail ID-resolution logic; Phase 7 covers deployment/scalability logic (cache-limit clamping, serverless detection, poller round-robin, older-pull detection, entrypoint guards).

Manual CI test runs support `test_profile` values:

- `quick`: fast default checks
- `full`: all test phases
- `coverage`: full phases + coverage reports + artifact upload

For the full non-invasive testing model and command matrix, see:

- Wiki: https://github.com/navaranjithsai/MailVoyage/wiki/Testing-and-QA

> **Note:** CI and CodeQL are manual during active development to conserve GitHub Actions minutes.
> Dependabot is configured via GitHub Settings (not a workflow file).
> Once the project stabilizes, CI and CodeQL can be switched back to automatic triggers.

#### Setup (one-time)

1. Go to [Docker Hub → Account Settings → Security](https://hub.docker.com/settings/security)
   and create an **Access Token** (Read & Write).

2. Go to your GitHub repo → **Settings → Secrets and variables → Actions** and add:
   | Secret Name | Value |
   |---|---|
   | `DOCKERHUB_USERNAME` | `navaranjithsai` |
   | `DOCKERHUB_TOKEN` | The access token from step 1 |

3. That's it — `GITHUB_TOKEN` is provided by GitHub automatically.

**Docker tags per build:** `navaranjithsai/mailvoyage:2026.2.1`, `navaranjithsai/mailvoyage:latest`, `navaranjithsai/mailvoyage:sha-abc1234`

### Vercel (Serverless)

MailVoyage also supports serverless deployment on Vercel:
1. Link the repository to your Vercel account.
2. Configure environment variables in the Vercel dashboard (including `ALLOWED_HOSTS` set to your deployment domain).
3. Deploy the frontend and backend as separate projects or as a monorepo — the repo ships a `vercel.json` rewrite so the frontend can proxy `/api` to a separately-hosted API via the `API_BASE_URL` env var.

Note: WebSocket-based real-time sync is not available on Vercel serverless runtime. The app automatically falls back to manual refresh/sync behavior.

### Other platforms

The API auto-detects its runtime and adapts — no code changes needed per platform:

| Platform | Mode | Notes |
|---|---|---|
| Docker / docker-compose | Full | Migrations run at container startup; healthchecks included |
| VPS / own server / local | Full | `npm run start:api` runs migrations then serves |
| Render / Railway / Fly (web service) | Full | Set `ALLOWED_HOSTS` to your platform domain (Render's is auto-detected) |
| Vercel / Netlify / AWS Lambda / GCP / Azure | Serverless | API only; WS + poller skipped by design; clients use manual sync |
| Free tiers (CPU-limited) | Reduced | Set `ENABLE_MAIL_POLLER=false` / `ENABLE_WEBSOCKET=false` to fit budgets |

For the complete build → pull → run → update lifecycle (including rollback notes and the tunables table), see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Log in |
| `POST` | `/api/auth/login/2fa/verify` | Complete authenticator-based 2FA login |
| `POST` | `/api/auth/login/2fa/otp/request` | Request email OTP for 2FA login |
| `POST` | `/api/auth/login/2fa/otp/verify` | Complete email OTP 2FA login |
| `POST` | `/api/auth/login/2fa/recovery/verify` | Complete 2FA login with a recovery code |
| `POST` | `/api/auth/logout` | Log out |
| `POST` | `/api/auth/forgot-password` | Request password reset |
| `POST` | `/api/auth/reset-password` | Reset password using OTP + challenge |
| `GET`  | `/api/auth/validate-token` | Validate active session token |
| `GET`  | `/api/auth/2fa/status` | Check whether 2FA is enabled |
| `POST` | `/api/auth/2fa/setup/init` | Start 2FA setup or reconfigure existing 2FA |
| `POST` | `/api/auth/2fa/setup/verify` | Verify a 2FA setup code and finalize enrollment |
| `POST` | `/api/auth/2fa/disable` | Disable 2FA with the current password |
| `POST` | `/api/auth/2fa/recovery/regenerate` | Regenerate recovery codes with the current password |
| `GET`  | `/api/auth/test-smtp` | Test SMTP connectivity |
| `GET`  | `/api/auth/ws-token` | Get WebSocket token |

If 2FA is enabled, `POST /api/auth/login` returns a challenge payload instead of a cookie until one of the second-factor routes succeeds.

### User Accounts
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/users/profile` | Read the current profile |
| `PUT`  | `/api/users/profileUpdate` | Update username/email for the signed-in user |
| `PUT`  | `/api/users/password` | Change password using the current password |
| `GET`  | `/api/users/preferences` | Read user preferences |
| `PUT`  | `/api/users/preferences` | Update user preferences |

### Email Accounts
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/email-accounts` | List all email accounts |
| `POST` | `/api/email-accounts` | Add a new email account (IMAP or POP3) |
| `PUT`  | `/api/email-accounts/:id` | Update an email account |
| `DELETE` | `/api/email-accounts/:id` | Delete an email account |

### Inbox (IMAP & POP3)
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/inbox/cached` | Get cached mails from server DB (fast, bounded by user's cache limit) |
| `GET`  | `/api/inbox/fetch` | Fetch mails directly from mail server |
| `POST` | `/api/inbox/sync` | Fetch from IMAP/POP3 + update server cache (older-mail pulls are returned client-only) |
| `GET`  | `/api/inbox/status` | Lightweight new-mail check (no message download) |
| `POST` | `/api/inbox/search` | Search mailbox on server (IMAP search) |
| `POST` | `/api/inbox/flag-updates` | Apply batched read/star updates (idempotent) |
| `GET`  | `/api/inbox/batch-status/:batchId` | Check if a flag batch was already applied |
| `GET`  | `/api/inbox/accounts` | List email accounts for dropdown |
| `GET`  | `/api/inbox/settings` | Get inbox settings (cache limit + tracker blocker flag) |
| `PUT`  | `/api/inbox/settings` | Update inbox settings (lowering the limit evicts older cached mails; `blockTrackers` toggles email tracker blocking) |
| `GET`  | `/api/inbox/settings/preview-eviction` | Predict how many mails a lower limit would remove |

### Sending
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/mail/send` | Send an email via SMTP |

### Sent Mails
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/sent-mails` | List sent mails (paginated) |
| `GET`  | `/api/sent-mails/thread/:threadId` | Get sent mail by thread ID |
| `GET`  | `/api/sent-mails/:id` | Get sent mail by ID |

### Mail Routes (Scaffold/Partial)
The following routes exist but are currently scaffold or partial implementations and may return placeholder responses:

- `POST /api/mail/config`
- `GET /api/mail/config`
- `GET /api/mail/fetch`
- `GET /api/mail/folders`
- `POST /api/mail/folders`

---

## Database Schema

### Key Tables

| Table | Purpose |
|---|---|
| `users` | User accounts (auto-incrementing integer ID) |
| `email_accounts` | IMAP/POP3/SMTP configurations per user |
| `inbox_cache` | Server-side cached inbox mails (latest N per account) |
| `user_settings` | Per-user settings (cache limit, tracker blocker flag, etc.) |
| `smtp_accounts` | SMTP sending configurations |

### Migrations

Run migrations with:
```bash
cd api
npm run migrate:latest
```

Rollback with:
```bash
npm run migrate:rollback
```

---

## Client-Side Storage

### IndexedDB (Dexie v4)

| Store | Contents | Encrypted Fields |
|---|---|---|
| `inboxMails` | Inbox emails (synced from server) | fromAddress, fromName, subject, textBody, htmlBody |
| `sentMails` | Sent mail records | — |
| `drafts` | Local drafts | — |
| `syncCheckpoints` | Last sync timestamps per table | — |
| `pendingSync` | Offline operation queue | — |

Encryption uses **AES-256-GCM** via the Web Crypto API. Keys are derived per browser session.

---

## Development Focus

We are currently prioritizing the implementation and refinement of key features to enhance the MailVoyage experience. Our main areas of focus include:

- **Dashboard Stats**: Fixing and improving the accuracy, display, and real-time updates of email statistics on the dashboard.
- **Entire Dashboard Actions**: Refining user interactions, such as email management, folder operations, and overall dashboard responsiveness.

If you are a developer interested in contributing to these ongoing efforts or have suggestions for other features, please refer to the Contributing section below or start a discussion in the repository.

## Contributing
We welcome contributions to MailVoyage! To get started:
1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Submit a pull request with a detailed description.

Please review these project guides before opening a PR:

- [Contributing Guide](CONTRIBUTING.md)
- [Support Guide](SUPPORT.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## License
MailVoyage is open-source and licensed under the [GNU Affero General Public License v3.0](LICENSE).

## Contact
For questions or support, start a discussion in the Discussion tab.

For security vulnerabilities, do not open a public issue. Use private reporting via [GitHub Security Advisories](https://github.com/navaranjithsai/MailVoyage/security/advisories/new).

---
<p style="text-align:center;"><strong>Tech4File - Simplifying Tech for Developers and Users</strong>
</p>