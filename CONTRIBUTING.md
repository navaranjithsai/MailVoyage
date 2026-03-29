# Contributing to MailVoyage

Thanks for taking the time to contribute.

MailVoyage is built for real users and real developers who want a privacy-first, local-first email experience without unnecessary API cost. Contributions of all sizes are welcome: bug fixes, docs, UX polish, tests, and security improvements.

## Quick Start

1. Fork the repository.
2. Create a branch from `main`.
3. Install dependencies and run the app locally.
4. Make focused changes.
5. Open a pull request with clear context.

## Local Setup

```bash
npm install
npm run install:api
cp api/.env.example api/.env
npm run dev
```

Windows PowerShell:

```powershell
npm install
npm run install:api
Copy-Item api/.env.example api/.env
npm run dev
```

## Before You Open a PR

Run these checks locally:

```bash
npm run lint
npm run build:all
```

If your change touches auth, email sync, or storage behavior, include a short test note in the PR body describing what you manually validated.

## What We Value in Contributions

1. Clear problem statement: what was broken or missing.
2. Focused changes: avoid unrelated edits in the same PR.
3. Practical safety: especially around auth, secrets, and user data.
4. Good docs: if behavior changes, update docs/wiki in the same PR.

## Project-Specific Guidelines

### 1) Privacy and Safety First

- Never commit secrets (`.env`, API keys, tokens, SMTP passwords).
- If you accidentally expose secrets, rotate them immediately and report through the security process in `SECURITY.md`.
- Prefer secure defaults when adding new settings.

### 2) Local-First Architecture

- Keep API usage intentional and efficient.
- Avoid adding repeated polling or extra API calls without a strong reason.
- Preserve the app's local-first behavior whenever possible.

### 3) Auth and Security Changes

When changing auth/reset/session flows, include:

- Threat model summary (1-3 bullets).
- Why the change is safer than before.
- Any migration or backward-compatibility note.

### 4) UI Contributions

- Keep UX accessible and responsive (desktop + mobile).
- If UI changes are visible, add/update screenshots in the wiki screenshots folders.

## Commit and PR Style

Use clear commit messages. Conventional style is preferred:

- `feat: add X`
- `fix: resolve Y`
- `docs: update Z`
- `chore: cleanup`

PR checklist:

1. Problem and solution are explained.
2. No secrets added.
3. Lint/build pass locally.
4. Docs/wiki updated if needed.

## Release Notes for Maintainers

MailVoyage uses CalVer and local-first release bumping.

```bash
npm run release
```

That command updates versions and validates build/lint before pushing.

## Need Help?

If you are unsure where to start, open an issue with:

- what you want to improve,
- where you are blocked,
- and what you already tried.

We'll help you scope it.
