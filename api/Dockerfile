# Use a minimal Alpine-based Node.js runtime to reduce vulnerabilities
FROM node:24-alpine AS base

# Set the working directory in the container
WORKDIR /app

# --- Dependencies Stage ---
FROM base AS deps

# Copy package.json and package-lock.json (or yarn.lock or pnpm-lock.yaml)
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
# If using pnpm:
# COPY pnpm-lock.yaml ./

# Install dependencies
# Use --frozen-lockfile for CI/production builds
RUN npm install --frozen-lockfile
# If using pnpm:
# RUN corepack enable
# RUN pnpm install --frozen-lockfile

# --- Build Stage ---
FROM base AS builder

# Copy dependency files from the 'deps' stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the TypeScript project
RUN npm run build

# --- Production Stage ---
FROM base AS production

# Set NODE_ENV to production
ENV NODE_ENV production

# Copy built artifacts and necessary files from the 'builder' stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Copy .env.example if needed for reference, but DO NOT copy .env
# COPY --from=builder /app/.env.example ./.env.example

# Expose the port the app runs on
# Use the ARG and ENV pattern to make the port configurable at build time and runtime
ARG PORT=3001
ENV PORT=${PORT}
EXPOSE ${PORT}

# Define the command to run the application
# Use node directly to run the compiled JavaScript
CMD ["node", "dist/index.js"]
