import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http } from 'viem'
import { foundry } from 'viem/chains'
import TheSpirethABI from '@/abi/TheSpireth.json'
import { CONTRACT_ADDRESSES } from '@/config/contract'

const client = createPublicClient({
  chain: foundry,
  transport: http('http://127.0.0.1:8545'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const impId = BigInt(id)
    const contractAddress = CONTRACT_ADDRESSES[foundry.id]

    const [impData, pfpData] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: TheSpirethABI,
        functionName: 'getImp',
        args: [impId],
      }) as Promise<[number, bigint, bigint, boolean, boolean, string]>,
      client.readContract({
        address: contractAddress,
        abi: TheSpirethABI,
        functionName: 'getEquippedPfp',
        args: [impId],
      }) as Promise<[string, bigint]>,
    ])

    return NextResponse.json({
      id: id,
      height: impData[0],
      lastRoll: impData[1].toString(),
      heightReachedAt: impData[2].toString(),
      isDead: impData[3],
      hasClaimed: impData[4],
      owner: impData[5],
      pfpNft: pfpData[0],
      pfpTokenId: pfpData[1].toString(),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch imp data' }, { status: 500 })
  }
}
