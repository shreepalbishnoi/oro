# syntax=docker/dockerfile:1
# Next.js standalone server (multi-arch: runs on the dev PC and on Oracle Ampere).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    SKIP_AUTH_MIGRATE=1
# Public values are baked into the client bundle at build time.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S oro && adduser -S -G oro -u 10002 oro
COPY --from=build --chown=oro:oro /app/.next/standalone ./
COPY --from=build --chown=oro:oro /app/.next/static ./.next/static
COPY --from=build --chown=oro:oro /app/public ./public
USER oro
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=3s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "server.js"]
