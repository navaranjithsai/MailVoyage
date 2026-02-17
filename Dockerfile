# ──────────────────────────────────────────────────────────────
# MailVoyage Frontend — Production Dockerfile
# Multi-stage build: install → build → serve via Nginx
# Produces a minimal (~45 MB) image with only static assets
# ──────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ─────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Install deps first (layer cached until lock file changes)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
    && npm cache clean --force

# ── Stage 2: Build the Vite + React app ──────────────────────
FROM node:22-alpine AS builder

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
FROM nginx:1.27-alpine AS production

# -- Metadata labels (OCI standard) --
# Note: org.opencontainers.image.url omitted — no hosted URL yet
LABEL org.opencontainers.image.title="MailVoyage" \
      org.opencontainers.image.description="Modern, privacy-focused open-source email client" \
      org.opencontainers.image.source="https://github.com/navaranjithsai/MailVoyage" \
      org.opencontainers.image.licenses="AGPL-3.0" \
      org.opencontainers.image.vendor="navaranjithsai"

# Remove the default nginx site
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy the custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Non-root: Nginx alpine image supports running as unprivileged user
# Adjust ownership so nginx worker (pid 1 runs as root, workers as nginx)
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chmod -R 755 /usr/share/nginx/html \
    # Ensure nginx can write to temp dirs
    && chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

EXPOSE 80

# Health check — matches the /health location in nginx.conf
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/health || exit 1

# Use exec form for proper signal handling (graceful shutdown)
STOPSIGNAL SIGQUIT
CMD ["nginx", "-g", "daemon off;"]
