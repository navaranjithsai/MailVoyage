# ──────────────────────────────────────────────────────────────
# MailVoyage API — Production Dockerfile
# Multi-stage build: deps → build → production
# Uses Chainguard images (zero known CVEs)
# ──────────────────────────────────────────────────────────────

# ── Dependencies stage ────────────────────────────────────────
# latest-dev includes npm and shell, needed for installing + building
FROM cgr.dev/chainguard/node:latest-dev AS deps

WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts hardens the build, but bcrypt ships native bindings via
# its install script (node-gyp-build). Rebuild JUST that one package so the
# prebuilt binary links correctly on Chainguard/musl — other packages stay
# script-less. bcrypt's postinstall is also allow-listed in package.json.
RUN npm ci --ignore-scripts \
    && npm rebuild bcrypt \
    && npm cache clean --force

# ── Build stage ───────────────────────────────────────────────
FROM cgr.dev/chainguard/node:latest-dev AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Use build:only (tsc only) — migrations run at container startup,
# not during image build (no database available at build time)
RUN npm run build:only

# ── Production stage ──────────────────────────────────────────
# Distroless: no shell, no package manager — minimal attack surface
FROM cgr.dev/chainguard/node:latest AS production

# OCI metadata labels
LABEL org.opencontainers.image.title="MailVoyage API" \
      org.opencontainers.image.description="Backend API for MailVoyage email client" \
      org.opencontainers.image.source="https://github.com/navaranjithsai/MailVoyage" \
      org.opencontainers.image.licenses="AGPL-3.0" \
      org.opencontainers.image.vendor="navaranjithsai"

ENV NODE_ENV=production

WORKDIR /app

# Copy production artifacts. tsc compiles the app AND the .ts migrations to
# dist/ (dist/db/migrations/*.js), so the runtime image needs no TypeScript
# tooling at all — knex (a production dependency) loads the compiled .js files.
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Chainguard images run as non-root (uid 65532) by default

# App version stamp (defaults to 'latest' for local builds; CI passes the
# release tag). Visible via the image label for `docker inspect` and
# `docker images` so self-hosters can see which version they run.
ARG APP_VERSION=latest
ENV APP_VERSION=${APP_VERSION}
LABEL org.opencontainers.image.version="${APP_VERSION}"

ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

# Health check — /health is a pure liveness endpoint (no DB, no mail server).
# 30s interval with 10s start-period headroom for migrations to finish
# before the first probe; 3 consecutive failures mark the container unhealthy
# so orchestrators (compose/watchtower/portainer) can act on it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Entrypoint runs migrations (knex over the compiled .js files) and then
# boots the server. On migration failure it exits non-zero so orchestrators
# surface the breakage instead of serving a schema-less app.
CMD ["node", "dist/entrypoint.js"]
