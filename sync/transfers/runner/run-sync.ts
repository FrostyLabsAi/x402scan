/**
 * FORK-ONLY standalone sync runner — the self-host replacement for
 * trigger.dev. Runs the exact same per-facilitator sync logic
 * (trigger/sync.ts syncFacilitator) as the cloud tasks, without the
 * trigger.dev runtime.
 *
 * One-shot (backfill / cron-invoked):
 *   pnpm tsx runner/run-sync.ts [hyperevm] [base]
 * Long-running loop (container entrypoint):
 *   pnpm tsx runner/run-sync.ts --loop 300 [hyperevm] [base]
 *
 * Env: TRANSFERS_DB_URL (+ DATABASE_DRIVER=pg for plain Postgres),
 *      HYPERSYNC_BEARER_TOKEN. Note: the configs' `enabled` flag gates
 *      trigger.dev registration only — this runner runs whatever chains it is
 *      asked to run.
 */
import 'dotenv/config';

import { transfersDb } from '@x402scan/transfers-db';

import { baseFrostyfiHypersyncConfig } from '../trigger/chains/evm/base/hypersync/config';
import { hyperevmHypersyncConfig } from '../trigger/chains/evm/hyperevm/hypersync/config';
import { syncFacilitator } from '../trigger/sync';

import type { SyncConfig } from '../trigger/types';

const CONFIGS: Record<string, SyncConfig> = {
  hyperevm: hyperevmHypersyncConfig,
  base: baseFrostyfiHypersyncConfig,
};

/**
 * The scan app reads from stats_* materialized views, which upstream refreshes
 * in Merit's own infra — a self-hosted instance must refresh them after each
 * sync pass or the UI never moves.
 */
async function refreshMaterializedViews() {
  const views = await transfersDb.$queryRawUnsafe<{ matviewname: string }[]>(
    'SELECT matviewname FROM pg_matviews'
  );
  for (const { matviewname } of views) {
    await transfersDb.$executeRawUnsafe(
      `REFRESH MATERIALIZED VIEW ${matviewname}`
    );
  }
  console.log(`[run-sync] refreshed ${views.length} materialized views`);
}

async function syncOnce(chains: string[]) {
  for (const chain of chains) {
    const config = CONFIGS[chain];
    if (!config) {
      console.error(
        `Unknown chain "${chain}" (known: ${Object.keys(CONFIGS).join(', ')})`
      );
      process.exitCode = 1;
      continue;
    }
    const now = new Date();
    for (const facilitator of config.facilitators) {
      console.log(`[run-sync] ${chain}: syncing ${facilitator.id}…`);
      await syncFacilitator(config, facilitator, now);
    }
  }
  await refreshMaterializedViews();
}

async function main() {
  const args = process.argv.slice(2);
  const loopIdx = args.indexOf('--loop');
  const loopSeconds = loopIdx >= 0 ? Number(args[loopIdx + 1]) : 0;
  const chains = args.filter(
    (a, i) =>
      a !== '--loop' &&
      (loopIdx < 0 || i !== loopIdx + 1) &&
      !a.startsWith('-')
  );
  const targets = chains.length > 0 ? chains : Object.keys(CONFIGS);

  if (loopSeconds > 0) {
    console.log(
      `[run-sync] looping every ${loopSeconds}s over: ${targets.join(', ')}`
    );
    // Sequential loop (not setInterval) so runs never overlap.
    for (;;) {
      const t0 = Date.now();
      try {
        await syncOnce(targets);
      } catch (error) {
        console.error('[run-sync] sync pass failed:', error);
      }
      const elapsed = Date.now() - t0;
      const waitMs = Math.max(0, loopSeconds * 1000 - elapsed);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  await syncOnce(targets);
}

main()
  .then(() => {
    if (!process.argv.includes('--loop')) process.exit(process.exitCode ?? 0);
  })
  .catch(error => {
    console.error('[run-sync] fatal:', error);
    process.exit(1);
  });
