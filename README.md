# The Spireth - Season 1

A finite onchain race on Base. Mortal Imps climb an Ethereum-rhombus board.

**GitHub:** [github.com/Lavel0rz/Spireth](https://github.com/Lavel0rz/Spireth) (private)

```bash
git clone https://github.com/Lavel0rz/Spireth.git
cd Spireth
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0
forge test
```

## Overview

The Spireth is a competitive blockchain game where players mint Imps and roll dice daily to climb (or descend) a vertical board. The first Imp to reach the summit (+25) or abyss (-25) rings the bell and freezes the season. The top 50% of **living** Imps split the prize pool.

### Game Parameters
- **Summit/Abyss:** ±25 floors
- **Roll Cost:** $5 / 0.002 ETH
- **Split:** 80% to prize pool, 20% to dev
- **Imps per Wallet:** 1
- **Commit-Reveal:** Yes (manipulation-resistant RNG)
- **Time of Death:** 72 hours of inactivity
- **Signup Duration:** 72 hours
- **Max Season Duration:** 45 days

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
# Do not use --no-commit on older Foundry. Run these as two commands:
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0
```

If `lib/forge-std` or `lib/openzeppelin-contracts` already exist but are empty, delete them first:

```bash
rm -rf lib/forge-std lib/openzeppelin-contracts
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0
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

### 9. Equip a Profile Picture (PFP)

You can equip any NFT you own as your Imp's profile picture. The PFP will be displayed on the board for all players to see.

**Requirements:**
- You must own the Imp
- You must own the NFT you want to equip
- Both ownership checks happen at equip time
- Equipping is free (no gas cost beyond the transaction)

**To equip a PFP:**
1. Select your Imp on the board
2. In the Imp Panel, click "Equip PFP"
3. Enter the NFT contract address and token ID
4. Click "Equip NFT as PFP"

**On Anvil (local development):**
Since you may not have existing NFTs, you can paste any ERC721 contract address and token ID that your connected wallet owns.

**Via CLI:**
```bash
# Equip a PFP
cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 "equipPfp(uint256,address,uint256)" \
  <IMP_ID> <NFT_CONTRACT> <TOKEN_ID> \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <YOUR_PRIVATE_KEY>

# Clear a PFP
cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 "clearPfp(uint256)" \
  <IMP_ID> \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <YOUR_PRIVATE_KEY>
```

**Supported Image Formats:**
- IPFS URLs (converted via public gateway)
- HTTP/HTTPS URLs
- Data URIs (data:image/...)

## License

MIT
