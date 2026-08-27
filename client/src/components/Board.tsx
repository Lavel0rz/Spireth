'use client'

import { useTotalMinted, useImp, useSeasonState } from '@/hooks/useSpireth'
import { useState, useEffect, useMemo } from 'react'

interface ImpData {
  id: bigint
  height: number
  isDead: boolean
  owner: string
  pfpNft: string
  pfpTokenId: string
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const IPFS_GATEWAYS = ['https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/', 'https://gateway.pinata.cloud/ipfs/']

function convertToHttpUrl(uri: string): string {
  if (!uri) return ''
  if (uri.startsWith('ipfs://')) {
    return IPFS_GATEWAYS[0] + uri.slice(7)
  }
  if (uri.startsWith('data:')) {
    return uri
  }
  return uri
}

function ImpMarker({ imp, isSelected, onClick }: { imp: ImpData; isSelected: boolean; onClick: () => void }) {
  const [pfpUrl, setPfpUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)
  
  useEffect(() => {
    const hasPfp = imp.pfpNft && imp.pfpNft !== ZERO_ADDRESS
    if (!hasPfp) {
      setPfpUrl(null)
      return
    }
    
    const fetchTokenUri = async () => {
      try {
        const response = await fetch(`/api/nft-metadata?contract=${imp.pfpNft}&tokenId=${imp.pfpTokenId}`)
        if (response.ok) {
          const data = await response.json()
          if (data.image) {
            setPfpUrl(convertToHttpUrl(data.image))
          }
        }
      } catch {
        setImageError(true)
      }
    }
    
    fetchTokenUri()
  }, [imp.pfpNft, imp.pfpTokenId])
  
  const hasPfpImage = pfpUrl && !imageError
  
  return (
    <button
      onClick={onClick}
      className={`
        w-5 h-5 rounded-full transition-all duration-300 border-2 overflow-hidden
        ${imp.isDead 
          ? 'bg-zinc-700 border-zinc-600 opacity-50' 
          : isSelected
            ? 'bg-violet-500 border-violet-300 ring-2 ring-violet-400 ring-offset-2 ring-offset-zinc-900'
            : 'bg-indigo-500 border-indigo-300 hover:scale-110'
        }
      `}
      title={`Imp #${imp.id} - Floor ${imp.height}${imp.isDead ? ' (Dead)' : ''}`}
    >
      {hasPfpImage && (
        <img
          src={pfpUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      )}
    </button>
  )
}

function Floor({ 
  level, 
  imps, 
  selectedImpId, 
  onSelectImp,
  maxWidth
}: { 
  level: number
  imps: ImpData[]
  selectedImpId: bigint | null
  onSelectImp: (id: bigint) => void
  maxWidth: number
}) {
  const absLevel = Math.abs(level)
  const width = maxWidth - (absLevel * ((maxWidth - 20) / 25))
  const isCenter = level === 0
  const isSummit = level === 25
  const isAbyss = level === -25
  
  return (
    <div 
      className={`
        flex items-center justify-center gap-1 h-4 relative
        ${isCenter ? 'bg-amber-500/20' : ''}
        ${isSummit ? 'bg-emerald-500/30' : ''}
        ${isAbyss ? 'bg-red-500/30' : ''}
      `}
      style={{ width: `${width}%` }}
    >
      {(isSummit || isAbyss || isCenter || level % 6 === 0) && (
        <span className={`
          absolute -left-10 text-xs font-mono
          ${isSummit ? 'text-emerald-400' : isAbyss ? 'text-red-400' : isCenter ? 'text-amber-400' : 'text-zinc-500'}
        `}>
          {level > 0 ? `+${level}` : level}
        </span>
      )}
      <div className={`
        flex-1 h-px
        ${isSummit ? 'bg-emerald-500' : isAbyss ? 'bg-red-500' : isCenter ? 'bg-amber-500' : 'bg-zinc-700'}
      `} />
      <div className="flex gap-1 items-center">
        {imps.map(imp => (
          <ImpMarker 
            key={imp.id.toString()} 
            imp={imp} 
            isSelected={selectedImpId === imp.id}
            onClick={() => onSelectImp(imp.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function Board({ 
  selectedImpId, 
  onSelectImp,
  userImpId
}: { 
  selectedImpId: bigint | null
  onSelectImp: (id: bigint) => void
  userImpId?: bigint
}) {
  const { data: totalMinted } = useTotalMinted()
  const [imps, setImps] = useState<ImpData[]>([])
  
  const total = totalMinted !== undefined ? Number(totalMinted) : 0

  useEffect(() => {
    if (total === 0) {
      setImps([])
      return
    }

    const fetchImps = async () => {
      const impPromises = Array.from({ length: total }, (_, i) => 
        fetch(`/api/imp/${i}`).then(r => r.json()).catch(() => null)
      )
      const results = await Promise.all(impPromises)
      const validImps = results.filter(Boolean).map((imp, i) => ({
        id: BigInt(i),
        height: imp.height,
        isDead: imp.isDead,
        owner: imp.owner,
        pfpNft: imp.pfpNft || ZERO_ADDRESS,
        pfpTokenId: imp.pfpTokenId || '0',
      }))
      setImps(validImps)
    }

    fetchImps()
    const interval = setInterval(fetchImps, 5000)
    return () => clearInterval(interval)
  }, [total])

  const impsByFloor = useMemo(() => {
    const map = new Map<number, ImpData[]>()
    for (let i = -25; i <= 25; i++) {
      map.set(i, [])
    }
    imps.forEach(imp => {
      const floor = map.get(imp.height)
      if (floor) floor.push(imp)
    })
    return map
  }, [imps])

  const floors = useMemo(() => {
    const result = []
    for (let i = 25; i >= -25; i--) {
      result.push(i)
    }
    return result
  }, [])

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
        <span className="text-2xl">⬥</span>
        The Spireth
      </h2>
      <div className="relative pl-12">
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-500 via-zinc-700 to-red-500" />
        
        <div className="absolute -left-1 top-0 w-3 h-3 rotate-45 bg-emerald-500" title="Summit +25" />
        <div className="absolute -left-1 bottom-0 w-3 h-3 rotate-45 bg-red-500" title="Abyss -25" />
        
        <div className="flex flex-col items-center space-y-px">
          {floors.map(level => (
            <Floor
              key={level}
              level={level}
              imps={impsByFloor.get(level) || []}
              selectedImpId={selectedImpId}
              onSelectImp={onSelectImp}
              maxWidth={100}
            />
          ))}
        </div>
      </div>
      
      <div className="mt-4 flex justify-center gap-4 text-xs text-zinc-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-indigo-500 border border-indigo-300" />
          <span>Living</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-zinc-700 border border-zinc-600 opacity-50" />
          <span>Dead</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-violet-500 border border-violet-300" />
          <span>Selected</span>
        </div>
      </div>
    </div>
  )
}
