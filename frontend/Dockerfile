# Frontend-Image (Next.js), Multi-Stage mit standalone-Output.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ziel des /api-Rewrites wird zur Build-Zeit ins routes-manifest eingebacken.
# Im Compose-Betrieb ist das Backend unter http://backend:8000 erreichbar.
ARG BACKEND_URL=http://127.0.0.1:8000
ARG APP_VERSION=dev
ENV BACKEND_URL=${BACKEND_URL}
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}
# Die Produktions-VM hat nur 2 GB RAM und betreibt weitere Dienste. Eine
# begrenzte V8-Heap-Größe verhindert, dass der einmalige Next-Build SSH und
# die übrigen Dienste durch Speicherdruck verdrängt.
ENV NODE_OPTIONS=--max-old-space-size=768
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Nicht als root laufen.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# standalone-Bundle + statische Assets.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
