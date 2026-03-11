# ──────────────────────────────────────────────────────────────
# MailVoyage Frontend — Production Dockerfile
# Multi-stage build: install → build → serve via Nginx
# Uses Chainguard images (zero known CVEs)
# ──────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ─────────────────────────────
# latest-dev includes npm and shell, needed for installing + building
FROM cgr.dev/chainguard/node:latest-dev AS deps

WORKDIR /app

# Install deps first (layer cached until lock file changes)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
    && npm cache clean --force

# ── Stage 2: Build the Vite + React app ──────────────────────
FROM cgr.dev/chainguard/node:latest-dev AS builder

WORKDIR /app

# Re-use cached node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.app.json tsconfig.node.json \
     vite.config.ts tailwind.config.js postcss.config.mjs index.html ./

# Copy only the directories needed for the frontend build
COPY src/ ./src/
COPY public/ ./public/

# Set production env so Vite drops dev code paths
ENV NODE_ENV=production

# TypeScript check + Vite production build
RUN npm run build

# ── Stage 3: Serve with Nginx ────────────────────────────────
# Chainguard nginx -dev variant: zero CVEs + has shell/wget for healthchecks
FROM cgr.dev/chainguard/nginx:latest-dev AS production

# -- Metadata labels (OCI standard) --
# Note: org.opencontainers.image.url omitted — no hosted URL yet
LABEL org.opencontainers.image.title="MailVoyage" \
      org.opencontainers.image.description="Modern, privacy-focused open-source email client" \
      org.opencontainers.image.source="https://github.com/navaranjithsai/MailVoyage" \
      org.opencontainers.image.licenses="AGPL-3.0" \
      org.opencontainers.image.vendor="navaranjithsai"

# Copy the custom Nginx config
# Chainguard nginx uses /etc/nginx/nginx.conf as main config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Chainguard nginx runs as non-root by default

EXPOSE 8080

# Health check — matches the /health location in nginx.conf
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

# Use exec form for proper signal handling (graceful shutdown)
STOPSIGNAL SIGQUIT
