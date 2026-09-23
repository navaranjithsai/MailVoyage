# Deploying MailVoyage with Docker

This guide covers the complete Docker lifecycle for self-hosters and cloud
deployments: building images locally, pulling prebuilt images from Docker Hub,
running the stack, and updating to a new release.

## Prerequisites

- Docker Engine 24+ (with `docker compose` v2)
- A PostgreSQL server (any host: Docker, Neon, Supabase, RDS, self-hosted)
- SMTP credentials (for OTP / password-reset emails)

---

## Option A — Prebuilt images (fastest)

Both images are published to Docker Hub:

- `navaranjithsai/mailvoyage` — frontend (nginx, serves the SPA + proxies
  `/api` and `/ws` to the API container)
- `navaranjithsai/mailvoyage-api` — backend API (runs migrations on boot)

### 1. Create an environment file

```bash
# .env next to your docker-compose.prod.yml
DATABASE_URL=postgresql://user:password@host:5432/mailvoyage
JWT_SECRET=<32+ random chars>
PWD_SECRET=<8+ random chars>

# Public hostname(s) users will type in the browser. Required when accessing
# the app via a domain or reverse proxy; localhost always works.
ALLOWED_HOSTS=mail.example.com

# Optional — see "Tunables" below for defaults and meaning
# DB_POOL_MAX=20
# POLL_INTERVAL_SEC=120
# POLL_MAX_USERS_PER_CYCLE=25
# ENABLE_WEBSOCKET=true
# ENABLE_MAIL_POLLER=true
```

### 2. Pull and run

```bash
MAILVOYAGE_TAG=latest docker compose -f docker-compose.prod.yml up -d
```

The API container runs database migrations on every boot (idempotent —
already-applied migrations are skipped). On migration failure the container
exits non-zero instead of serving a schema-less app, so `docker compose ps`
will show it clearly.

> **Standalone frontend container note:** the frontend's nginx config proxies
> `/api` and `/ws` to the hostname `api` (the compose service name). Running
> the frontend image OUTSIDE docker-compose (plain `docker run`) requires
> either a container/link named `api` on the same network, or placing your
> own reverse proxy in front. The compose file is the supported path.

### 3. Verify

```bash
docker compose -f docker-compose.prod.yml ps      # both services healthy
curl http://localhost/health                       # → {"status":"UP",...}
curl http://localhost:3001/health                  # API directly
docker logs mailvoyage-api                          # migration + boot logs
```

---

## Option B — Build from source

```bash
# Frontend (from repo root)
docker build -t mailvoyage-web:local .

# API
docker build -t mailvoyage-api:local ./api

# Stamp the version into the image label (optional, for traceability)
docker build --build-arg APP_VERSION=v2026.9.1 -t mailvoyage-web:local .
docker build --build-arg APP_VERSION=v2026.9.1 -t mailvoyage-api:local ./api
```

Then run with your own compose override pointing at the local tags, or edit
the `image:` fields in `docker-compose.prod.yml`.

---

## Updating to a new release

Prebuilt (Docker Hub) deployments:

```bash
docker compose -f docker-compose.prod.yml pull     # fetch new images
docker compose -f docker-compose.prod.yml up -d    # recreate changed services
```

- Migrations are applied automatically by the new container's entrypoint.
- The frontend bundle is immutable (content-hashed); browsers pick up the
  new version after a refresh.
- Rollback: `MAILVOYAGE_TAG=<previous-tag> docker compose ... up -d` —
  note that NEW migrations are not auto-rolled-back; if a release added
  migrations you must roll them back manually (`npm run migrate:rollback`
  from a source checkout) before running a much older image.

Check which version you're running:

```bash
docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' \
  $(docker compose -f docker-compose.prod.yml ps -q api)
```

---

## Health checks

Both images ship Docker `HEALTHCHECK`s:

- **web**: `wget` against the nginx `/health` endpoint (30s interval).
- **api**: `fetch` against the Express `/health` endpoint — a pure liveness
  probe (no DB/mail-server dependency), with a start period that gives
  migrations time to finish before the first probe counts.

`docker compose ps` reports health; orchestrators (Watchtower, Portainer,
Kubernetes) can act on repeated failures.

---

## Tunables (all optional, safe defaults)

| Variable | Default | Purpose |
|---|---|---|
| `DB_POOL_MAX` | 20 | Postgres pool ceiling — raise for many concurrent users |
| `DB_POOL_IDLE_TIMEOUT_MS` | 30000 | Idle client recycling |
| `POLL_INTERVAL_SEC` | 120 | Background mail-poller cadence |
| `POLL_MAX_USERS_PER_CYCLE` | 25 | Users checked per cycle (fair rotation across all) |
| `POLL_ACCOUNT_TIMEOUT_SEC` | 15 | Per-account mail-server check timeout |
| `POLL_IMMEDIATE_DEBOUNCE_SEC` | 20 | Debounce for login-triggered polls |
| `ENABLE_WEBSOCKET` | true | Set `false` behind hosts that can't upgrade sockets |
| `ENABLE_MAIL_POLLER` | true | Set `false` on CPU-limited free tiers; users sync manually |
| `ALLOWED_HOSTS` | — | Comma-separated hostnames the API may serve |

Every degraded mode logs a clear line at boot (e.g. "Mail poller disabled
via ENABLE_MAIL_POLLER=false — users sync manually") — nothing is silent.

---

## Non-Docker notes

- **VPS / local without Docker**: `npm run install:all`, `npm run build:all`,
  then `npm run start:api` (which runs `migrate:latest` first) and serve the
  frontend `dist/` with any static server proxying `/api` and `/ws`.
- **Vercel / Netlify / Lambda / GCP / Azure**: the API detects serverless
  automatically and exports the app for per-request invocation — WebSocket
  and poller are skipped by design; clients fall back to manual sync. Set
  `ALLOWED_HOSTS` to your platform domain. Run migrations once from your
  machine or CI: `npm --prefix api run migrate:latest`.
