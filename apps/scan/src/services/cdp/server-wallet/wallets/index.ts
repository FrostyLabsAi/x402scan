import { svmServerWallet } from './svm';
import { evmServerWallet } from './evm';

import { Chain } from '@/types/chain';

import type { SupportedChain } from '@/types/chain';
import type { EvmWallets, WalletChain, Wallets } from './types';

/** CDP holds no wallets on HyperEVM — gate before indexing `Wallets`. */
export const isWalletChain = (chain: SupportedChain): chain is WalletChain =>
  chain !== Chain.HYPEREVM;

const evmWallets = (name: string): EvmWallets => ({
  [Chain.BASE]: evmServerWallet(Chain.BASE)(name),
});

export const wallets = (name: string): Wallets => ({
  [Chain.SOLANA]: svmServerWallet(name),
  ...evmWallets(name),
});
