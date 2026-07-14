import { ONE_MINUTE_IN_SECONDS } from '@/trigger/lib/constants';
import type { SyncConfig } from '@/trigger/types';
import { PaginationStrategy, QueryProvider, Network } from '@/trigger/types';
import { buildQuery, transformResponse } from './query';
import { FACILITATORS_BY_CHAIN } from '@/trigger/lib/facilitators';

export const hyperevmHypersyncConfig: SyncConfig = {
  cron: '*/5 * * * *',
  maxDurationInSeconds: ONE_MINUTE_IN_SECONDS * 15,
  chain: 'hyperevm',
  provider: QueryProvider.HYPERSYNC,
  paginationStrategy: PaginationStrategy.TIME_WINDOW,
  timeWindowInMs: 60 * 60 * 1000, // 1h windows — HyperEVM has ~1s blocks
  limit: 10_000,
  facilitators: FACILITATORS_BY_CHAIN(Network.HYPEREVM),
  buildQuery,
  transformResponse,
  // Keep OFF until HYPERSYNC_BEARER_TOKEN is set in the trigger.dev env
  // (HyperSync requires an Envio API token — free at
  // https://app.envio.dev/api-tokens) and one live query has been verified
  // against the known FrostyFi settlements (e.g. tx 0x615a0b2e…, block
  // 40383179). Schema in fetch/hypersync/fetch.ts checked against Envio docs
  // 2026-07-13; real FrostyFi HyperEVM activity exists since 2026-07-13.
  enabled: false,
  machine: 'small-1x',
  splitSyncByFacilitator: true,
};
