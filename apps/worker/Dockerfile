# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install openssl for Prisma engines on Alpine (Item 25)
RUN apk add --no-cache openssl

# Copy root and package manifests for caching
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/db/package*.json ./packages/db/
COPY apps/worker/package*.json ./apps/worker/

# Install dependencies
RUN npm ci

# Copy full monorepo source files
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY apps/worker ./apps/worker

# Generate Prisma Client & Build TypeScript
RUN npm run db:generate
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=packages/db
RUN npm run build --workspace=apps/worker

# Prune development dependencies for minimal production image footprint
RUN npm prune --production

# Production Runner Stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install openssl for Prisma client and Python3, pip, Ruff and Bandit for static analysis (Item 18 & 25)
RUN apk add --no-cache openssl python3 py3-pip && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir ruff==0.6.9 bandit==1.7.10
ENV PATH="/opt/venv/bin:$PATH"

# Copy built artifacts and production node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package*.json ./apps/worker/

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/health || exit 1

USER node

CMD ["node", "apps/worker/dist/index.js"]
