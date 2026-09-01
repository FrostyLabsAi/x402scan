import { ONE_MINUTE_IN_SECONDS } from '@/trigger/lib/constants';
import type { SyncConfig } from '@/trigger/types';
import { PaginationStrategy, QueryProvider, Network } from '@/trigger/types';
import {
  buildQuery,
  transformResponse,
} from '../../hyperevm/hypersync/query';
import { FACILITATORS_BY_CHAIN } from '@/trigger/lib/facilitators';

/**
 * Base sync via HyperSync, restricted to the FrostyFi facilitator only.
 *
 * Deliberately NOT the full Base facilitator set: full-ecosystem Base indexing
 * runs on CDP/BigQuery/Bitquery credentials with real query costs and is
 * already served by x402scan.com. A self-hosted instance only needs its own
 * facilitator's settlements, and HyperSync covers Base (8453) on the same
 * free-tier token used for HyperEVM.
 */
export const baseFrostyfiHypersyncConfig: SyncConfig = {
  cron: '*/5 * * * *',
  maxDurationInSeconds: ONE_MINUTE_IN_SECONDS * 15,
  chain: 'base',
  provider: QueryProvider.HYPERSYNC,
  paginationStrategy: PaginationStrategy.TIME_WINDOW,
  timeWindowInMs: 60 * 60 * 1000, // 1h windows — Base has 2s blocks
  limit: 10_000,
  facilitators: FACILITATORS_BY_CHAIN(Network.BASE).filter(
    f => f.id === 'frostyFi'
  ),
  buildQuery,
  transformResponse,
  // Keep OFF until HYPERSYNC_BEARER_TOKEN is set in the deploy env (see the
  // hyperevm hypersync config for details).
  enabled: false,
  machine: 'small-1x',
  splitSyncByFacilitator: true,
};
