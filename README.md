<div align="center">

# MailVoyage - Modern Email Client for Developers and Users

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Made with Love](https://img.shields.io/badge/Made%20with-❤️-red.svg)](https://github.com/navaranjithsai)

---
</div>

MailVoyage is a modern, developer-friendly email client designed to simplify email management and testing. It provides a unified platform for sending, receiving, and testing emails across multiple providers, all in one place. Built with React, TypeScript, and Vite, MailVoyage is optimized for performance, scalability, and ease of use. The application supports serverless deployments, making it ideal for integration with platforms like Vercel.


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
- **Folder Management**: Create, list, and organize email folders.
- **Dark Mode**: Enjoy a modern UI with light and dark theme support.

## Tech Stack
- **Frontend**: React 19, TypeScript 5.9, TailwindCSS, Framer Motion, Dexie v4 (IndexedDB)
- **Backend**: Node.js 20+, Express 5, PostgreSQL, Knex migrations
- **Email Protocols**: IMAP (ImapFlow), POP3 (node-pop3), SMTP (Nodemailer)
- **Validation**: Zod 4 for schema validation
- **Real-time**: WebSocket (ws) for live sync
- **Security**: AES-256-GCM client-side encryption (Web Crypto API), HttpOnly cookie JWT
- **Deployment**: Vercel for serverless backend and frontend hosting

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
| **Cache limit rotation** | Both server-side (`inbox_cache` table) and client-side (IndexedDB) enforce a configurable cache limit (default 15). When new mails are synced, older mails beyond the limit are automatically pruned. |
| **Client-side encryption** | Sensitive mail fields (from, subject, body) are encrypted with AES-256-GCM before storing in IndexedDB. The encryption key is derived per-session. |
| **Minimal API calls** | Settings are cached in `localStorage` to avoid repeated API requests. The dashboard refreshes from local Dexie on focus/visibility change rather than hitting the API. |

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

The inbox cache limit controls how many emails are kept per email account:

- **Default**: 15 emails per account
- **Configurable**: 5–100 via Settings → Data Management
- **Applies to both**: Server-side PostgreSQL cache and client-side IndexedDB
- **Rotation**: When new mails are synced, the oldest mails beyond the limit are automatically deleted

### How it works

1. **Sync from server**: IMAP/POP3 fetch → save to `inbox_cache` table → trim to limit
2. **Save to client**: API response → encrypt → save to IndexedDB → trim to limit
3. **Settings cached**: The cache limit is stored in `localStorage` (`inbox_cache_limit`) to avoid repeated API calls

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
  - Create `.env` files in `api` directory.
  - Refer to `.env.example` for required variables.

4. Start the development server:
  ```bash
  npm run dev
  ```

## Deployment
MailVoyage is optimized for serverless environments. To deploy on Vercel:
1. Link the repository to your Vercel account.
2. Configure environment variables in the Vercel dashboard.
3. Deploy the frontend and backend as separate projects or as a monorepo.

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Log in |
| `POST` | `/api/auth/logout` | Log out |
| `POST` | `/api/auth/forgot-password` | Request password reset |
| `GET`  | `/api/auth/ws-token` | Get WebSocket token |

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
| `GET`  | `/api/inbox/cached` | Get cached mails from server DB (fast) |
| `GET`  | `/api/inbox/fetch` | Fetch mails directly from mail server |
| `POST` | `/api/inbox/sync` | Fetch from IMAP/POP3 + update server cache |
| `GET`  | `/api/inbox/accounts` | List email accounts for dropdown |
| `GET`  | `/api/inbox/settings` | Get inbox settings (cache limit) |
| `PUT`  | `/api/inbox/settings` | Update inbox settings |

### Sending
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/mail/send` | Send an email via SMTP |

### Sent Mails
| Method | Endpoint | Description |
|---|---|---|
| `GET`  | `/api/sent-mails` | List sent mails (paginated) |
| `GET`  | `/api/sent-mails/thread/:id` | Get a specific sent mail |

---

## Database Schema

### Key Tables

| Table | Purpose |
|---|---|
| `users` | User accounts (auto-incrementing integer ID) |
| `email_accounts` | IMAP/POP3/SMTP configurations per user |
| `inbox_cache` | Server-side cached inbox mails (latest N per account) |
| `user_settings` | Per-user settings (cache limit, etc.) |
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

## License
MailVoyage is open-source and licensed under the MIT License.

## Contact
For questions or support, start a discussion in the Discussion tab.

---
<p style="text-align:center;"><strong>Tech4File - Simplifying Tech for Developers and Users</strong>
</p>