# The Spireth - Season 1

A finite onchain race on Base. Mortal Imps climb an Ethereum-rhombus board.

## Overview

The Spireth is a competitive blockchain game where players mint Imps and roll dice daily to climb (or descend) a vertical board. The first Imp to reach the summit (+36) or abyss (-36) rings the bell and freezes the season. The top 50% of **living** Imps split the prize pool.

## Rules

### The Board
- Vertical board with floors from -36 (Abyss) to +36 (Summit)
- All Imps spawn at floor 0 (the belt of the Ethereum diamond)
- Up and down are the same race - first to |height| >= 36 wins

### Season Lifecycle
1. **Signup (72 hours)**: Free mint period, one Imp per wallet
2. **Live**: Owner can call `soundHorn()` early if >= 2 minters exist, or it auto-starts after signup
3. **Frozen**: When an Imp reaches ±36, or after 45 days maximum

### Rolling
- **Cost**: `rollCost` in ETH (default ~0.002 ETH, ~$5 at $2500/ETH)
- **Split**: 80% goes to prize pool, 20% to dev address
- **Frequency**: Once per 24 hours per Imp
- **Dice**: ±1, ±2, ±3, ±4 (uniform, no zero)
- **RNG**: Commit-reveal scheme - commit your roll, wait 1+ block, reveal to complete

### Death
- Miss 72 hours without rolling = your Imp dies
- Dead Imps keep their final height but cannot roll and are **ineligible for prizes**
- The NFT is not burned - dead Imps stay on the board as graves

### Prizes
- **Bell Ringer**: The Imp that reaches ±36 gets a 20% bonus from the pool
- **Top 50%**: The remaining 80% is split linearly among the top 50% of **living** Imps (by |height|, tiebreak by who reached that height first)
- **Dead Imps**: Excluded from prize distribution
- **Claims**: Pull-based - winners call `claim()` after freeze

## Technical Stack

- **Contracts**: Solidity 0.8.24, Foundry
- **Dependencies**: OpenZeppelin ERC721, forge-std (git submodules)
- **Client**: Next.js 16, TypeScript, Tailwind CSS, wagmi/viem
- **Target Chain**: Base (also local Anvil for testing)

## Local Development (Windows/Git Bash)

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js 18+
- Git Bash (Windows) or any Unix shell

### 1. Install Foundry (if not already)
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 2. Install Contract Dependencies
```bash
cd /path/to/spireth
forge install
```

### 3. Run Tests
```bash
forge test
```

### 4. Start Local Anvil
```bash
# Terminal 1: Start Anvil
anvil
```

### 5. Deploy to Anvil
```bash
# Terminal 2: Deploy contracts
forge script script/Deploy.s.sol:DeployLocalScript --rpc-url http://127.0.0.1:8545 --broadcast
```

Note the deployed contract address (default: `0x5FbDB2315678afecb367f032d93F642f64180aa3`).

### 6. Start the Client
```bash
# Terminal 3: Start Next.js dev server
cd client
npm install
npm run dev
```

Open http://127.0.0.1:3847 in your browser.

## Clone this repository

```bash
git clone --recurse-submodules https://github.com/Lavel0rz/Spireth.git
cd Spireth
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

### 7. Connect Wallet
1. Add Anvil network to MetaMask:
   - Network Name: Anvil
   - RPC URL: http://127.0.0.1:8545
   - Chain ID: 31337
   - Currency: ETH

2. Import an Anvil test account (use the first one for owner):
   - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   - This account has 10,000 test ETH

### 8. Play the Game
1. Click "Connect Wallet"
2. During signup: Click "Mint Your Imp"
3. Owner can call `soundHorn()` via cast:
   ```bash
   cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 "soundHorn()" \
     --rpc-url http://127.0.0.1:8545 \
     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
4. During live season: Click "Roll" to commit, then "Reveal Roll" to complete

## Contract Addresses

| Network | Address |
|---------|---------|
| Local Anvil | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| Base Mainnet | TBD |
| Base Sepolia | TBD |

## Configuration

### Constructor Parameters
- `_owner`: Address that can call `soundHorn()`, `setRollCost()`, `setMintCap()`
- `_dev`: Address that receives 20% of roll fees
- `_rollCost`: Cost in wei per roll (default: 0.002 ether)
- `_mintCap`: Maximum number of Imps (default: 1000 for season 1)

### Environment Variables (for production deploy)
```bash
export PRIVATE_KEY=0x...
export OWNER_ADDRESS=0x...
export DEV_ADDRESS=0x...
export ROLL_COST=2000000000000000  # 0.002 ETH in wei
export MINT_CAP=1000
```

## RNG Design

The Spireth uses a commit-reveal scheme for fair randomness:

1. **Commit**: Player calls `commitRoll(commitment)` with payment
   - `commitment = keccak256(secret, impId)`
   - Payment is split 80/20 to pool/dev
   
2. **Reveal**: After 1+ blocks, player calls `revealRoll(secret)`
   - Contract verifies `hash(secret, impId) == commitment`
   - Dice derived from `hash(secret, blockhash(commitBlock+1))`
   - Player cannot manipulate because they committed before the blockhash existed

3. **Expiry**: If not revealed within 256 blocks, the roll is forfeited

This design is manipulation-resistant because:
- Players commit their secret before the determining blockhash exists
- Block producers cannot know the player's secret when producing blocks
- Works on both mainnet and local Anvil without external dependencies

## Contract Size

The contract is 12,489 bytes, well under the 24,576 byte EIP-170 limit.

## License

MIT
