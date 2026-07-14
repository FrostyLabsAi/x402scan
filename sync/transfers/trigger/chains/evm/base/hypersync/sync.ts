import { createChainSyncTask } from '../../../../sync';
import { baseFrostyfiHypersyncConfig } from './config';

export const baseFrostyfiHypersyncSyncTransfers = createChainSyncTask(
  baseFrostyfiHypersyncConfig
);
