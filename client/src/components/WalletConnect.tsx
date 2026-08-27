'use client'

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { foundry } from 'wagmi/chains'

export function WalletConnect() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm text-zinc-400">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          {chainId !== foundry.id && (
            <button
              onClick={() => switchChain({ chainId: foundry.id })}
              className="text-xs px-2 py-1 bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition"
            >
              Switch to Anvil
            </button>
          )}
        </div>
        <button
          onClick={() => disconnect()}
          className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      {connectors.map((connector) => (
        <button
          key={connector.uid}
          onClick={() => connect({ connector })}
          disabled={isPending}
          className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium rounded-lg transition disabled:opacity-50"
        >
          {isPending ? 'Connecting...' : 'Connect Wallet'}
        </button>
      ))}
    </div>
  )
}
