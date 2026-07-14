import { encodeFunctionData, erc20Abi, formatEther, parseUnits } from 'viem';
import { getBalance, readContract } from 'viem/actions';
import { toAccount } from 'viem/accounts';

import { cdpClient } from '../client';

import { baseRpc } from '@/services/rpc/base';

import { cdpResultFromPromise } from '../../result';

import { convertTokenAmount } from '@/lib/token';

import type { Chain, EvmChain } from '@/types/chain';
import type { Address } from 'viem';
import type { NetworkServerWallet } from './types';

/** EVM chains the CDP server-wallet SDK can transact on — HyperEVM is indexed
 * by the scanner but is NOT in CDP's network registry. */
type CdpEvmChain = Exclude<EvmChain, Chain.HYPEREVM>;

export const evmServerWallet =
  <T extends CdpEvmChain>(chain: T): NetworkServerWallet<EvmChain> =>
  (name: string) => {
    const getAccount = async () => {
      return await cdpClient.evm.getOrCreateAccount({ name });
    };

    const getAddress = async () => (await getAccount()).address;

    return {
      address: () =>
        cdpResultFromPromise('getAddress', getAddress(), e => ({
          cause: 'bad_gateway',
          message:
            e instanceof Error ? e.message : 'Failed to get wallet address',
        })),
      getNativeTokenBalance: () =>
        cdpResultFromPromise(
          'getNativeTokenBalance',
          getAddress()
            .then(address =>
              getBalance(baseRpc, {
                address,
              })
            )
            .then(result => parseFloat(formatEther(result))),
          e => ({
            cause: 'bad_gateway',
            message:
              e instanceof Error
                ? e.message
                : 'Failed to get native token balance',
          })
        ),
      getTokenBalance: ({ token }) =>
        cdpResultFromPromise(
          'getTokenBalance',
          getAddress()
            .then(address =>
              readContract(baseRpc, {
                abi: erc20Abi,
                address: token.address as Address,
                args: [address],
                functionName: 'balanceOf',
              })
            )
            .then(balance => convertTokenAmount(balance)),
          e => ({
            cause: 'bad_gateway',
            message:
              e instanceof Error ? e.message : 'Failed to get token balance',
          })
        ),
      export: () =>
        cdpResultFromPromise(
          'export',
          getAddress().then(address =>
            cdpClient.evm.exportAccount({
              address,
              name,
            })
          ),
          e => ({
            cause: 'bad_gateway',
            message: e instanceof Error ? e.message : 'Failed to export wallet',
          })
        ),
      signer: async () => toAccount(await getAccount()),
      sendTokens: ({ address, token, amount }) =>
        cdpResultFromPromise(
          'sendTokens',
          getAccount().then(account =>
            account
              .sendTransaction({
                network: chain,
                transaction: {
                  to: token.address as Address,
                  data: encodeFunctionData({
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [
                      address as Address,
                      parseUnits(amount.toString(), token.decimals),
                    ],
                  }),
                },
              })
              .then(({ transactionHash }) => transactionHash)
          ),
          e => ({
            cause: 'bad_gateway',
            message: e instanceof Error ? e.message : 'Failed to send tokens',
          })
        ),
    };
  };
