'use client'

import { useState, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import {
  useBillboard,
  useNextBillboardBid,
  useBidBillboard,
  useSeasonState,
} from '@/hooks/useSpireth'

function validateUrl(url: string): string | null {
  if (!url) return 'URL is required'
  if (url.length > 200) return 'URL too long (max 200 characters)'
  if (!url.startsWith('https://')) return 'URL must start with https://'
  
  const forbidden = ['`', '"', "'", '<', '>', '\\', ' ', '\t', '\n', '\r', '\0']
  for (const char of forbidden) {
    if (url.includes(char)) return `URL contains forbidden character: ${char === ' ' ? 'space' : char}`
  }
  
  const afterProtocol = url.slice(8)
  const firstSlash = afterProtocol.indexOf('/')
  const hostPart = firstSlash === -1 ? afterProtocol : afterProtocol.slice(0, firstSlash)
  if (hostPart.includes('@')) return 'URL cannot contain @ in host (phishing risk)'
  
  return null
}

function validateLabel(label: string): string | null {
  if (!label) return 'Label is required'
  if (label.length > 64) return 'Label too long (max 64 characters)'
  
  const forbidden = ['<', '>', '`', '\0']
  for (const char of forbidden) {
    if (label.includes(char)) return `Label contains forbidden character: ${char}`
  }
  
  return null
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function BillboardPanel() {
  const { address, isConnected } = useAccount()
  const { data: seasonState } = useSeasonState()
  const { data: billboardData } = useBillboard()
  const { data: nextMinBid } = useNextBillboardBid()
  const { bidBillboard, isPending, isConfirming, isSuccess, error } = useBidBillboard()
  
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [bidAmount, setBidAmount] = useState('')
  const [showForm, setShowForm] = useState(false)

  const isLive = seasonState !== undefined && BigInt(seasonState as bigint) === BigInt(1)
  
  const billboard = useMemo(() => {
    if (!billboardData) return null
    const [url, label, bid, bidder] = billboardData as [string, string, bigint, string]
    return { url, label, bid, bidder }
  }, [billboardData])

  const minBidEth = nextMinBid ? formatEther(nextMinBid as bigint) : '0.001'
  
  const urlError = useMemo(() => url ? validateUrl(url) : null, [url])
  const labelError = useMemo(() => label ? validateLabel(label) : null, [label])
  const bidError = useMemo(() => {
    if (!bidAmount) return null
    try {
      const wei = parseEther(bidAmount)
      if (nextMinBid && wei < (nextMinBid as bigint)) {
        return `Bid must be at least ${minBidEth} ETH`
      }
      return null
    } catch {
      return 'Invalid amount'
    }
  }, [bidAmount, nextMinBid, minBidEth])

  const canSubmit = isConnected && isLive && url && label && bidAmount && 
                   !urlError && !labelError && !bidError && !isPending && !isConfirming

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    
    try {
      const wei = parseEther(bidAmount)
      bidBillboard(url, label, wei)
    } catch {
      console.error('Failed to parse bid amount')
    }
  }

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-zinc-200 flex items-center gap-2">
          <span className="text-amber-400">📢</span>
          Floor 0 Billboard
        </h2>
        {isLive && (
          <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">Live</span>
        )}
      </div>

      {billboard && billboard.url ? (
        <div className="space-y-2 mb-4 p-3 bg-zinc-800/50 rounded-lg">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Current Ad</div>
          <div className="text-sm text-zinc-200 font-medium">{billboard.label}</div>
          <a 
            href={billboard.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 truncate block"
          >
            {billboard.url.length > 40 ? billboard.url.slice(0, 37) + '...' : billboard.url}
            <span className="ml-1 text-zinc-500">↗</span>
          </a>
          <div className="flex justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-700/50">
            <span>Bid: {formatEther(billboard.bid)} ETH</span>
            <span>By: {shortAddress(billboard.bidder)}</span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-zinc-500 mb-4 p-3 bg-zinc-800/50 rounded-lg">
          No billboard ad yet. Be the first!
        </div>
      )}

      <div className="text-xs text-zinc-400 mb-3">
        Next minimum bid: <span className="text-amber-400 font-medium">{minBidEth} ETH</span>
        <span className="text-zinc-500 ml-2">(90% to prize pool, 10% to dev)</span>
      </div>

      {!isConnected ? (
        <div className="text-sm text-zinc-500 text-center py-2">
          Connect wallet to bid
        </div>
      ) : !isLive ? (
        <div className="text-sm text-zinc-500 text-center py-2">
          Billboard bidding only available during Live season
        </div>
      ) : showForm ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Label (max 64 chars)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Your Ad Title"
              maxLength={64}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
            {labelError && <p className="text-xs text-red-400 mt-1">{labelError}</p>}
          </div>
          
          <div>
            <label className="text-xs text-zinc-500 block mb-1">URL (https:// only)</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com"
              maxLength={200}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
            {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
          </div>
          
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Bid Amount (ETH)</label>
            <input
              type="text"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              placeholder={minBidEth}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
            {bidError && <p className="text-xs text-red-400 mt-1">{bidError}</p>}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isPending ? 'Confirm in wallet...' : isConfirming ? 'Placing bid...' : 'Place Bid'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition text-sm"
            >
              Cancel
            </button>
          </div>
          
          {error && (
            <p className="text-xs text-red-400">
              Error: {error.message?.slice(0, 100) || 'Transaction failed'}
            </p>
          )}
          
          {isSuccess && (
            <p className="text-xs text-emerald-400">
              Bid placed successfully! Your ad is now live.
            </p>
          )}

          <p className="text-xs text-zinc-500 mt-2">
            Prior bids are not refunded. Winner-take-slot style.
          </p>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold rounded-lg transition text-sm"
        >
          Bid for Billboard
        </button>
      )}
    </div>
  )
}
