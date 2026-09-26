# Security Policy

MailVoyage handles sensitive user and email data paths, so security reports are taken seriously.

## Supported Versions

Security fixes are prioritized for the latest release on `main`.

| Version | Supported |
|---|---|
| Latest (`main`) | Yes |
| Older tags/releases | Best effort only |

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Use GitHub Security Advisories:

- https://github.com/navaranjithsai/MailVoyage/security/advisories/new

Include as much of the following as possible:

1. Vulnerability type and affected area.
2. Reproduction steps.
3. Impact/severity assessment.
4. Proof of concept (if safe).
5. Suggested mitigation (optional).

## Content Security & Privacy Controls

MailVoyage enforces a strict Content-Security-Policy both in development
(`index.html` meta tag) and production (`nginx.conf` header). The two
policies are identical strings so dev and deployed behavior match:

- `script-src 'self'` — no remote scripts, even inside rendered mail HTML
- `object-src 'none'`, `frame-src 'self' blob:`, `frame-ancestors 'self'` — no plugins, no cross-origin embedding
- `base-uri 'self'`, `form-action 'self'` — no form hijack
- `img-src`/`style-src`/`font-src`/`media-src` allow `http:`/`https:` because mail HTML is rendered in-page and legitimately contains remote images, stylesheets, and fonts

On top of the CSP, an optional **email tracker blocker**
(`src/lib/trackerBlocker.ts`) removes open-tracking pixels (1×1 beacons,
ESP `/e/o/` and `/tr/op/` endpoints, open-log URLs) from mail HTML before
the browser fetches them, so senders cannot confirm read-state. The
preference is stored server-side in the `user_settings` table under the
key `block_trackers` and defaults to ON.

## What to Report

Examples relevant to this project:

1. Authentication/session bypass.
2. Password reset flow weaknesses.
3. CSRF/CORS misconfiguration with credentialed requests.
4. Secret leakage in repo/logs/build output.
5. Injection or unsafe HTML handling.
6. Encryption/key-handling flaws.
7. CSP bypass or tracker-blocker evasion (mail content loading that should be blocked).

## Response Expectations

Target response times (best effort):

1. Initial acknowledgment: within 72 hours.
2. Triage decision: within 7 days.
3. Fix timeline: depends on severity and reproducibility.

Critical issues are prioritized and may be patched outside normal release cadence.

## Responsible Disclosure

Please:

1. Give maintainers reasonable time to investigate and patch.
2. Avoid public disclosure before a fix or mitigation is available.
3. Share findings privately through advisories.

## Secret Exposure Incidents

If credentials are exposed (for example in `.env` or logs):

1. Rotate secrets immediately.
2. Remove tracked secret files from git.
3. Open a private advisory with scope and timeline.

## Thanks

Security researchers and responsible reporters help keep MailVoyage safe for everyone.
