import { foundry, base, baseSepolia } from 'wagmi/chains'

export const CONTRACT_ADDRESSES: Record<number, `0x${string}`> = {
  [foundry.id]: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  [base.id]: '0x0000000000000000000000000000000000000000',
  [baseSepolia.id]: '0x0000000000000000000000000000000000000000',
}

export function getContractAddress(chainId: number): `0x${string}` | undefined {
  return CONTRACT_ADDRESSES[chainId]
}
