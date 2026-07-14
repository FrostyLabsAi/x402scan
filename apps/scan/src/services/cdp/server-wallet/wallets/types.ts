import type { Chain, SupportedChain, SupportedEVMChain } from '@/types/chain';
import type z from 'zod';
import type { getTokenBalanceSchema, sendTokensSchema } from './schemas';
import type { SolanaAddress } from '@/types/address';
import type { Address } from 'viem';
import type { CdpResultAsync } from '../../result';

export type NetworkServerWallet<T extends Chain> = (name: string) => {
  address: () => CdpResultAsync<
    T extends Chain.SOLANA ? SolanaAddress : Address
  >;
  getTokenBalance: (
    input: z.infer<typeof getTokenBalanceSchema>
  ) => CdpResultAsync<number>;
  getNativeTokenBalance: () => CdpResultAsync<number>;
  export: () => CdpResultAsync<string>;
  signer: () => Promise<unknown>;
  sendTokens: (
    input: z.infer<typeof sendTokensSchema>
  ) => CdpResultAsync<string>;
};

/** Chains the CDP server-wallet SDK can hold wallets on — HyperEVM is a
 * supported *scan* chain but is not in CDP's network registry. */
export type WalletChain = Exclude<SupportedChain, Chain.HYPEREVM>;
export type WalletEvmChain = Exclude<SupportedEVMChain, Chain.HYPEREVM>;

export type EvmWallets = {
  [K in WalletEvmChain]: ReturnType<NetworkServerWallet<K>>;
};

export type Wallets = {
  [K in WalletChain]: ReturnType<NetworkServerWallet<K>>;
};
