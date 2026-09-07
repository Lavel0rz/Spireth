'use client'

import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
} from 'wagmi'
import { parseEther, keccak256, encodePacked, type Abi } from 'viem'
import TheSpirethABI from '@/abi/TheSpireth.json'
import { getContractAddress } from '@/config/contract'

const SPIRETH_ABI = TheSpirethABI as Abi

/** Invalidate on-chain read queries after a successful write. */
export function useInvalidateSpirethReads() {
  const queryClient = useQueryClient()

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['readContract'] })
  }, [queryClient])
}

function useInvalidateOnReceiptSuccess(isSuccess: boolean, reset?: () => void) {
  const invalidateReads = useInvalidateSpirethReads()

  useEffect(() => {
    if (!isSuccess) return
    invalidateReads()
    reset?.()
  }, [isSuccess, invalidateReads, reset])
}

export function useContractAddress() {
  const chainId = useChainId()
  return getContractAddress(chainId)
}

export function useSeasonState() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'seasonState',
    query: { refetchInterval: 5000 },
  })
}

export function useTotalMinted() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'totalMinted',
    query: { refetchInterval: 5000 },
  })
}

export function useMintCap() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'mintCap',
  })
}

export function useOwnedImpId(userAddress?: `0x${string}`) {
  const address = useContractAddress()
  const { data: totalMinted } = useTotalMinted()
  const total = totalMinted !== undefined ? Number(totalMinted) : 0

  const contracts =
    userAddress && address && total > 0
      ? Array.from({ length: total }, (_, i) => ({
          address,
          abi: SPIRETH_ABI,
          functionName: 'ownerOf' as const,
          args: [BigInt(i)] as const,
        }))
      : []

  const { data, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: !!userAddress && !!address && total > 0,
      refetchInterval: 5000,
      refetchOnMount: true,
    },
  })

  const ownedIndex = data?.findIndex(
    (result) =>
      result.status === 'success' &&
      typeof result.result === 'string' &&
      result.result.toLowerCase() === userAddress?.toLowerCase(),
  )

  return {
    impId: ownedIndex !== undefined && ownedIndex >= 0 ? BigInt(ownedIndex) : null,
    refetch,
  }
}

export function usePrizePool() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'prizePool',
    query: { refetchInterval: 5000 },
  })
}

export function useRollCost() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'rollCost',
  })
}

export function useHasMinted(userAddress?: `0x${string}`) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'hasMinted',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress,
      refetchInterval: 5000,
      refetchOnMount: true,
    },
  })
}

export function useSignupTimeRemaining() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'signupTimeRemaining',
    query: { refetchInterval: 1000 },
  })
}

export function useSeasonTimeRemaining() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'seasonTimeRemaining',
    query: { refetchInterval: 1000 },
  })
}

export function useImp(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'getImp',
    args: [impId],
    query: { refetchInterval: 5000 },
  })
}

export function useCanRoll(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'canRoll',
    args: [impId],
    query: { refetchInterval: 5000 },
  })
}

export function useTimeUntilDeath(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'timeUntilDeath',
    args: [impId],
    query: { refetchInterval: 1000 },
  })
}

export function useTimeUntilNextRoll(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'timeUntilNextRoll',
    args: [impId],
    query: { refetchInterval: 1000 },
  })
}

export function useRollCooldownInfo(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'getRollCooldownInfo',
    args: [impId],
    query: { refetchInterval: 1000 },
  })
}

export function usePendingRoll(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'getPendingRoll',
    args: [impId],
    query: { refetchInterval: 3000 },
  })
}

export function useCanReveal(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'canReveal',
    args: [impId],
    query: { refetchInterval: 2000 },
  })
}

export function useImpPrize(impId: bigint) {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'impPrize',
    args: [impId],
  })
}

export function useLivingImpsAtFreeze() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'getLivingImpsAtFreeze',
  })
}

export function useBellRingerId() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'bellRingerId',
  })
}

export function useHasBellRinger() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'hasBellRinger',
  })
}

export function useMint() {
  const address = useContractAddress()
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useInvalidateOnReceiptSuccess(isSuccess, reset)

  const mint = () => {
    if (!address) return
    writeContract({
      address,
      abi: SPIRETH_ABI,
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
      abi: SPIRETH_ABI,
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
      abi: SPIRETH_ABI,
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
      abi: SPIRETH_ABI,
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
    abi: SPIRETH_ABI,
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
      abi: SPIRETH_ABI,
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
      abi: SPIRETH_ABI,
      functionName: 'clearPfp',
      args: [impId],
    })
  }

  return { clearPfp, isPending, isConfirming, isSuccess, error, hash }
}

export function useBillboard() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'getBillboard',
    query: { refetchInterval: 5000 },
  })
}

export function useNextBillboardBid() {
  const address = useContractAddress()
  return useReadContract({
    address,
    abi: SPIRETH_ABI,
    functionName: 'nextBillboardBid',
    query: { refetchInterval: 5000 },
  })
}

export function useBidBillboard() {
  const address = useContractAddress()
  const invalidateReads = useInvalidateSpirethReads()
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useInvalidateOnReceiptSuccess(isSuccess, reset)

  const bidBillboard = (url: string, label: string, value: bigint) => {
    if (!address) return
    writeContract({
      address,
      abi: SPIRETH_ABI,
      functionName: 'bidBillboard',
      args: [url, label],
      value,
    })
  }

  return { bidBillboard, isPending, isConfirming, isSuccess, error, hash }
}
