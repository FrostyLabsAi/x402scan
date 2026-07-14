import { Network } from '../types';
import { USDC_BASE_TOKEN } from '../constants';
import type { Facilitator, FacilitatorConfig } from '../types';

export const frostyfi: FacilitatorConfig = {
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
  addresses: {
    [Network.BASE]: [
      {
        // x402 settle server wallet (broadcasts transferWithAuthorization)
        address: '0xEC8D24f810A5f0CA1C4176d681d48F389AeF5540',
        tokens: [USDC_BASE_TOKEN],
        // First Base settlement: 2026-07-07 15:13 UTC
        dateOfFirstTransaction: new Date('2026-07-07'),
      },
    ],
  },
};
