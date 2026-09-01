import { createChainSyncTask } from '../../../../sync';
import { hyperevmHypersyncConfig } from './config';

export const hyperevmHypersyncSyncTransfers = createChainSyncTask(
  hyperevmHypersyncConfig
);
