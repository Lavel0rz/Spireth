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

    const data = await client.readContract({
      address: contractAddress,
      abi: TheSpirethABI,
      functionName: 'getImp',
      args: [impId],
    }) as [number, bigint, bigint, boolean, boolean, string]

    return NextResponse.json({
      id: id,
      height: data[0],
      lastRoll: data[1].toString(),
      heightReachedAt: data[2].toString(),
      isDead: data[3],
      hasClaimed: data[4],
      owner: data[5],
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch imp data' }, { status: 500 })
  }
}
