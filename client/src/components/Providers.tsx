'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from '@/config/wagmi'
import { GameAnimationProvider } from '@/context/GameAnimationContext'
import { useState, type ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <GameAnimationProvider>
          {children}
        </GameAnimationProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
