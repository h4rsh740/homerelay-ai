# Multi-stage Dockerfile for HomeRelay AI
# Packages Next.js 16 + MCP Streamable HTTP Server in a single production container

# ── 1. Base Stage ─────────────────────────────────────────────────────────────
FROM node:22-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# ── 2. Dependencies Stage ─────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# Install all dependencies (including build tools like typescript/turbopack)
RUN npm ci --include=dev

# ── 3. Build Stage ────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app
COPY . .
# Set build-time dummy secrets for static page generation
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_NAME="HomeRelay AI"
ENV STRICT_SUPABASE=false
ENV USE_PGLITE=true
RUN npm run build

# ── 4. Runner Stage ───────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# Create non-root system user for secure container execution
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create writable directory for PGlite database
RUN mkdir -p /app/.pglite && chown -R nextjs:nodejs /app/.pglite

# Copy required assets and node_modules from builder
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Set ownership to unprivileged user
RUN chown -R nextjs:nodejs /app

USER nextjs

# Render, Railway, Fly pass PORT via environment (defaults to 3000)
ENV PORT=3000
ENV MCP_PORT=3001
ENV NODE_ENV=production

EXPOSE 3000
EXPOSE 3001

# Health check against Next.js public endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/tasks').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start both Next.js and MCP Server via unified production supervisor
CMD ["node", "scripts/start-production.mjs"]
