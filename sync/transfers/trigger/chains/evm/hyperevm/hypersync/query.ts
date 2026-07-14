import type {
  SyncConfig,
  Facilitator,
  TransferEventData,
  FacilitatorConfig,
} from '@/trigger/types';
import type { HyperSyncTransferRow } from '@/trigger/fetch/hypersync/fetch';

/**
 * HyperSync builds its query internally (see fetch/hypersync/fetch.ts), so
 * buildQuery only exists to satisfy the SyncConfig shape.
 */
export function buildQuery(
  _config: SyncConfig,
  _facilitatorConfig: FacilitatorConfig,
  since: Date,
  now: Date
): string {
  return JSON.stringify({ since: since.toISOString(), now: now.toISOString() });
}

export function transformResponse(
  data: unknown,
  config: SyncConfig,
  facilitator: Facilitator,
  facilitatorConfig: FacilitatorConfig
): TransferEventData[] {
  return (data as HyperSyncTransferRow[]).map(row => ({
    address: row.contract_address,
    transaction_from: row.transaction_from,
    sender: row.sender,
    recipient: row.recipient,
    amount: parseFloat(row.amount),
    block_timestamp: new Date(row.block_timestamp * 1000),
    tx_hash: row.transaction_hash,
    log_index: row.log_index,
    chain: config.chain,
    provider: config.provider,
    decimals: facilitatorConfig.token.decimals,
    facilitator_id: facilitator.id,
  }));
}
