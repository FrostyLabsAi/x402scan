import { Network } from '../types';
import { USDC_BASE_TOKEN, USDC_HYPEREVM_TOKEN } from '../constants';
import type { Facilitator, FacilitatorConfig } from '../types';

export const frostyfi: FacilitatorConfig = {
  // TODO: FrostyFi self-settles internally rather than exposing a public
  // /verify + /settle facilitator endpoint. Point this at the real endpoint if
  // one is exposed; it's used for discovery, not for transfer indexing.
  url: 'https://flow.frostylabs.ai',
};

export const frostyfiFacilitator: Facilitator = {
  id: 'frostyFi',
  metadata: {
    name: 'FrostyFi',
    // The scan app serves the basename from its public dir
    // (apps/scan/public/frostyfi.png, added alongside this entry).
    image: 'https://flow.frostylabs.ai/frostyfi.png',
    docsUrl: 'https://frostylabs.ai',
    color: '#38BDF8',
  },
  config: frostyfi,
  // Same settle wallet (EOA) broadcasts transferWithAuthorization on both
  // networks.
  addresses: {
    [Network.BASE]: [
      {
        address: '0xEC8D24f810A5f0CA1C4176d681d48F389AeF5540',
        tokens: [USDC_BASE_TOKEN],
        // First Base settlement: 2026-07-07 15:13 UTC (verified on basescan)
        dateOfFirstTransaction: new Date('2026-07-07'),
      },
    ],
    [Network.HYPEREVM]: [
      {
        address: '0xEC8D24f810A5f0CA1C4176d681d48F389AeF5540',
        tokens: [USDC_HYPEREVM_TOKEN],
        // First settlement: tx 0x062d00fc… block 40372282 (verified on hyperevmscan)
        dateOfFirstTransaction: new Date('2026-07-13'),
      },
    ],
  },
};
