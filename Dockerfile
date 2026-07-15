# FORK-ONLY self-host image (upstream deploys on Vercel).
# Two targets from one build:
#   --target app   → the scan UI (Next.js), runs DB bootstrap then `next start`
#   --target sync  → the transfer sync runner (replaces trigger.dev)

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

# Prisma clients are generated explicitly (pnpm 10 blocks postinstall scripts).
RUN pnpm --dir packages/internal/databases/scan db:generate \
  && pnpm --dir packages/internal/databases/transfers db:generate

# ── app ──────────────────────────────────────────────────────────────────────
FROM base AS app
# NEXT_PUBLIC_* values are inlined at build time — override in Coolify's
# build-time env. Server env is validated at boot, not build.
ARG NEXT_PUBLIC_APP_URL=https://scan.frostylabs.ai
ARG NEXT_PUBLIC_PROXY_URL=https://proxy.x402scan.com
ARG NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
ARG NEXT_PUBLIC_CDP_PROJECT_ID=placeholder
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
  NEXT_PUBLIC_PROXY_URL=$NEXT_PUBLIC_PROXY_URL \
  NEXT_PUBLIC_SOLANA_RPC_URL=$NEXT_PUBLIC_SOLANA_RPC_URL \
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
  NEXT_PUBLIC_CDP_PROJECT_ID=$NEXT_PUBLIC_CDP_PROJECT_ID \
  SKIP_ENV_VALIDATION=1
# Build-time placeholders: page-data collection imports modules that
# presence-check these at load (e.g. the Coinbase x402 router wants CDP keys).
# Runtime values come from the deploy env; these never serve traffic.
RUN CDP_API_KEY_NAME=placeholder \
  CDP_API_KEY_ID=placeholder \
  CDP_API_KEY_SECRET=placeholder \
  CDP_WALLET_SECRET=placeholder \
  STRIPE_SECRET_KEY=sk_test_placeholder \
  FREE_TIER_WALLET_NAME=placeholder \
  CRON_SECRET=build-placeholder \
  AUTH_SECRET=build-placeholder \
  DATABASE_DRIVER=pg \
  SCAN_DATABASE_URL=postgres://build:build@localhost:5432/build \
  SCAN_DATABASE_URL_UNPOOLED=postgres://build:build@localhost:5432/build \
  TRANSFERS_DB_URL=postgres://build:build@localhost:5432/build \
  pnpm turbo run build --filter=@x402scan/app
ENV NODE_ENV=production \
  PORT=3000 \
  SKIP_ENV_VALIDATION=
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=30s --start-period=90s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1
CMD ["sh", "-c", "node scripts/selfhost/db-init.mjs && pnpm --dir apps/scan start"]

# ── sync runner ──────────────────────────────────────────────────────────────
FROM base AS sync
ENV NODE_ENV=production
# The runner imports workspace packages (facilitators, transfers-db, …) by
# their built `dist/` — base only installs + generates Prisma, so build the
# library packages here (the app target gets these via its own turbo build).
RUN pnpm turbo run build --filter='./packages/**'
# This is a headless loop with no HTTP server — explicitly clear any inherited
# healthcheck so Coolify doesn't apply the app target's HTTP check and kill it.
HEALTHCHECK NONE
# 300s cadence over both chains; the runner refreshes the stats materialized
# views after every pass (the UI reads those, not the raw table).
CMD ["pnpm", "--dir", "sync/transfers", "exec", "tsx", "runner/run-sync.ts", "--loop", "300", "hyperevm", "base"]
