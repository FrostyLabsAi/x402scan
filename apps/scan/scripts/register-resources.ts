/**
 * FORK-ONLY: register a facilitator's discovery resources into the scan DB.
 *
 * Fetches `{base}/discovery/resources` (the standard x402 discovery endpoint)
 * and ingests every item through the app's real `upsertResource` path — the
 * same code the /api/resources/sync route uses, but without the v1 SDK client
 * (whose zod network enum predates CAIP-2 ids like eip155:999).
 *
 * Usage: pnpm tsx scripts/register-resources.ts [discovery base URL]
 * (defaults to the FrostyFi facilitator: https://flow.frostylabs.ai)
 */
import 'dotenv/config';

import { upsertResource } from '../src/services/db/resources/resource';

const base = (
  process.argv[2] ?? 'https://flow.frostylabs.ai'
).replace(/\/$/, '');

async function main() {
  const res = await fetch(`${base}/discovery/resources?limit=100`);
  if (!res.ok) {
    throw new Error(`discovery fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as {
    items: {
      resource: string;
      type: 'http';
      x402Version: number;
      accepts: unknown[];
      lastUpdated: string;
      metadata?: Record<string, unknown>;
    }[];
  };

  console.log(`[register] ${body.items.length} resources from ${base}`);

  for (const item of body.items) {
    const result = await upsertResource({
      resource: item.resource,
      method: 'POST',
      type: item.type,
      x402Version: item.x402Version,
      lastUpdated: item.lastUpdated,
      metadata: item.metadata,
      accepts: item.accepts as never,
    });
    console.log(
      `[register] ${item.resource}: ${result ? `OK (${result.resource.id})` : 'skipped (no supported accepts)'}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('[register] fatal:', error);
    process.exit(1);
  });
