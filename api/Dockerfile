# ──────────────────────────────────────────────────────────────
# MailVoyage API — Production Dockerfile  
# Multi-stage build: base → deps → build → production
# ──────────────────────────────────────────────────────────────

# ── Base stage ────────────────────────────────────────────────
FROM node:22-alpine AS base

WORKDIR /app

# Update Alpine packages to remove known CVEs
RUN apk update && apk upgrade --no-cache

# ── Dependencies stage ────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
    && npm cache clean --force

# ── Build stage ───────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ── Production stage ──────────────────────────────────────────
FROM base AS production

# OCI metadata labels
LABEL org.opencontainers.image.title="MailVoyage API" \
      org.opencontainers.image.description="Backend API for MailVoyage email client" \
      org.opencontainers.image.source="https://github.com/navaranjithsai/MailVoyage" \
      org.opencontainers.image.licenses="AGPL-3.0" \
      org.opencontainers.image.vendor="navaranjithsai"

ENV NODE_ENV=production

# Copy only production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["node", "dist/index.js"]
