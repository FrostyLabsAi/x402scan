import type {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
} from '@/trigger/types';
import { logger } from '@trigger.dev/sdk/v3';

/**
 * HyperSync transfer provider (Envio) — chain-generic.
 *
 * HyperEVM is not in BigQuery / CDP / Bitquery, so we index USDC `Transfer`
 * logs via Envio HyperSync — the fastest log source on that chain. The same
 * provider also serves Base (FrostyFi-only sync) so a self-hosted instance
 * needs no CDP/BigQuery/Bitquery credentials at all. Mirrors the CDP
 * provider's semantics: USDC Transfer events in transactions sent BY the
 * facilitator address (i.e. its settlements).
 *
 * The framework paginates by time window (since/now Dates); HyperSync queries by
 * block range, so we convert the window to blocks first (RPC binary search).
 */

interface ChainSettings {
  hypersyncUrl: string;
  rpcUrl: string;
}

const CHAIN_SETTINGS: Record<string, ChainSettings> = {
  hyperevm: {
    hypersyncUrl: process.env.HYPERSYNC_URL ?? 'https://999.hypersync.xyz',
    rpcUrl: process.env.HYPEREVM_RPC_URL ?? 'https://rpc.hyperliquid.xyz/evm',
  },
  base: {
    hypersyncUrl:
      process.env.HYPERSYNC_URL_BASE ?? 'https://8453.hypersync.xyz',
    rpcUrl: process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
  },
};

function settingsFor(chain: string): ChainSettings {
  const settings = CHAIN_SETTINGS[chain];
  if (!settings)
    throw new Error(`HyperSync provider not configured for chain "${chain}"`);
  return settings;
}

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC0 =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** Raw normalized row emitted by this provider; mapped in query.ts transformResponse. */
export interface HyperSyncTransferRow {
  contract_address: string;
  transaction_from: string;
  sender: string;
  recipient: string;
  amount: string;
  transaction_hash: string;
  block_timestamp: number; // unix seconds
  log_index: number;
}

export async function fetchHyperSync(
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): Promise<TransferEventData[]> {
  const settings = settingsFor(config.chain);
  const [fromBlock, toBlock] = await blockRangeForWindow(
    settings.rpcUrl,
    since,
    now
  );
  logger.log(
    `[${config.chain}] HyperSync blocks ${fromBlock}..${toBlock} for ${facilitatorConfig.address}`
  );

  const rows = await queryTransferLogs(settings.hypersyncUrl, {
    fromBlock,
    toBlock,
    token: facilitatorConfig.token.address.toLowerCase(),
    facilitator: facilitatorConfig.address.toLowerCase(),
    limit: config.limit,
  });

  return config.transformResponse(rows, config, facilitator, facilitatorConfig);
}

// ── block-range conversion (RPC binary search) ───────────────────────────────

async function rpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[]
): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: unknown };
  if (json.error) throw new Error(`rpc ${method}: ${JSON.stringify(json.error)}`);
  return json.result as T;
}

async function latestBlockNumber(rpcUrl: string): Promise<number> {
  return parseInt(await rpc<string>(rpcUrl, 'eth_blockNumber', []), 16);
}

async function blockTimestamp(rpcUrl: string, n: number): Promise<number> {
  const b = await rpc<{ timestamp: string }>(rpcUrl, 'eth_getBlockByNumber', [
    `0x${n.toString(16)}`,
    false,
  ]);
  return parseInt(b.timestamp, 16);
}

/** Lowest block whose timestamp is >= target (unix seconds). */
async function blockAtOrAfter(
  rpcUrl: string,
  targetTs: number,
  hi: number,
  loHint = 0
): Promise<number> {
  let lo = loHint;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const ts = await blockTimestamp(rpcUrl, mid);
    if (ts < targetTs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Timestamp→block memo. Backfills walk CONTIGUOUS windows, so window N's `now`
 * boundary is window N+1's `since` boundary — caching turns ~2 full binary
 * searches per window (~50 RPC calls) into one narrow search.
 */
const blockAtTsCache = new Map<string, number>();

async function blockRangeForWindow(
  rpcUrl: string,
  since: Date,
  now: Date
): Promise<[number, number]> {
  const tip = await latestBlockNumber(rpcUrl);
  const sinceTs = Math.floor(since.getTime() / 1000);
  const nowTs = Math.floor(now.getTime() / 1000);

  const cachedFrom = blockAtTsCache.get(`${rpcUrl}:${sinceTs}`);
  const fromBlock =
    cachedFrom ?? (await blockAtOrAfter(rpcUrl, sinceTs, tip, 0));
  blockAtTsCache.set(`${rpcUrl}:${sinceTs}`, fromBlock);

  // The from-boundary is a lower bound for the to-boundary search.
  const toBlock = await blockAtOrAfter(rpcUrl, nowTs, tip, fromBlock);
  blockAtTsCache.set(`${rpcUrl}:${nowTs}`, toBlock);

  return [fromBlock, Math.max(fromBlock, toBlock)];
}

// ── HyperSync query ──────────────────────────────────────────────────────────

interface QueryParams {
  fromBlock: number;
  toBlock: number;
  token: string;
  facilitator: string;
  limit: number;
}

/**
 * Raw HTTP /query against HyperSync (schema per
 * https://docs.envio.dev/docs/HyperSync/hypersync-query, verified 2026-07-13):
 * - auth: `Authorization: Bearer <ENVIO API token>` — REQUIRED since 2025;
 *   tokens are free at https://app.envio.dev/api-tokens.
 * - `to_block` is EXCLUSIVE; pagination continues from response `next_block`.
 * - `join_mode: 'Default'` joins the transactions/blocks related to the
 *   selected logs (valid values: Default | JoinAll | JoinNothing).
 * - field names are snake_case; numeric response fields may arrive as hex
 *   strings or numbers depending on field — parse defensively via asNum().
 * - response `data` has historically been an ARRAY of batch objects (each
 *   {blocks, transactions, logs}); docs also show a single-object form —
 *   normalizeBatches() accepts both.
 *
 * We deliberately use raw HTTP instead of @envio-dev/hypersync-client: the
 * client is a native (Rust/NAPI) binding, which complicates the trigger.dev
 * deploy for no benefit at this query volume.
 */
async function queryTransferLogs(
  hypersyncUrl: string,
  p: QueryParams
): Promise<HyperSyncTransferRow[]> {
  const bearer = process.env.HYPERSYNC_BEARER_TOKEN;
  if (!bearer) {
    throw new Error(
      'HYPERSYNC_BEARER_TOKEN is not set (create one at https://envio.dev/app/api-tokens)'
    );
  }

  const rows: HyperSyncTransferRow[] = [];
  let cursor = p.fromBlock;

  while (cursor <= p.toBlock && rows.length < p.limit) {
    const query = {
      from_block: cursor,
      to_block: p.toBlock + 1, // exclusive upper bound
      logs: [{ address: [p.token], topics: [[TRANSFER_TOPIC0]] }],
      // Default join pulls the transactions + blocks related to selected logs
      // so we can filter by tx.from (the facilitator) and stamp timestamps.
      join_mode: 'Default',
      field_selection: {
        log: [
          'address',
          'topic1',
          'topic2',
          'data',
          'log_index',
          'transaction_hash',
          'block_number',
        ],
        transaction: ['hash', 'from'],
        block: ['number', 'timestamp'],
      },
    };

    const res = await fetch(`${hypersyncUrl}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify(query),
    });
    if (!res.ok) throw new Error(`HyperSync ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as HyperSyncResponse;
    const page = normalizeBatches(body.data);

    const txFrom = new Map<string, string>();
    const blockTs = new Map<number, number>();
    for (const chunk of page) {
      for (const t of chunk.transactions ?? [])
        txFrom.set(t.hash.toLowerCase(), (t.from ?? '').toLowerCase());
      for (const b of chunk.blocks ?? [])
        blockTs.set(asNum(b.number), asNum(b.timestamp));
    }

    for (const chunk of page) {
      for (const log of chunk.logs ?? []) {
        const from = txFrom.get(log.transaction_hash.toLowerCase());
        if (from !== p.facilitator) continue; // only the facilitator's settlements
        rows.push({
          contract_address: log.address,
          transaction_from: from,
          sender: topicToAddress(log.topic1),
          recipient: topicToAddress(log.topic2),
          amount: BigInt(log.data).toString(),
          transaction_hash: log.transaction_hash,
          block_timestamp: blockTs.get(asNum(log.block_number ?? 0)) ?? 0,
          log_index: asNum(log.log_index),
        });
        if (rows.length >= p.limit) break;
      }
    }

    const next = body.next_block === undefined ? undefined : asNum(body.next_block);
    if (next !== undefined && next > cursor) cursor = next;
    else break;
  }

  return rows;
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`;
}

/** HyperSync numeric fields may be numbers or hex strings — normalize. */
function asNum(v: number | string): number {
  if (typeof v === 'number') return v;
  return v.startsWith('0x') ? parseInt(v, 16) : parseInt(v, 10);
}

interface HyperSyncBatch {
  logs?: {
    address: string;
    topic1: string;
    topic2: string;
    data: string;
    log_index: number | string;
    transaction_hash: string;
    block_number?: number | string;
  }[];
  transactions?: { hash: string; from: string }[];
  blocks?: { number: number | string; timestamp: number | string }[];
}

interface HyperSyncResponse {
  data: HyperSyncBatch[] | HyperSyncBatch;
  next_block?: number | string;
}

/** `data` is an array of batches on current servers; accept an object too. */
function normalizeBatches(
  data: HyperSyncResponse['data']
): HyperSyncBatch[] {
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}
