// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title The Spireth - Season 1
 * @notice A finite onchain race on Base. Imps climb an Ethereum-rhombus board.
 * 
 * RNG Design (Commit-Reveal):
 * To ensure fair dice rolls without requiring external VRF:
 * 1. Player calls commitRoll(commitment) with ETH payment
 *    - commitment = keccak256(abi.encodePacked(secret, impId))
 * 2. After 1+ blocks, player calls revealRoll(secret)
 *    - Dice derived from: hash(secret, blockhash of commit block + 1)
 *    - Player commits before seeing the future blockhash, so can't manipulate
 * 3. If not revealed within 256 blocks, roll is forfeited (ETH stays in pool)
 * 
 * This design is manipulation-resistant because:
 * - Player commits their secret before the determining blockhash exists
 * - Player cannot change their secret after committing
 * - Block producers cannot know the player's secret when producing the block
 */
contract TheSpireth is ERC721, Ownable, ReentrancyGuard {
    int8 public constant SUMMIT = 36;
    int8 public constant ABYSS = -36;
    uint256 public constant SIGNUP_DURATION = 72 hours;
    uint256 public constant SEASON_MAX_DURATION = 45 days;
    uint256 public constant ROLL_COOLDOWN = 24 hours;
    uint256 public constant DEATH_THRESHOLD = 72 hours;
    uint256 public constant REVEAL_WINDOW = 256;
    
    enum SeasonState { Signup, Live, Frozen }
    
    struct Imp {
        int8 height;
        uint64 lastRoll;
        uint64 lastActivity;
        uint64 heightReachedAt;
        bool isDead;
        bool hasClaimed;
    }
    
    struct PendingRoll {
        bytes32 commitment;
        uint64 commitBlock;
        bool pending;
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
    
    uint256[] public livingImpsAtFreeze;
    uint256 public bellRingerPrize;
    mapping(uint256 => uint256) public impPrize;
    
    event ImpMinted(address indexed owner, uint256 indexed impId);
    event HornSounded(uint256 timestamp);
    event RollCommitted(uint256 indexed impId, bytes32 commitment);
    event RollRevealed(uint256 indexed impId, int8 dice, int8 newHeight);
    event RollForfeited(uint256 indexed impId);
    event ImpDied(uint256 indexed impId, int8 finalHeight);
    event SeasonFrozen(uint256 indexed bellRingerId, int8 finalHeight);
    event PrizeClaimed(uint256 indexed impId, address indexed owner, uint256 amount);
    
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
            revert NotInSignup();
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
            hasClaimed: false
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
        if (!success) revert TransferFailed();
        
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
        
        PendingRoll storage pending = pendingRolls[impId];
        if (!pending.pending) revert NoPendingRoll();
        
        if (block.number <= pending.commitBlock) revert RevealTooEarly();
        
        if (block.number > pending.commitBlock + REVEAL_WINDOW) revert RevealWindowExpired();
        
        bytes32 expectedCommitment = keccak256(abi.encodePacked(secret, impId));
        if (pending.commitment != expectedCommitment) revert InvalidCommitment();
        
        bytes32 blockHash = blockhash(pending.commitBlock + 1);
        
        uint256 rand = uint256(keccak256(abi.encodePacked(secret, blockHash, impId)));
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
        
        delete livingImpsAtFreeze;
        for (uint256 i = 0; i < totalMinted; i++) {
            _updateDeathStatus(i);
            if (!imps[i].isDead) {
                livingImpsAtFreeze.push(i);
            }
        }
        
        _sortLivingImps();
        _calculatePrizes(_bellRingerId, _hasBellRinger);
        
        emit SeasonFrozen(_bellRingerId, _hasBellRinger ? imps[_bellRingerId].height : int8(0));
    }
    
    function _sortLivingImps() internal {
        uint256 len = livingImpsAtFreeze.length;
        if (len <= 1) return;
        
        for (uint256 i = 1; i < len; i++) {
            uint256 key = livingImpsAtFreeze[i];
            int256 j = int256(i) - 1;
            
            while (j >= 0 && _compareImps(livingImpsAtFreeze[uint256(j)], key) < 0) {
                livingImpsAtFreeze[uint256(j + 1)] = livingImpsAtFreeze[uint256(j)];
                j--;
            }
            livingImpsAtFreeze[uint256(j + 1)] = key;
        }
    }
    
    function _compareImps(uint256 a, uint256 b) internal view returns (int256) {
        Imp storage impA = imps[a];
        Imp storage impB = imps[b];
        
        uint8 absA = impA.height >= 0 ? uint8(int8(impA.height)) : uint8(-impA.height);
        uint8 absB = impB.height >= 0 ? uint8(int8(impB.height)) : uint8(-impB.height);
        
        if (absA > absB) return 1;
        if (absA < absB) return -1;
        
        if (impA.heightReachedAt < impB.heightReachedAt) return 1;
        if (impA.heightReachedAt > impB.heightReachedAt) return -1;
        return 0;
    }
    
    function _calculatePrizes(uint256 _bellRingerId, bool _hasBellRinger) internal {
        uint256 pool = prizePool;
        if (pool == 0 || livingImpsAtFreeze.length == 0) return;
        
        uint256 paidCount = livingImpsAtFreeze.length / 2;
        if (paidCount == 0 && livingImpsAtFreeze.length > 0) paidCount = 1;
        
        if (_hasBellRinger) {
            bellRingerPrize = pool * 20 / 100;
            impPrize[_bellRingerId] = bellRingerPrize;
        }
        
        uint256 remainingPool = pool - bellRingerPrize;
        uint256 totalWeight = paidCount * (paidCount + 1) / 2;
        
        for (uint256 rank = 0; rank < paidCount; rank++) {
            uint256 impId = livingImpsAtFreeze[rank];
            uint256 weight = paidCount - rank;
            uint256 share = (remainingPool * weight) / totalWeight;
            impPrize[impId] += share;
        }
    }
    
    function _absHeight(int8 h) internal pure returns (uint8) {
        return h >= 0 ? uint8(int8(h)) : uint8(-h);
    }
    
    function claim(uint256 impId) external nonReentrant {
        if (seasonState != SeasonState.Frozen) revert NotFrozen();
        if (ownerOf(impId) != msg.sender) revert NotImpOwner();
        
        Imp storage imp = imps[impId];
        if (imp.hasClaimed) revert AlreadyClaimed();
        
        uint256 prize = impPrize[impId];
        if (prize == 0) revert NoPrize();
        
        imp.hasClaimed = true;
        
        (bool success, ) = msg.sender.call{value: prize}("");
        if (!success) revert TransferFailed();
        
        emit PrizeClaimed(impId, msg.sender, prize);
    }
    
    function getImp(uint256 impId) external view returns (
        int8 height,
        uint64 lastRoll,
        uint64 heightReachedAt,
        bool isDead,
        bool hasClaimed,
        address owner
    ) {
        Imp storage imp = imps[impId];
        return (
            imp.height,
            imp.lastRoll,
            imp.heightReachedAt,
            imp.isDead || (block.timestamp > imp.lastActivity + DEATH_THRESHOLD),
            imp.hasClaimed,
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
    
    function canRoll(uint256 impId) external view returns (bool) {
        if (seasonState != SeasonState.Live) return false;
        if (pendingRolls[impId].pending) return false;
        
        Imp storage imp = imps[impId];
        if (imp.isDead) return false;
        if (block.timestamp > imp.lastActivity + DEATH_THRESHOLD) return false;
        if (imp.lastRoll != 0 && block.timestamp < imp.lastRoll + ROLL_COOLDOWN) return false;
        
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
    
    function getLivingImpsAtFreeze() external view returns (uint256[] memory) {
        return livingImpsAtFreeze;
    }
    
    function getLivingCount() external view returns (uint256) {
        return livingImpsAtFreeze.length;
    }
    
    function setRollCost(uint256 _rollCost) external onlyOwner {
        rollCost = _rollCost;
    }
    
    function setMintCap(uint256 _mintCap) external onlyOwner {
        require(_mintCap >= totalMinted, "Cap below minted");
        mintCap = _mintCap;
    }
}
