/**
 * FORK-ONLY self-host DB bootstrap — run at container start, before the app.
 * Idempotent:
 *  1. scan DB: prisma migrate deploy
 *  2. transfers DB: pre-create the FDW objects the upstream
 *     20260105150207_fdw_payto_origin_map migration expects — upstream
 *     hardcodes Merit's Neon host, so we point the SAME server name at our
 *     own scan DB first; the migration's IF NOT EXISTS guards then skip.
 *  3. transfers DB: prisma migrate deploy
 *  4. refresh all materialized views (the UI reads stats_* MVs)
 *
 * Env: SCAN_DATABASE_URL_UNPOOLED, TRANSFERS_DB_URL
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const require = createRequire(
  path.join(repoRoot, 'packages/internal/databases/transfers/package.json')
);
const { Client } = require('pg');

const scanUrl = process.env.SCAN_DATABASE_URL_UNPOOLED;
const transfersUrl = process.env.TRANSFERS_DB_URL;
if (!scanUrl || !transfersUrl) {
  console.error(
    '[db-init] SCAN_DATABASE_URL_UNPOOLED and TRANSFERS_DB_URL are required'
  );
  process.exit(1);
}

const migrate = (pkgDir, env) => {
  console.log(`[db-init] prisma migrate deploy: ${pkgDir}`);
  execSync('npx prisma migrate deploy', {
    cwd: path.join(repoRoot, pkgDir),
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
};

// The FDW server runs INSIDE the transfers DB's postgres instance, so it must
// reach the scan DB from that instance's point of view. When both DBs share
// one container (the recommended layout), that's localhost:5432.
const scan = new URL(scanUrl);
const fdwHost = process.env.FDW_SCAN_HOST ?? scan.hostname;
const fdwPort = process.env.FDW_SCAN_PORT ?? (scan.port || '5432');
const fdwDb = scan.pathname.replace(/^\//, '');
const fdwUser = decodeURIComponent(scan.username);
const fdwPassword = decodeURIComponent(scan.password);

const FDW_SQL = `
CREATE EXTENSION IF NOT EXISTS postgres_fdw;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_foreign_server WHERE srvname = 'x402scan_server') THEN
    CREATE SERVER x402scan_server FOREIGN DATA WRAPPER postgres_fdw
      OPTIONS (host '${fdwHost}', dbname '${fdwDb}', port '${fdwPort}');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_user_mappings
    WHERE srvname = 'x402scan_server' AND usename = current_user
  ) THEN
    CREATE USER MAPPING FOR current_user SERVER x402scan_server
      OPTIONS (user '${fdwUser}', password '${fdwPassword}');
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS foreign_source;
DO $$ BEGIN CREATE TYPE public."AcceptsScheme" AS ENUM ('exact'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."ResourceType" AS ENUM ('http'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."AcceptsNetwork" AS ENUM ('base_sepolia','avalanche_fuji','base','sei','sei_testnet','avalanche','iotex','solana_devnet','solana','polygon','optimism','hyperevm'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."Visibility" AS ENUM ('public','private'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."SessionStatus" AS ENUM ('ONRAMP_TRANSACTION_STATUS_IN_PROGRESS','ONRAMP_TRANSACTION_STATUS_SUCCESS','ONRAMP_TRANSACTION_STATUS_FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."ServerWalletType" AS ENUM ('AGENT','CHAT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public."Role" AS ENUM ('user','admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'foreign_source' AND table_name = 'Accepts'
  ) THEN
    IMPORT FOREIGN SCHEMA public LIMIT TO ("Accepts", "Resources")
      FROM SERVER x402scan_server INTO foreign_source;
  END IF;
END $$;
`;

async function main() {
  // 1. scan schema first — the FDW import below needs its tables to exist.
  migrate('packages/internal/databases/scan', {
    SCAN_DATABASE_URL_UNPOOLED: scanUrl,
  });

  // 2. FDW pre-setup on the transfers DB.
  const client = new Client({ connectionString: transfersUrl });
  await client.connect();
  try {
    console.log('[db-init] FDW pre-setup (server -> local scan DB)');
    await client.query(FDW_SQL);

    // 3. transfers migrations (the upstream FDW migration now no-ops).
    migrate('packages/internal/databases/transfers', {
      TRANSFERS_DB_URL: transfersUrl,
    });

    // 4. Baseline MV refresh so the UI has data views from first boot.
    const { rows } = await client.query(
      'SELECT matviewname FROM pg_matviews'
    );
    for (const { matviewname } of rows) {
      await client.query(`REFRESH MATERIALIZED VIEW ${matviewname}`);
    }
    console.log(`[db-init] refreshed ${rows.length} materialized views`);
  } finally {
    await client.end();
  }
  console.log('[db-init] done');
}

main().catch(error => {
  console.error('[db-init] fatal:', error);
  process.exit(1);
});
