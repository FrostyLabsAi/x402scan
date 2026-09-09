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

import { scanDb } from '@x402scan/scan-db';

import { upsertResource } from '../src/services/db/resources/resource';
import { upsertResourceResponse } from '../src/services/db/resources/response';
import { parseX402Response } from '../src/lib/x402';

const base = (
  process.argv[2] ?? 'https://app.frostylabs.ai'
).replace(/\/$/, '');

/**
 * Tags per agent subdomain keyword (Tag.name must match the marketplace
 * carousel filters in resources/(overview)/carousels.ts: Search / Crypto /
 * Utility ("AI Servers") / Trading).
 */
const TAGS_BY_HOST_KEYWORD: Record<string, string[]> = {
  frstygas: ['Crypto', 'Utility'],
  hyper: ['Crypto', 'Trading'],
};
const TAG_COLORS: Record<string, string> = {
  Search: '#38BDF8',
  Crypto: '#F59E0B',
  Utility: '#A78BFA',
  Trading: '#22C55E',
};
const FALLBACK_FAVICON = 'https://app.frostylabs.ai/favicon.ico';

/**
 * Historical payTo restorations — payout wallets an agent genuinely used in
 * the past whose Accepts mapping was lost in the 2026-08-31 blank-DB rebuild.
 * The on-chain transfers to these wallets are real settlements of the agent's
 * calls; restoring the mapping re-attributes that history in Top Servers and
 * the origin stats. Live payments always follow the CURRENT 402 payTo — a
 * historical row can never redirect a buyer's payment.
 */
const HISTORICAL_PAYTO: {
  resource: string;
  network: string;
  payTo: string;
  note: string;
}[] = [
  {
    resource: 'https://agent-hyper.frostylabs.ai/a2a',
    network: 'hyperevm',
    payTo: '0xae51f2efe70e57b994be8f7f97c4dc824c51802a',
    note: 'HL Intelligence payout wallet (Jul 2026, 5 settlements)',
  },
];

async function restoreHistoricalPayTo() {
  for (const h of HISTORICAL_PAYTO) {
    const resource = await scanDb.resources.findUnique({
      where: { resource_method: { resource: h.resource, method: 'POST' } },
      include: { accepts: true },
    });
    if (!resource) {
      console.warn(`[register] historical payTo: resource not found: ${h.resource}`);
      continue;
    }
    const exists = resource.accepts.find(
      a => a.payTo.toLowerCase() === h.payTo.toLowerCase()
    );
    if (exists) {
      console.log(`[register] historical payTo already mapped: ${h.payTo} -> ${h.resource}`);
      continue;
    }
    // Clone the current accept for the same network so scheme/asset/pricing
    // stay truthful; only the payout address differs.
    const template = resource.accepts.find(
      a => (a.network as string) === h.network
    );
    if (!template) {
      console.warn(`[register] historical payTo: no ${h.network} accept to clone on ${h.resource}`);
      continue;
    }
    await scanDb.accepts.create({
      data: {
        resourceId: resource.id,
        scheme: template.scheme,
        description: `${template.description} [historical payout wallet: ${h.note}]`,
        network: template.network,
        maxAmountRequired: template.maxAmountRequired,
        resource: template.resource,
        mimeType: template.mimeType,
        payTo: h.payTo,
        maxTimeoutSeconds: template.maxTimeoutSeconds,
        asset: template.asset,
        outputSchema: template.outputSchema ?? undefined,
        extra: template.extra ?? undefined,
      },
    });
    console.log(`[register] historical payTo restored: ${h.payTo} -> ${h.resource}`);
  }
}

/** Live-probe the endpoint's 402 body — the exact response the UI parses. */
async function probe402(resource: string): Promise<unknown> {
  try {
    const res = await fetch(resource, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status !== 402) {
      console.warn(`[register] probe ${resource}: expected 402, got ${res.status}`);
      return null;
    }
    return (await res.json()) as unknown;
  } catch (error) {
    console.warn(`[register] probe ${resource} failed:`, error);
    return null;
  }
}

/** A2A agents publish name/description on their agent card — best origin metadata we have. */
async function fetchAgentCard(
  origin: string
): Promise<{ name?: string; description?: string; iconUrl?: string } | null> {
  try {
    const res = await fetch(`${origin}/.well-known/agent-card.json`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      name?: string;
      description?: string;
      iconUrl?: string;
    };
  } catch {
    return null;
  }
}

async function tagResource(resourceId: string, originStr: string) {
  const keyword = Object.keys(TAGS_BY_HOST_KEYWORD).find(k =>
    originStr.includes(k)
  );
  if (!keyword) return [];
  const names = TAGS_BY_HOST_KEYWORD[keyword] ?? [];
  for (const name of names) {
    const tag = await scanDb.tag.upsert({
      where: { name },
      update: {},
      create: { name, color: TAG_COLORS[name] ?? '#38BDF8' },
    });
    await scanDb.resourcesTags.upsert({
      where: { resourceId_tagId: { resourceId, tagId: tag.id } },
      update: {},
      create: { resourceId, tagId: tag.id },
    });
  }
  return names;
}

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
    if (!result) {
      console.log(`[register] ${item.resource}: skipped (no supported accepts)`);
      continue;
    }
    const resourceId = result.resource.id;
    const originStr = new URL(item.resource).origin;

    // 1. Store the live 402 body as the ResourceResponse — the server detail
    // page only DISPLAYS resources with a stored response (listOriginsWithResources
    // filters `response: { isNot: null }`); the form path stores it via probe,
    // so the script must too. Fall back to the discovery item's own shape.
    const body402 =
      (await probe402(item.resource)) ??
      ({ x402Version: item.x402Version, accepts: item.accepts } as unknown);
    const parsed = parseX402Response(body402);
    if (parsed.success) {
      await upsertResourceResponse(resourceId, parsed.data);
    } else {
      console.warn(
        `[register] ${item.resource}: 402 body failed to parse — server page will not list it:`,
        parsed.errors.slice(0, 3)
      );
    }

    // 2. Origin metadata from the agent card (name/description; the scraper
    // path would find nothing on an A2A subdomain — there is no HTML page).
    const card = await fetchAgentCard(originStr);
    await scanDb.resourceOrigin.update({
      where: { origin: originStr },
      data: {
        title: card?.name ?? null,
        description: card?.description ?? null,
        favicon: card?.iconUrl ?? FALLBACK_FAVICON,
      },
    });

    // 3. Tags (drive the marketplace category carousels).
    const tags = await tagResource(resourceId, originStr);

    console.log(
      `[register] ${item.resource}: OK (${resourceId}) response=${parsed.success ? 'stored' : 'FAILED'} title=${JSON.stringify(card?.name ?? null)} tags=[${tags.join(', ')}]`
    );
  }

  await restoreHistoricalPayTo();
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('[register] fatal:', error);
    process.exit(1);
  });
