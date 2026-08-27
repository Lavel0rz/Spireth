import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { foundry } from 'viem/chains'

const client = createPublicClient({
  chain: foundry,
  transport: http('http://127.0.0.1:8545'),
})

const ERC721_ABI = parseAbi([
  'function tokenURI(uint256 tokenId) view returns (string)',
])

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
]

function convertIpfsUrl(uri: string): string {
  if (!uri) return ''
  if (uri.startsWith('ipfs://')) {
    return IPFS_GATEWAYS[0] + uri.slice(7)
  }
  return uri
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const contract = searchParams.get('contract')
  const tokenId = searchParams.get('tokenId')

  if (!contract || !tokenId) {
    return NextResponse.json({ error: 'Missing contract or tokenId' }, { status: 400 })
  }

  try {
    const tokenUri = await client.readContract({
      address: contract as `0x${string}`,
      abi: ERC721_ABI,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    })

    if (!tokenUri) {
      return NextResponse.json({ error: 'No tokenURI found' }, { status: 404 })
    }

    if (tokenUri.startsWith('data:application/json')) {
      const base64Data = tokenUri.split(',')[1]
      const jsonStr = Buffer.from(base64Data, 'base64').toString('utf-8')
      const metadata = JSON.parse(jsonStr)
      return NextResponse.json(metadata)
    }

    const metadataUrl = convertIpfsUrl(tokenUri)
    
    const response = await fetch(metadataUrl, {
      headers: { 'Accept': 'application/json' },
    })
    
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 })
    }

    const metadata = await response.json()
    return NextResponse.json(metadata)
  } catch (error) {
    console.error('Error fetching NFT metadata:', error)
    return NextResponse.json({ error: 'Failed to fetch NFT metadata' }, { status: 500 })
  }
}
