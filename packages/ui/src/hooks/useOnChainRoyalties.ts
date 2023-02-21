import { goerli, mainnet, useContractRead } from 'wagmi'
import { polygon } from 'wagmi/chains'
import { BigNumber } from 'ethers'
import { parseUnits } from 'ethers/lib/utils.js'
import useChainCurrency from '../hooks/useChainCurrency'

type Props = {
  contract?: string
  tokenId?: string
  value?: BigNumber
  enabled: boolean
  chainId: number
}

const MANIFOLD_ABI = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'tokenAddress',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'tokenId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'value',
        type: 'uint256',
      },
    ],
    name: 'getRoyaltyView',
    outputs: [
      {
        internalType: 'address payable[]',
        name: 'recipients',
        type: 'address[]',
      },
      {
        internalType: 'uint256[]',
        name: 'amounts',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const manifoldContractForChain = (chainId: number = mainnet.id) => {
  switch (chainId) {
    case mainnet.id: {
      return '0x0385603ab55642cb4dd5de3ae9e306809991804f'
    }
    case goerli.id: {
      return '0xe7c9Cb6D966f76f3B5142167088927Bf34966a1f'
    }
    case polygon.id: {
      return '0x28EdFcF0Be7E86b07493466e7631a213bDe8eEF2'
    }
  }
}

export default function ({
  contract,
  tokenId,
  value,
  enabled,
  chainId = mainnet.id,
}: Props) {
  const manifoldContract = manifoldContractForChain(chainId)
  const currency = useChainCurrency(chainId)
  const amount = value ? value : parseUnits('1', currency.decimals)

  return useContractRead({
    chainId: chainId,
    address: manifoldContract,
    abi: MANIFOLD_ABI,
    args: [contract as any, tokenId as any, amount],
    functionName: 'getRoyaltyView',
    enabled: enabled && tokenId && contract && amount ? true : false,
    cacheTime: 60 * 1000,
  })
}