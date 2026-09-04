// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title The Spireth - Season 1
 * @notice A finite onchain race on Base. Imps climb an Ethereum-rhombus board.
 * 
 * RNG Design (Commit-Reveal with RANDAO-style delay):
 * To ensure fair dice rolls without requiring external VRF:
 * 1. Player calls commitRoll(commitment) with ETH payment
 *    - commitment = keccak256(abi.encodePacked(secret, impId))
 * 2. After REVEAL_DELAY blocks (~3), player calls revealRoll(secret)
 *    - Dice derived from: hash(secret, blockhashes at commit+3, +2, +1, impId)
 *    - Multiple blockhashes mixed for stronger entropy
 *    - Player commits before seeing the future blockhashes, so can't manipulate
 * 3. If not revealed within REVEAL_WINDOW (256) blocks, roll is forfeited (ETH stays in pool)
 * 
 * This design is manipulation-resistant because:
 * - Player commits their secret before the determining blockhashes exist
 * - Player cannot change their secret after committing
 * - Block producers cannot know the player's secret when producing the block
 * - REVEAL_DELAY of 3 blocks reduces single-block validator bias
 *
 * Prize Distribution (Offchain Merkle):
 * - On freeze: bell ringer gets 20% allocated on-chain (claimBell)
 * - Rank prizes: owner publishes merkle root; players claim via claimRank with proof
 * - Leaf encoding: keccak256(abi.encodePacked(impId, amount))
 * - See docs/MERKLE_PRIZES.md for offchain tree generation
 */
contract TheSpireth is ERC721, Ownable, ReentrancyGuard {
    int8 public constant SUMMIT = 50;
    int8 public constant ABYSS = -50;
    uint256 public constant SIGNUP_DURATION = 72 hours;
    uint256 public constant SEASON_MAX_DURATION = 45 days;
    uint256 public constant ROLL_COOLDOWN = 24 hours;
    uint256 public constant DEATH_THRESHOLD = 72 hours;
    uint256 public constant REVEAL_WINDOW = 256;
    uint256 public constant REVEAL_DELAY = 3;
    
    enum SeasonState { Signup, Live, Frozen }
    
    struct Imp {
        int8 height;
        uint64 lastRoll;
        uint64 lastActivity;
        uint64 heightReachedAt;
        bool isDead;
        bool hasClaimedRank;
    }
    
    struct PendingRoll {
        bytes32 commitment;
        uint64 commitBlock;
        bool pending;
    }
    
    struct EquippedPfp {
        address nft;
        uint256 tokenId;
    }
    
    address public immutable dev;
    uint256 public rollCost;
    uint256 public mintCap;
    
    uint256 public deployTime;
    uint256 public hornTime;
    SeasonState public seasonState;
    
    uint256 public prizePool;
    uint256 public totalMinted;
    uint256 public bellRingerId;
    bool public hasBellRinger;
    
    mapping(uint256 => Imp) public imps;
    mapping(uint256 => PendingRoll) public pendingRolls;
    mapping(address => bool) public hasMinted;
    mapping(uint256 => EquippedPfp) public equippedPfps;
    
    uint256 public bellRingerPrize;
    bool public bellClaimed;
    
    bytes32 public merkleRoot;
    uint256 public rankPrizePool;
    uint256 public rankClaimedTotal;
    
    uint256 public pendingDevFees;
    
    event ImpMinted(address indexed owner, uint256 indexed impId);
    event HornSounded(uint256 timestamp);
    event RollCommitted(uint256 indexed impId, bytes32 commitment);
    event RollRevealed(uint256 indexed impId, int8 dice, int8 newHeight);
    event RollForfeited(uint256 indexed impId);
    event ImpDied(uint256 indexed impId, int8 finalHeight);
    event SeasonFrozen(uint256 indexed bellRingerId, int8 finalHeight);
    event PrizeRootPublished(bytes32 indexed root);
    event BellClaimed(uint256 indexed impId, address indexed owner, uint256 amount);
    event RankClaimed(uint256 indexed impId, address indexed owner, uint256 amount);
    event PfpEquipped(uint256 indexed impId, address indexed nft, uint256 tokenId);
    event PfpCleared(uint256 indexed impId);
    event DevFeeAccrued(uint256 amount);
    event DevFeesWithdrawn(address indexed to, uint256 amount);
    event DustSwept(address indexed to, uint256 amount);
    
    error NotInSignup();
    error NotLive();
    error NotFrozen();
    error AlreadyMinted();
    error MintCapReached();
    error NotImpOwner();
    error ImpIsDead();
    error RollOnCooldown();
    error InsufficientPayment();
    error NoPendingRoll();
    error RevealTooEarly();
    error RevealWindowExpired();
    error InvalidCommitment();
    error AlreadyHasPendingRoll();
    error MinimumMintersNotMet();
    error HornAlreadySounded();
    error NoPrize();
    error AlreadyClaimed();
    error TransferFailed();
    error SeasonExpired();
    error NotNftOwner();
    error NoPfpEquipped();
    error SeasonAlreadyLive();
    error NotDev();
    error NoPendingFees();
    error RootNotSet();
    error RootAlreadySet();
    error InvalidProof();
    error NotBellRinger();
    
    constructor(
        address _owner,
        address _dev,
        uint256 _rollCost,
        uint256 _mintCap
    ) ERC721("The Spireth Imp", "IMP") Ownable(_owner) {
        dev = _dev;
        rollCost = _rollCost;
        mintCap = _mintCap;
        deployTime = block.timestamp;
        seasonState = SeasonState.Signup;
    }
    
    function mint() external {
        if (seasonState != SeasonState.Signup) revert NotInSignup();
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        if (totalMinted >= mintCap) revert MintCapReached();
        
        if (block.timestamp > deployTime + SIGNUP_DURATION) {
            _soundHorn();
        }
        
        uint256 impId = totalMinted;
        totalMinted++;
        hasMinted[msg.sender] = true;
        
        imps[impId] = Imp({
            height: 0,
            lastRoll: 0,
            lastActivity: uint64(block.timestamp),
            heightReachedAt: uint64(block.timestamp),
            isDead: false,
            hasClaimedRank: false
        });
        
        _safeMint(msg.sender, impId);
        emit ImpMinted(msg.sender, impId);
    }
    
    function soundHorn() external onlyOwner {
        if (seasonState != SeasonState.Signup) revert HornAlreadySounded();
        if (totalMinted < 2) revert MinimumMintersNotMet();
        _soundHorn();
    }
    
    function _soundHorn() internal {
        seasonState = SeasonState.Live;
        hornTime = block.timestamp;
        
        for (uint256 i = 0; i < totalMinted; i++) {
            imps[i].lastActivity = uint64(block.timestamp);
        }
        
        emit HornSounded(block.timestamp);
    }
    
    function commitRoll(uint256 impId, bytes32 commitment) external payable nonReentrant {
        _checkLiveAndNotExpired();
        if (ownerOf(impId) != msg.sender) revert NotImpOwner();
        
        Imp storage imp = imps[impId];
        
        _updateDeathStatus(impId);
        if (imp.isDead) revert ImpIsDead();
        
        if (imp.lastRoll != 0 && block.timestamp < imp.lastRoll + ROLL_COOLDOWN) revert RollOnCooldown();
        
        if (pendingRolls[impId].pending) revert AlreadyHasPendingRoll();
        
        if (msg.value < rollCost) revert InsufficientPayment();
        
        uint256 devShare = msg.value * 20 / 100;
        uint256 poolShare = msg.value - devShare;
        prizePool += poolShare;
        
        (bool success, ) = dev.call{value: devShare}("");
        if (!success) {
            pendingDevFees += devShare;
            emit DevFeeAccrued(devShare);
        }
        
        imp.lastActivity = uint64(block.timestamp);
        
        pendingRolls[impId] = PendingRoll({
            commitment: commitment,
            commitBlock: uint64(block.number),
            pending: true
        });
        
        emit RollCommitted(impId, commitment);
    }
    
    function revealRoll(uint256 impId, uint256 secret) external nonReentrant {
        _checkLiveAndNotExpired();
        if (ownerOf(impId) != msg.sender) revert NotImpOwner();
        
        _updateDeathStatus(impId);
        if (imps[impId].isDead) revert ImpIsDead();
        
        PendingRoll storage pending = pendingRolls[impId];
        if (!pending.pending) revert NoPendingRoll();
        
        if (block.number <= pending.commitBlock + REVEAL_DELAY) revert RevealTooEarly();
        
        if (block.number > pending.commitBlock + REVEAL_WINDOW) revert RevealWindowExpired();
        
        bytes32 expectedCommitment = keccak256(abi.encodePacked(secret, impId));
        if (pending.commitment != expectedCommitment) revert InvalidCommitment();
        
        bytes32 h1 = blockhash(pending.commitBlock + REVEAL_DELAY);
        bytes32 h2 = blockhash(pending.commitBlock + REVEAL_DELAY - 1);
        bytes32 h3 = blockhash(pending.commitBlock + REVEAL_DELAY - 2);
        uint256 rand = uint256(keccak256(abi.encodePacked(secret, h1, h2, h3, impId)));
        int8 dice = _randToDice(rand);
        
        pending.pending = false;
        
        Imp storage imp = imps[impId];
        int8 newHeight = imp.height + dice;
        
        bool reachedEnd = false;
        if (newHeight >= SUMMIT) {
            newHeight = SUMMIT;
            reachedEnd = true;
        } else if (newHeight <= ABYSS) {
            newHeight = ABYSS;
            reachedEnd = true;
        }
        
        imp.height = newHeight;
        imp.lastRoll = uint64(block.timestamp);
        imp.lastActivity = uint64(block.timestamp);
        imp.heightReachedAt = uint64(block.timestamp);
        
        emit RollRevealed(impId, dice, newHeight);
        
        if (reachedEnd) {
            _freezeSeason(impId, true);
        }
    }
    
    function forfeitRoll(uint256 impId) external {
        PendingRoll storage pending = pendingRolls[impId];
        if (!pending.pending) revert NoPendingRoll();
        if (block.number <= pending.commitBlock + REVEAL_WINDOW) revert RevealTooEarly();
        
        pending.pending = false;
        emit RollForfeited(impId);
    }
    
    function forceFreeze() external {
        if (seasonState != SeasonState.Live) revert NotLive();
        if (block.timestamp < hornTime + SEASON_MAX_DURATION) revert SeasonExpired();
        _freezeSeason(0, false);
    }
    
    function _checkLiveAndNotExpired() internal view {
        if (seasonState == SeasonState.Signup) {
            if (block.timestamp > deployTime + SIGNUP_DURATION) {
                revert NotLive();
            }
            revert NotLive();
        }
        if (seasonState == SeasonState.Frozen) revert NotFrozen();
    }
    
    function _updateDeathStatus(uint256 impId) internal {
        Imp storage imp = imps[impId];
        if (!imp.isDead && block.timestamp > imp.lastActivity + DEATH_THRESHOLD) {
            imp.isDead = true;
            emit ImpDied(impId, imp.height);
        }
    }
    
    function _randToDice(uint256 rand) internal pure returns (int8) {
        uint8 face = uint8(rand % 8);
        if (face < 4) {
            return -int8(4 - face);
        } else {
            return int8(face - 3);
        }
    }
    
    function _freezeSeason(uint256 _bellRingerId, bool _hasBellRinger) internal {
        seasonState = SeasonState.Frozen;
        bellRingerId = _bellRingerId;
        hasBellRinger = _hasBellRinger;
        
        if (_hasBellRinger) {
            bellRingerPrize = prizePool * 20 / 100;
        }
        
        rankPrizePool = prizePool - bellRingerPrize;
        
        emit SeasonFrozen(_bellRingerId, _hasBellRinger ? imps[_bellRingerId].height : int8(0));
    }
    
    function publishPrizeRoot(bytes32 root) external onlyOwner {
        if (seasonState != SeasonState.Frozen) revert NotFrozen();
        if (merkleRoot != bytes32(0)) revert RootAlreadySet();
        
        merkleRoot = root;
        emit PrizeRootPublished(root);
    }
    
    function claimBell() external nonReentrant {
        if (seasonState != SeasonState.Frozen) revert NotFrozen();
        if (!hasBellRinger) revert NotBellRinger();
        if (bellClaimed) revert AlreadyClaimed();
        if (ownerOf(bellRingerId) != msg.sender) revert NotImpOwner();
        
        bellClaimed = true;
        
        (bool success, ) = msg.sender.call{value: bellRingerPrize}("");
        if (!success) revert TransferFailed();
        
        emit BellClaimed(bellRingerId, msg.sender, bellRingerPrize);
    }
    
    function claimRank(uint256 impId, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        if (seasonState != SeasonState.Frozen) revert NotFrozen();
        if (merkleRoot == bytes32(0)) revert RootNotSet();
        if (ownerOf(impId) != msg.sender) revert NotImpOwner();
        
        Imp storage imp = imps[impId];
        if (imp.hasClaimedRank) revert AlreadyClaimed();
        
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(impId, amount))));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) revert InvalidProof();
        
        imp.hasClaimedRank = true;
        rankClaimedTotal += amount;
        
        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
        
        emit RankClaimed(impId, msg.sender, amount);
    }
    
    function _absHeight(int8 h) internal pure returns (uint8) {
        return h >= 0 ? uint8(int8(h)) : uint8(-h);
    }
    
    function equipPfp(uint256 impId, address nft, uint256 tokenId) external {
        if (ownerOf(impId) != msg.sender) revert NotImpOwner();
        if (IERC721(nft).ownerOf(tokenId) != msg.sender) revert NotNftOwner();
        
        equippedPfps[impId] = EquippedPfp({nft: nft, tokenId: tokenId});
        emit PfpEquipped(impId, nft, tokenId);
    }
    
    function clearPfp(uint256 impId) external {
        if (ownerOf(impId) != msg.sender) revert NotImpOwner();
        if (equippedPfps[impId].nft == address(0)) revert NoPfpEquipped();
        
        delete equippedPfps[impId];
        emit PfpCleared(impId);
    }
    
    function getImp(uint256 impId) external view returns (
        int8 height,
        uint64 lastRoll,
        uint64 heightReachedAt,
        bool isDead,
        bool hasClaimedRank,
        address owner
    ) {
        Imp storage imp = imps[impId];
        return (
            imp.height,
            imp.lastRoll,
            imp.heightReachedAt,
            imp.isDead || (block.timestamp > imp.lastActivity + DEATH_THRESHOLD),
            imp.hasClaimedRank,
            _ownerOf(impId)
        );
    }
    
    function getPendingRoll(uint256 impId) external view returns (
        bytes32 commitment,
        uint64 commitBlock,
        bool pending,
        bool expired
    ) {
        PendingRoll storage roll = pendingRolls[impId];
        return (
            roll.commitment,
            roll.commitBlock,
            roll.pending,
            roll.pending && block.number > roll.commitBlock + REVEAL_WINDOW
        );
    }
    
    function getEquippedPfp(uint256 impId) external view returns (address nft, uint256 tokenId) {
        EquippedPfp storage pfp = equippedPfps[impId];
        return (pfp.nft, pfp.tokenId);
    }
    
    function canRoll(uint256 impId) external view returns (bool) {
        if (seasonState != SeasonState.Live) return false;
        if (pendingRolls[impId].pending) return false;
        
        Imp storage imp = imps[impId];
        if (imp.isDead) return false;
        if (block.timestamp > imp.lastActivity + DEATH_THRESHOLD) return false;
        if (imp.lastRoll != 0 && block.timestamp < imp.lastRoll + ROLL_COOLDOWN) return false;
        
        return true;
    }
    
    function canReveal(uint256 impId) external view returns (bool) {
        PendingRoll storage roll = pendingRolls[impId];
        if (!roll.pending) return false;
        if (block.number <= roll.commitBlock + REVEAL_DELAY) return false;
        if (block.number > roll.commitBlock + REVEAL_WINDOW) return false;
        return true;
    }
    
    function timeUntilDeath(uint256 impId) external view returns (uint256) {
        Imp storage imp = imps[impId];
        if (imp.isDead) return 0;
        
        uint256 deathTime = imp.lastActivity + DEATH_THRESHOLD;
        if (block.timestamp >= deathTime) return 0;
        return deathTime - block.timestamp;
    }
    
    function timeUntilNextRoll(uint256 impId) external view returns (uint256) {
        Imp storage imp = imps[impId];
        uint256 nextRollTime = imp.lastRoll + ROLL_COOLDOWN;
        if (block.timestamp >= nextRollTime) return 0;
        return nextRollTime - block.timestamp;
    }
    
    function signupTimeRemaining() external view returns (uint256) {
        if (seasonState != SeasonState.Signup) return 0;
        uint256 endTime = deployTime + SIGNUP_DURATION;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }
    
    function seasonTimeRemaining() external view returns (uint256) {
        if (seasonState != SeasonState.Live) return 0;
        uint256 endTime = hornTime + SEASON_MAX_DURATION;
        if (block.timestamp >= endTime) return 0;
        return endTime - block.timestamp;
    }
    
    function setRollCost(uint256 _rollCost) external onlyOwner {
        if (seasonState != SeasonState.Signup) revert SeasonAlreadyLive();
        rollCost = _rollCost;
    }
    
    function setMintCap(uint256 _mintCap) external onlyOwner {
        if (seasonState != SeasonState.Signup) revert SeasonAlreadyLive();
        require(_mintCap >= totalMinted, "Cap below minted");
        mintCap = _mintCap;
    }
    
    function withdrawDevFees() external nonReentrant {
        if (msg.sender != dev) revert NotDev();
        uint256 amount = pendingDevFees;
        if (amount == 0) revert NoPendingFees();
        
        pendingDevFees = 0;
        
        (bool success, ) = dev.call{value: amount}("");
        if (!success) revert TransferFailed();
        
        emit DevFeesWithdrawn(dev, amount);
    }
    
    function sweepDust(address to) external nonReentrant onlyOwner {
        if (seasonState != SeasonState.Frozen) revert NotFrozen();
        if (merkleRoot == bytes32(0)) revert RootNotSet();
        
        uint256 unclaimedBell = bellClaimed ? 0 : bellRingerPrize;
        uint256 unclaimedRank = rankPrizePool - rankClaimedTotal;
        uint256 outstanding = unclaimedBell + unclaimedRank + pendingDevFees;
        
        uint256 sweepable = address(this).balance > outstanding 
            ? address(this).balance - outstanding 
            : 0;
        
        if (sweepable == 0) revert NoPrize();
        
        (bool success, ) = to.call{value: sweepable}("");
        if (!success) revert TransferFailed();
        
        emit DustSwept(to, sweepable);
    }
}
