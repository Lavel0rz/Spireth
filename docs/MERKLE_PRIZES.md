# Merkle Prize Distribution

After a season freezes, rank prizes are distributed via a merkle tree to avoid O(n²) on-chain sorting.

## Overview

1. **Bell Ringer Prize (20%)**: Allocated on-chain at freeze time. Claimed via `claimBell()`.
2. **Rank Prizes (80%)**: Distributed via merkle proof. Owner publishes root via `publishPrizeRoot()`, players claim via `claimRank()`.

## Offchain Tree Generation

### Step 1: Enumerate Living Imps

Query all imps and filter out dead ones:

```javascript
const livingImps = [];
for (let i = 0; i < totalMinted; i++) {
  const imp = await contract.imps(i);
  const isDead = imp.isDead || (Date.now() / 1000 > imp.lastActivity + DEATH_THRESHOLD);
  if (!isDead) {
    livingImps.push({
      id: i,
      height: imp.height,
      heightReachedAt: imp.heightReachedAt
    });
  }
}
```

### Step 2: Sort by Rank

Sort imps by absolute height (descending), then by `heightReachedAt` (ascending for tiebreaker):

```javascript
livingImps.sort((a, b) => {
  const absA = Math.abs(a.height);
  const absB = Math.abs(b.height);
  
  if (absA !== absB) return absB - absA; // Higher absolute height ranks better
  
  // Earlier heightReachedAt wins ties
  return Number(a.heightReachedAt - b.heightReachedAt);
});
```

### Step 3: Calculate Paid Count (Ceil)

Top ceil(n/2) imps get paid:

```javascript
const paidCount = Math.ceil(livingImps.length / 2);
```

### Step 4: Calculate Prize Shares

Using triangular distribution with weights `(paidCount - rank)`:

```javascript
const rankPrizePool = prizePool - bellRingerPrize; // 80% of pool
const totalWeight = (paidCount * (paidCount + 1)) / 2;

const prizes = [];
for (let rank = 0; rank < paidCount; rank++) {
  const impId = livingImps[rank].id;
  const weight = paidCount - rank;
  const share = (rankPrizePool * BigInt(weight)) / BigInt(totalWeight);
  prizes.push({ impId, amount: share });
}
```

### Step 5: Build Merkle Tree

Using OpenZeppelin's MerkleTree library (or equivalent):

```javascript
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

// Leaf encoding: [impId, amount]
const leaves = prizes.map(p => [p.impId, p.amount.toString()]);

const tree = StandardMerkleTree.of(leaves, ["uint256", "uint256"]);

console.log("Merkle Root:", tree.root);

// Generate proofs for each imp
for (const [i, leaf] of tree.entries()) {
  const proof = tree.getProof(i);
  console.log(`Imp ${leaf[0]}: amount=${leaf[1]}, proof=${JSON.stringify(proof)}`);
}
```

### Step 6: Publish Root

Owner calls:

```solidity
contract.publishPrizeRoot(root);
```

### Step 7: Players Claim

Each player calls with their proof:

```solidity
contract.claimRank(impId, amount, proof);
```

## Leaf Encoding

The contract uses double-hashing (OpenZeppelin standard):

```solidity
bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(impId, amount))));
```

This matches `StandardMerkleTree` with types `["uint256", "uint256"]`.

## Formula Summary

| Component | Formula |
|-----------|---------|
| Paid Count | `ceil(livingCount / 2)` |
| Total Weight | `paidCount * (paidCount + 1) / 2` |
| Rank Weight | `paidCount - rank` (0-indexed) |
| Prize Share | `rankPrizePool * weight / totalWeight` |

## Example

With 10 living imps and 1 ETH rank pool:

- `paidCount = ceil(10/2) = 5`
- `totalWeight = 5 * 6 / 2 = 15`
- Rank 0: weight=5, share = 1 ETH * 5/15 = 0.333 ETH
- Rank 1: weight=4, share = 1 ETH * 4/15 = 0.267 ETH
- Rank 2: weight=3, share = 1 ETH * 3/15 = 0.200 ETH
- Rank 3: weight=2, share = 1 ETH * 2/15 = 0.133 ETH
- Rank 4: weight=1, share = 1 ETH * 1/15 = 0.067 ETH

Ranks 5-9 receive nothing.
