import type { Token } from './types';

const USDC_DECIMALS = 6;
const USDC_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // USDC on Polygon
const USDC_HYPEREVM = '0xb88339CB7199b77E23DB6E890353E22632Ba630f'; // native Circle USDC on HyperEVM

export const USDC_BASE_TOKEN: Token = {
  address: USDC_BASE,
  decimals: USDC_DECIMALS,
  symbol: 'USDC',
};

export const USDC_SOLANA_TOKEN: Token = {
  address: USDC_SOLANA,
  decimals: USDC_DECIMALS,
  symbol: 'USDC',
};

export const USDC_POLYGON_TOKEN: Token = {
  address: USDC_POLYGON,
  decimals: USDC_DECIMALS,
  symbol: 'USDC',
};

export const USDC_HYPEREVM_TOKEN: Token = {
  address: USDC_HYPEREVM,
  decimals: USDC_DECIMALS,
  symbol: 'USDC',
};
