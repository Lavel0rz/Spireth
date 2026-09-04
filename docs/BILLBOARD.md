# Floor 0 Billboard

The Spireth features an onchain outbid-style billboard displayed on floor 0 (the center strip of the rhombus board). During the Live season, anyone can bid ETH to place their HTTPS link on this prominent location.

## Rules

### Bidding
- **Minimum increment**: Each bid must be ≥ last bid + 0.001 ETH
- **First bid**: Must be at least 0.001 ETH
- **Winner-take-slot**: Prior bids are NOT refunded (similar to outbid.lol)
- **Timing**: Billboard bidding is only available during the Live season (not during Signup or Frozen)

### Revenue Split
- **90%** goes to the prize pool
- **10%** goes to the dev address (uses soft-fail `pendingDevFees` pattern if transfer fails)

### Content Restrictions

**URL Requirements:**
- Must start with `https://` (case-sensitive, lowercase)
- Maximum length: 200 bytes
- Forbidden characters: `` ` ``, `"`, `'`, `<`, `>`, `\`, space, tab, newline, carriage return, null byte
- No `@` symbol before the first `/` after the host (prevents credential-in-URL phishing)

**Label Requirements:**
- Minimum length: 1 character
- Maximum length: 64 bytes
- Forbidden characters: `<`, `>`, `` ` ``, null byte
- Spaces are allowed

### Owner Emergency Clear
The contract owner can call `clearBillboard()` to remove potentially harmful or phishing content. This:
- Clears the URL and label (sets to empty strings)
- Preserves the bid history (bidAmount and bidder remain)
- The next bid must still exceed the previous bid amount

## Contract Interface

### Constants
```solidity
uint256 public constant BILLBOARD_MIN_INCREMENT = 0.001 ether;
uint256 public constant BILLBOARD_URL_MAX = 200;
uint256 public constant BILLBOARD_LABEL_MAX = 64;
```

### State Variables
```solidity
string public billboardUrl;
string public billboardLabel;
uint256 public billboardBid;       // Last winning bid (0 if never bid)
address public billboardBidder;
```

### Functions

#### `bidBillboard(string calldata url, string calldata label) external payable`
Place a new billboard bid. Requires:
- Season must be Live
- `msg.value >= billboardBid + BILLBOARD_MIN_INCREMENT` (or just `>= BILLBOARD_MIN_INCREMENT` if first bid)
- URL and label must pass validation

#### `clearBillboard() external onlyOwner`
Emergency clear for phishing/harmful content. Clears URL and label but keeps bid floor.

#### `nextBillboardBid() external view returns (uint256)`
Returns the minimum bid required for the next billboard placement.

#### `getBillboard() external view returns (string url, string label, uint256 bid, address bidder)`
Returns the current billboard state.

### Events
```solidity
event BillboardBid(address indexed bidder, uint256 amount, string url, string label);
event BillboardCleared(address indexed by);
```

## Client Integration

### Display
- Floor 0 on the game board has a thickened platform serving as the "billboard strip"
- When a billboard URL is set, the label is displayed centered on floor 0
- A subtle "External link" indicator shows users this opens an external URL

### Click Behavior
- Clicking the floor 0 billboard area opens the URL in a new tab with `noopener,noreferrer`
- Client-side validation ensures only `https://` URLs are opened
- Uses `window.open()` with security flags to prevent tab-napping attacks

### Bidding UI
The BillboardPanel component provides:
- Current billboard display (label, URL, bid, bidder)
- Next minimum bid indicator
- Input form for label, URL, and bid amount
- Client-side validation matching contract requirements
- Warning that prior bids are not refunded

## Security Considerations

1. **HTTPS-only**: Prevents `javascript:`, `data:`, `ipfs://`, etc. protocol attacks
2. **Character filtering**: Prevents XSS via URL/label injection
3. **No @-before-slash**: Reduces credential-in-URL phishing attacks
4. **Client-side rendering**: Uses `fillText()` only, never `innerHTML`
5. **noopener,noreferrer**: Prevents opened pages from accessing the opener window
6. **Owner clear**: Emergency response capability for harmful content
