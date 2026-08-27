'use client'

import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId } from 'wagmi'
import { parseEther, keccak256, encodePacked } from 'viem'
import TheSpirethABI from '@/abi/TheSpireth.json'
import { getContractAddress } from '@/config/contract'

export function useContractAddress() {
  const chainId = useChainId()
  return getContractAddress(chainId)
}

export function useSeasonState() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'seasonState',
    query: { refetchInterval: 5000 },
  })
}

export function useTotalMinted() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'totalMinted',
    query: { refetchInterval: 5000 },
  })
}

export function usePrizePool() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'prizePool',
    query: { refetchInterval: 5000 },
  })
}

export function useRollCost() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'rollCost',
  })
}

export function useHasMinted(userAddress?: `0x${string}`) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'hasMinted',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  })
}

export function useSignupTimeRemaining() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'signupTimeRemaining',
    query: { refetchInterval: 1000 },
  })
}

export function useSeasonTimeRemaining() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'seasonTimeRemaining',
    query: { refetchInterval: 1000 },
  })
}

export function useImp(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'getImp',
    args: [impId],
    query: { refetchInterval: 5000 },
  })
}

export function useCanRoll(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'canRoll',
    args: [impId],
    query: { refetchInterval: 5000 },
  })
}

export function useTimeUntilDeath(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'timeUntilDeath',
    args: [impId],
    query: { refetchInterval: 1000 },
  })
}

export function useTimeUntilNextRoll(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'timeUntilNextRoll',
    args: [impId],
    query: { refetchInterval: 1000 },
  })
}

export function usePendingRoll(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'getPendingRoll',
    args: [impId],
    query: { refetchInterval: 3000 },
  })
}

export function useImpPrize(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'impPrize',
    args: [impId],
  })
}

export function useLivingImpsAtFreeze() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'getLivingImpsAtFreeze',
  })
}

export function useBellRingerId() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'bellRingerId',
  })
}

export function useHasBellRinger() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'hasBellRinger',
  })
}

export function useMint() {
  const address = useContractAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const mint = () => {
    if (!address) return
    writeContract({
      address,
      abi: TheSpirethABI,
      functionName: 'mint',
    })
  }

  return { mint, isPending, isConfirming, isSuccess, error, hash }
}

export function useCommitRoll(impId: bigint) {
  const address = useContractAddress()
  const { data: rollCost } = useRollCost()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const commitRoll = (secret: bigint) => {
    if (!address || !rollCost) return
    const commitment = keccak256(encodePacked(['uint256', 'uint256'], [secret, impId]))
    writeContract({
      address,
      abi: TheSpirethABI,
      functionName: 'commitRoll',
      args: [impId, commitment],
      value: rollCost as bigint,
    })
  }

  return { commitRoll, isPending, isConfirming, isSuccess, error, hash }
}

export function useRevealRoll(impId: bigint) {
  const address = useContractAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const revealRoll = (secret: bigint) => {
    if (!address) return
    writeContract({
      address,
      abi: TheSpirethABI,
      functionName: 'revealRoll',
      args: [impId, secret],
    })
  }

  return { revealRoll, isPending, isConfirming, isSuccess, error, hash }
}

export function useClaim(impId: bigint) {
  const address = useContractAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const claim = () => {
    if (!address) return
    writeContract({
      address,
      abi: TheSpirethABI,
      functionName: 'claim',
      args: [impId],
    })
  }

  return { claim, isPending, isConfirming, isSuccess, error, hash }
}

export function useEquippedPfp(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: TheSpirethABI,
    functionName: 'getEquippedPfp',
    args: [impId],
    query: { refetchInterval: 5000 },
  })
}

export function useEquipPfp(impId: bigint) {
  const address = useContractAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const equipPfp = (nftAddress: `0x${string}`, tokenId: bigint) => {
    if (!address) return
    writeContract({
      address,
      abi: TheSpirethABI,
      functionName: 'equipPfp',
      args: [impId, nftAddress, tokenId],
    })
  }

  return { equipPfp, isPending, isConfirming, isSuccess, error, hash }
}

export function useClearPfp(impId: bigint) {
  const address = useContractAddress()
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const clearPfp = () => {
    if (!address) return
    writeContract({
      address,
      abi: TheSpirethABI,
      functionName: 'clearPfp',
      args: [impId],
    })
  }

  return { clearPfp, isPending, isConfirming, isSuccess, error, hash }
}
