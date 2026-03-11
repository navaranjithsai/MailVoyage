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
RUN npm ci --ignore-scripts \
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

# Copy only production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Chainguard images run as non-root (uid 65532) by default

ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["node", "dist/index.js"]
