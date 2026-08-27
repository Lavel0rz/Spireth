import { http, createConfig } from 'wagmi'
import { base, baseSepolia, foundry } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [foundry, base, baseSepolia],
  connectors: [
    injected(),
  ],
  transports: {
    [foundry.id]: http('http://127.0.0.1:8545'),
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
