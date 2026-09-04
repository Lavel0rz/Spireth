// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/TheSpireth.sol";

contract TheSpirethTest is Test {
    TheSpireth public spireth;
    address owner = makeAddr("owner");
    address dev = makeAddr("dev");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address charlie = makeAddr("charlie");
    uint256 constant ROLL_COST = 0.002 ether;
    uint256 constant MINT_CAP = 100;

    function setUp() public {
        spireth = new TheSpireth(owner, dev, ROLL_COST, MINT_CAP);
    }

    function test_Mint() public {
        vm.prank(alice);
        spireth.mint();
        assertEq(spireth.ownerOf(0), alice);
        assertEq(spireth.totalMinted(), 1);
        assertTrue(spireth.hasMinted(alice));
    }

    function test_MintDuringLiveSeasonReverts() public {
        _setupLiveSeason();

        vm.prank(charlie);
        vm.expectRevert(TheSpireth.NotInSignup.selector);
        spireth.mint();
    }

    function test_MintRevertsWhenFrozen() public {
        _setupLiveSeason();
        vm.warp(block.timestamp + 45 days);
        spireth.forceFreeze();

        vm.prank(charlie);
        vm.expectRevert(TheSpireth.NotInSignup.selector);
        spireth.mint();
    }

    function test_MintOnePerWallet() public {
        vm.startPrank(alice);
        spireth.mint();
        vm.expectRevert(TheSpireth.AlreadyMinted.selector);
        spireth.mint();
        vm.stopPrank();
    }

    function test_SoundHorn() public {
        vm.prank(alice);
        spireth.mint();
        vm.prank(bob);
        spireth.mint();
        vm.prank(owner);
        spireth.soundHorn();
        assertEq(uint8(spireth.seasonState()), uint8(TheSpireth.SeasonState.Live));
    }

    function test_SoundHornRequiresMinimumMinters() public {
        vm.prank(alice);
        spireth.mint();
        vm.prank(owner);
        vm.expectRevert(TheSpireth.MinimumMintersNotMet.selector);
        spireth.soundHorn();
    }

    function test_CommitAndRevealRoll() public {
        _setupLiveSeason();
        uint256 secret = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(secret, uint256(0)));
        vm.prank(alice);
        spireth.commitRoll{value: ROLL_COST}(0, commitment);
        vm.roll(block.number + 4);
        vm.prank(alice);
        spireth.revealRoll(0, secret);
        (int8 height, , , , ,) = spireth.getImp(0);
        assertTrue(height >= -4 && height <= 4 && height != 0);
    }

    function test_CommitRollSplits80_20() public {
        _setupLiveSeason();
        uint256 devBefore = dev.balance;
        uint256 poolBefore = spireth.prizePool();
        bytes32 commitment = keccak256(abi.encodePacked(uint256(12345), uint256(0)));
        vm.prank(alice);
        spireth.commitRoll{value: ROLL_COST}(0, commitment);
        assertEq(dev.balance - devBefore, ROLL_COST * 20 / 100);
        assertEq(spireth.prizePool() - poolBefore, ROLL_COST * 80 / 100);
    }

    function test_DeathAt72Hours() public {
        _setupLiveSeason();
        vm.warp(block.timestamp + 72 hours + 1);
        (,,, bool isDead,,) = spireth.getImp(0);
        assertTrue(isDead);
    }

    function test_DeadImpCannotCommitRoll() public {
        _setupLiveSeason();
        vm.warp(block.timestamp + 72 hours + 1);
        bytes32 commitment = keccak256(abi.encodePacked(uint256(12345), uint256(0)));
        vm.prank(alice);
        vm.expectRevert(TheSpireth.ImpIsDead.selector);
        spireth.commitRoll{value: ROLL_COST}(0, commitment);
    }

    function test_DeadImpCannotRevealRoll() public {
        _setupLiveSeason();
        
        uint256 secret = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(secret, uint256(0)));
        vm.prank(alice);
        spireth.commitRoll{value: ROLL_COST}(0, commitment);
        
        vm.warp(block.timestamp + 72 hours + 1);
        vm.roll(block.number + 4);
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.ImpIsDead.selector);
        spireth.revealRoll(0, secret);
    }

    function test_CommitUpdatesLastActivity() public {
        _setupLiveSeason();
        
        vm.warp(block.timestamp + 24 hours);
        
        uint256 secret = 12345;
        bytes32 commitment = keccak256(abi.encodePacked(secret, uint256(0)));
        vm.prank(alice);
        spireth.commitRoll{value: ROLL_COST}(0, commitment);
        
        vm.warp(block.timestamp + 71 hours);
        
        (,,, bool isDead,,) = spireth.getImp(0);
        assertFalse(isDead);
        
        vm.warp(block.timestamp + 2 hours);
        (,,, bool isDeadNow,,) = spireth.getImp(0);
        assertTrue(isDeadNow);
    }

    function test_FreezeAt45Days() public {
        _setupLiveSeason();
        vm.warp(block.timestamp + 45 days);
        spireth.forceFreeze();
        assertEq(uint8(spireth.seasonState()), uint8(TheSpireth.SeasonState.Frozen));
    }

    function test_SetRollCostDuringSignup() public {
        vm.prank(owner);
        spireth.setRollCost(0.005 ether);
        assertEq(spireth.rollCost(), 0.005 ether);
    }

    function test_SetRollCostAfterHornReverts() public {
        _setupLiveSeason();
        vm.prank(owner);
        vm.expectRevert(TheSpireth.SeasonAlreadyLive.selector);
        spireth.setRollCost(0.005 ether);
    }

    function test_SetMintCapAfterHornReverts() public {
        _setupLiveSeason();
        vm.prank(owner);
        vm.expectRevert(TheSpireth.SeasonAlreadyLive.selector);
        spireth.setMintCap(200);
    }

    function test_FreezeAtPlus50() public {
        _setupLiveSeason();
        
        uint256 secret = 1;
        bool reachedSummit = false;
        
        for (uint256 i = 0; i < 200 && !reachedSummit; i++) {
            (int8 height, , , , ,) = spireth.getImp(0);
            if (height >= 50) {
                reachedSummit = true;
                break;
            }
            
            bytes32 commitment = keccak256(abi.encodePacked(secret, uint256(0)));
            vm.prank(alice);
            spireth.commitRoll{value: ROLL_COST}(0, commitment);
            vm.roll(block.number + 4);
            vm.prank(alice);
            spireth.revealRoll(0, secret);
            
            if (uint8(spireth.seasonState()) == uint8(TheSpireth.SeasonState.Frozen)) {
                reachedSummit = true;
                break;
            }
            
            vm.warp(block.timestamp + 24 hours + 1);
            secret++;
        }
        
        assertEq(spireth.SUMMIT(), int8(50));
        assertEq(spireth.ABYSS(), int8(-50));
    }

    function test_FreezeAtMinus50() public {
        _setupLiveSeason();
        
        uint256 secret = 1;
        bool reachedAbyss = false;
        
        for (uint256 i = 0; i < 200 && !reachedAbyss; i++) {
            (int8 height, , , , ,) = spireth.getImp(0);
            if (height <= -50) {
                reachedAbyss = true;
                break;
            }
            
            bytes32 commitment = keccak256(abi.encodePacked(secret, uint256(0)));
            vm.prank(alice);
            spireth.commitRoll{value: ROLL_COST}(0, commitment);
            vm.roll(block.number + 4);
            vm.prank(alice);
            spireth.revealRoll(0, secret);
            
            if (uint8(spireth.seasonState()) == uint8(TheSpireth.SeasonState.Frozen)) {
                reachedAbyss = true;
                break;
            }
            
            vm.warp(block.timestamp + 24 hours + 1);
            secret++;
        }
        
        assertEq(spireth.SUMMIT(), int8(50));
        assertEq(spireth.ABYSS(), int8(-50));
    }

    function test_ForceFreezeNoBellRinger() public {
        _setupLiveSeasonWithPool();
        
        uint256 poolBefore = spireth.prizePool();
        
        vm.warp(block.timestamp + 45 days);
        spireth.forceFreeze();
        
        assertEq(spireth.bellRingerPrize(), 0);
        assertEq(spireth.hasBellRinger(), false);
        assertEq(spireth.rankPrizePool(), poolBefore);
    }
    
    function test_BellRingerPrize20Percent() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        uint256 pool = spireth.prizePool();
        uint256 expectedBellPrize = pool * 20 / 100;
        
        assertEq(spireth.bellRingerPrize(), expectedBellPrize);
        assertTrue(spireth.hasBellRinger());
        assertEq(spireth.rankPrizePool(), pool - expectedBellPrize);
    }

    function test_ClaimBell() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        uint256 bellPrize = spireth.bellRingerPrize();
        assertTrue(bellPrize > 0, "Bell prize should be > 0");
        
        uint256 bellRingerId = spireth.bellRingerId();
        address bellRingerOwner = spireth.ownerOf(bellRingerId);
        
        uint256 balanceBefore = bellRingerOwner.balance;
        vm.prank(bellRingerOwner);
        spireth.claimBell();
        
        assertEq(bellRingerOwner.balance - balanceBefore, bellPrize);
        assertTrue(spireth.bellClaimed());
    }

    function test_ClaimBellTwiceReverts() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        uint256 bellRingerId = spireth.bellRingerId();
        address bellRingerOwner = spireth.ownerOf(bellRingerId);
        
        vm.prank(bellRingerOwner);
        spireth.claimBell();
        
        vm.prank(bellRingerOwner);
        vm.expectRevert(TheSpireth.AlreadyClaimed.selector);
        spireth.claimBell();
    }

    function test_ClaimBellNotOwnerReverts() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        uint256 bellRingerId = spireth.bellRingerId();
        address bellRingerOwner = spireth.ownerOf(bellRingerId);
        
        address notOwner = bellRingerOwner == alice ? bob : alice;
        
        vm.prank(notOwner);
        vm.expectRevert(TheSpireth.NotImpOwner.selector);
        spireth.claimBell();
    }

    function test_PublishPrizeRoot() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        bytes32 root = keccak256("test root");
        vm.prank(owner);
        spireth.publishPrizeRoot(root);
        
        assertEq(spireth.merkleRoot(), root);
    }

    function test_PublishPrizeRootTwiceReverts() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        bytes32 root = keccak256("test root");
        vm.prank(owner);
        spireth.publishPrizeRoot(root);
        
        vm.prank(owner);
        vm.expectRevert(TheSpireth.RootAlreadySet.selector);
        spireth.publishPrizeRoot(keccak256("new root"));
    }

    function test_ClaimRankWithValidProof() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        uint256 impId = 0;
        uint256 amount = 0.1 ether;
        
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(impId, amount))));
        bytes32 root = leaf;
        
        vm.prank(owner);
        spireth.publishPrizeRoot(root);
        
        bytes32[] memory proof = new bytes32[](0);
        
        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        spireth.claimRank(impId, amount, proof);
        
        assertEq(alice.balance - balanceBefore, amount);
        
        (,,,, bool hasClaimedRank,) = spireth.getImp(impId);
        assertTrue(hasClaimedRank);
    }

    function test_ClaimRankInvalidProofReverts() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        bytes32 root = keccak256("some root");
        vm.prank(owner);
        spireth.publishPrizeRoot(root);
        
        bytes32[] memory proof = new bytes32[](0);
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidProof.selector);
        spireth.claimRank(0, 0.1 ether, proof);
    }

    function test_ClaimRankTwiceReverts() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        uint256 impId = 0;
        uint256 amount = 0.1 ether;
        
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(impId, amount))));
        bytes32 root = leaf;
        
        vm.prank(owner);
        spireth.publishPrizeRoot(root);
        
        bytes32[] memory proof = new bytes32[](0);
        
        vm.prank(alice);
        spireth.claimRank(impId, amount, proof);
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.AlreadyClaimed.selector);
        spireth.claimRank(impId, amount, proof);
    }

    function test_ClaimRankRootNotSetReverts() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        bytes32[] memory proof = new bytes32[](0);
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.RootNotSet.selector);
        spireth.claimRank(0, 0.1 ether, proof);
    }

    function test_ClaimRankZeroAmountReverts() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        uint256 impId = 0;
        uint256 amount = 0;
        
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(impId, amount))));
        bytes32 root = leaf;
        
        vm.prank(owner);
        spireth.publishPrizeRoot(root);
        
        bytes32[] memory proof = new bytes32[](0);
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.NoPrize.selector);
        spireth.claimRank(impId, amount, proof);
    }

    function test_ClaimRankExceedsPoolReverts() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        uint256 rankPool = spireth.rankPrizePool();
        uint256 excessAmount = rankPool + 1 ether;
        
        uint256 impId = 0;
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(impId, excessAmount))));
        bytes32 root = leaf;
        
        vm.prank(owner);
        spireth.publishPrizeRoot(root);
        
        bytes32[] memory proof = new bytes32[](0);
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.ExceedsRankPool.selector);
        spireth.claimRank(impId, excessAmount, proof);
    }

    function test_SweepDustAfterClaims() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        vm.deal(address(spireth), address(spireth).balance + 0.001 ether);
        
        uint256 bellRingerId = spireth.bellRingerId();
        address bellRingerOwner = spireth.ownerOf(bellRingerId);
        uint256 amount = spireth.rankPrizePool();
        
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(bellRingerId, amount))));
        bytes32 root = leaf;
        
        vm.prank(owner);
        spireth.publishPrizeRoot(root);
        
        vm.prank(bellRingerOwner);
        spireth.claimBell();
        
        bytes32[] memory proof = new bytes32[](0);
        vm.prank(bellRingerOwner);
        spireth.claimRank(bellRingerId, amount, proof);
        
        address dustReceiver = makeAddr("dustReceiver");
        uint256 balanceBefore = dustReceiver.balance;
        
        vm.prank(owner);
        spireth.sweepDust(dustReceiver);
        
        assertTrue(dustReceiver.balance > balanceBefore);
    }

    function test_SweepDustCannotTakeUnclaimedPrizes() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        uint256 impId = 0;
        uint256 amount = spireth.rankPrizePool();
        
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(impId, amount))));
        bytes32 root = leaf;
        
        vm.prank(owner);
        spireth.publishPrizeRoot(root);
        
        uint256 contractBalance = address(spireth).balance;
        uint256 bellPrize = spireth.bellRingerPrize();
        uint256 rankPool = spireth.rankPrizePool();
        
        if (contractBalance <= bellPrize + rankPool) {
            vm.prank(owner);
            vm.expectRevert(TheSpireth.NoPrize.selector);
            spireth.sweepDust(owner);
        }
    }

    function test_SweepDustRequiresRoot() public {
        _setupLiveSeasonWithPool();
        _freezeWithBellRinger();
        
        vm.prank(owner);
        vm.expectRevert(TheSpireth.RootNotSet.selector);
        spireth.sweepDust(owner);
    }

    function test_DevFeeSoftFailAndWithdraw() public {
        RevertingReceiver revertingDev = new RevertingReceiver();
        TheSpireth spirethWithRevertingDev = new TheSpireth(owner, address(revertingDev), ROLL_COST, MINT_CAP);
        
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        
        vm.prank(alice);
        spirethWithRevertingDev.mint();
        vm.prank(bob);
        spirethWithRevertingDev.mint();
        vm.prank(owner);
        spirethWithRevertingDev.soundHorn();
        
        bytes32 commitment = keccak256(abi.encodePacked(uint256(12345), uint256(0)));
        vm.prank(alice);
        spirethWithRevertingDev.commitRoll{value: ROLL_COST}(0, commitment);
        
        uint256 expectedDevFee = ROLL_COST * 20 / 100;
        assertEq(spirethWithRevertingDev.pendingDevFees(), expectedDevFee);
        assertEq(spirethWithRevertingDev.prizePool(), ROLL_COST * 80 / 100);
        
        revertingDev.setAcceptEth(true);
        
        uint256 devBalanceBefore = address(revertingDev).balance;
        vm.prank(address(revertingDev));
        spirethWithRevertingDev.withdrawDevFees();
        
        assertEq(address(revertingDev).balance - devBalanceBefore, expectedDevFee);
        assertEq(spirethWithRevertingDev.pendingDevFees(), 0);
    }

    function test_WithdrawDevFeesNotDevReverts() public {
        vm.prank(alice);
        vm.expectRevert(TheSpireth.NotDev.selector);
        spireth.withdrawDevFees();
    }

    function test_WithdrawDevFeesNoPendingReverts() public {
        vm.prank(dev);
        vm.expectRevert(TheSpireth.NoPendingFees.selector);
        spireth.withdrawDevFees();
    }

    function test_EquipPfp() public {
        MockERC721 mockNft = new MockERC721();
        
        vm.prank(alice);
        spireth.mint();
        
        mockNft.mint(alice, 42);
        
        vm.prank(alice);
        spireth.equipPfp(0, address(mockNft), 42);
        
        (address nft, uint256 tokenId) = spireth.getEquippedPfp(0);
        assertEq(nft, address(mockNft));
        assertEq(tokenId, 42);
    }

    function test_ClearPfp() public {
        MockERC721 mockNft = new MockERC721();
        
        vm.prank(alice);
        spireth.mint();
        
        mockNft.mint(alice, 42);
        
        vm.prank(alice);
        spireth.equipPfp(0, address(mockNft), 42);
        
        vm.prank(alice);
        spireth.clearPfp(0);
        
        (address nft, uint256 tokenId) = spireth.getEquippedPfp(0);
        assertEq(nft, address(0));
        assertEq(tokenId, 0);
    }

    function test_EquipPfpNotImpOwner() public {
        MockERC721 mockNft = new MockERC721();
        
        vm.prank(alice);
        spireth.mint();
        
        mockNft.mint(bob, 42);
        
        vm.prank(bob);
        vm.expectRevert(TheSpireth.NotImpOwner.selector);
        spireth.equipPfp(0, address(mockNft), 42);
    }

    function test_EquipPfpNotNftOwner() public {
        MockERC721 mockNft = new MockERC721();
        
        vm.prank(alice);
        spireth.mint();
        
        mockNft.mint(bob, 42);
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.NotNftOwner.selector);
        spireth.equipPfp(0, address(mockNft), 42);
    }

    function test_ClearPfpNotOwner() public {
        MockERC721 mockNft = new MockERC721();
        
        vm.prank(alice);
        spireth.mint();
        
        mockNft.mint(alice, 42);
        
        vm.prank(alice);
        spireth.equipPfp(0, address(mockNft), 42);
        
        vm.prank(bob);
        vm.expectRevert(TheSpireth.NotImpOwner.selector);
        spireth.clearPfp(0);
    }

    function test_ClearPfpNoPfpEquipped() public {
        vm.prank(alice);
        spireth.mint();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.NoPfpEquipped.selector);
        spireth.clearPfp(0);
    }

    function _setupLiveSeason() internal {
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.prank(alice);
        spireth.mint();
        vm.prank(bob);
        spireth.mint();
        vm.prank(owner);
        spireth.soundHorn();
    }

    function _setupLiveSeasonWithPool() internal {
        _setupLiveSeason();
        
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint256(0)));
        vm.prank(alice);
        spireth.commitRoll{value: 1 ether}(0, commitment);
    }

    function _freezeWithBellRinger() internal {
        uint256 pool = spireth.prizePool();
        uint256 bellPrize = pool * 20 / 100;
        uint256 rankPool = pool - bellPrize;
        
        vm.store(address(spireth), bytes32(uint256(11)), bytes32(uint256(2)));
        
        vm.store(address(spireth), bytes32(uint256(14)), bytes32(uint256(0)));
        
        vm.store(address(spireth), bytes32(uint256(15)), bytes32(uint256(1)));
        
        vm.store(address(spireth), bytes32(uint256(20)), bytes32(bellPrize));
        
        vm.store(address(spireth), bytes32(uint256(23)), bytes32(rankPool));
    }
    
    function _freezeWithoutBellRinger() internal {
        vm.warp(block.timestamp + 45 days);
        spireth.forceFreeze();
    }
    
    function test_BillboardBidSucceedsLive() public {
        _setupLiveSeason();
        
        uint256 poolBefore = spireth.prizePool();
        uint256 devBefore = dev.balance;
        
        vm.prank(alice);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", "My Ad");
        
        (string memory url, string memory label, uint256 bid, address bidder) = spireth.getBillboard();
        assertEq(url, "https://example.com");
        assertEq(label, "My Ad");
        assertEq(bid, 0.001 ether);
        assertEq(bidder, alice);
        
        uint256 expectedDevShare = 0.001 ether * 10 / 100;
        uint256 expectedPoolShare = 0.001 ether - expectedDevShare;
        assertEq(dev.balance - devBefore, expectedDevShare);
        assertEq(spireth.prizePool() - poolBefore, expectedPoolShare);
    }
    
    function test_BillboardBid90_10Split() public {
        _setupLiveSeason();
        
        uint256 bidAmount = 0.1 ether;
        uint256 poolBefore = spireth.prizePool();
        uint256 devBefore = dev.balance;
        
        vm.prank(alice);
        spireth.bidBillboard{value: bidAmount}("https://example.com", "Test");
        
        uint256 expectedDevShare = bidAmount * 10 / 100;
        uint256 expectedPoolShare = bidAmount - expectedDevShare;
        assertEq(dev.balance - devBefore, expectedDevShare);
        assertEq(spireth.prizePool() - poolBefore, expectedPoolShare);
    }
    
    function test_BillboardBidTooLowReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.BidTooLow.selector);
        spireth.bidBillboard{value: 0.0009 ether}("https://example.com", "Test");
    }
    
    function test_BillboardSecondBidMustBeHigher() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", "First");
        
        vm.prank(bob);
        vm.expectRevert(TheSpireth.BidTooLow.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://other.com", "Second");
        
        vm.prank(bob);
        spireth.bidBillboard{value: 0.002 ether}("https://other.com", "Second");
        
        (string memory url, string memory label, uint256 bid, address bidder) = spireth.getBillboard();
        assertEq(url, "https://other.com");
        assertEq(label, "Second");
        assertEq(bid, 0.002 ether);
        assertEq(bidder, bob);
    }
    
    function test_BillboardHttpRevertsInvalidUrl() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("http://example.com", "Test");
    }
    
    function test_BillboardJavascriptRevertsInvalidUrl() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("javascript:alert(1)", "Test");
    }
    
    function test_BillboardDataUrlRevertsInvalidUrl() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("data:text/html,test", "Test");
    }
    
    function test_BillboardOversizedUrlReverts() public {
        _setupLiveSeason();
        
        bytes memory longUrl = new bytes(201);
        longUrl[0] = 0x68; // h
        longUrl[1] = 0x74; // t
        longUrl[2] = 0x74; // t
        longUrl[3] = 0x70; // p
        longUrl[4] = 0x73; // s
        longUrl[5] = 0x3a; // :
        longUrl[6] = 0x2f; // /
        longUrl[7] = 0x2f; // /
        for (uint i = 8; i < 201; i++) {
            longUrl[i] = 0x61; // a
        }
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}(string(longUrl), "Test");
    }
    
    function test_BillboardOversizedLabelReverts() public {
        _setupLiveSeason();
        
        bytes memory longLabel = new bytes(65);
        for (uint i = 0; i < 65; i++) {
            longLabel[i] = 0x61;
        }
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidLabel.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", string(longLabel));
    }
    
    function test_BillboardUrlWithAngleBracketsReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com/<script>", "Test");
    }
    
    function test_BillboardLabelWithAngleBracketsReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidLabel.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", "<script>alert(1)</script>");
    }
    
    function test_BillboardUrlWithBacktickReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com/`test", "Test");
    }
    
    function test_BillboardUrlWithQuotesReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com/\"test", "Test");
    }
    
    function test_BillboardUrlWithSingleQuoteReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com/'test", "Test");
    }
    
    function test_BillboardUrlWithBackslashReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com/\\test", "Test");
    }
    
    function test_BillboardUrlWithSpaceReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com/ test", "Test");
    }
    
    function test_BillboardUrlWithAtSignBeforeSlashReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://user@evil.com", "Test");
    }
    
    function test_BillboardUrlWithAtSignAfterSlashAllowed() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com/contact@email.com", "Test");
        
        (string memory url,,,) = spireth.getBillboard();
        assertEq(url, "https://example.com/contact@email.com");
    }
    
    function test_BillboardNotLiveReverts() public {
        vm.prank(alice);
        spireth.mint();
        vm.prank(bob);
        spireth.mint();
        
        vm.prank(alice);
        vm.expectRevert();
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", "Test");
    }
    
    function test_BillboardFrozenReverts() public {
        _setupLiveSeason();
        vm.warp(block.timestamp + 45 days);
        spireth.forceFreeze();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.NotLive.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", "Test");
    }
    
    function test_ClearBillboardOnlyOwner() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", "Test");
        
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUnauthorizedAccount.selector, alice));
        spireth.clearBillboard();
        
        vm.prank(owner);
        spireth.clearBillboard();
        
        (string memory url, string memory label, uint256 bid, address bidder) = spireth.getBillboard();
        assertEq(url, "");
        assertEq(label, "");
        assertEq(bid, 0.001 ether);
        assertEq(bidder, alice);
    }
    
    function test_BillboardNextBidAfterClear() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", "Test");
        
        vm.prank(owner);
        spireth.clearBillboard();
        
        assertEq(spireth.nextBillboardBid(), 0.002 ether);
    }
    
    function test_NextBillboardBidInitial() public {
        assertEq(spireth.nextBillboardBid(), 0.001 ether);
    }
    
    function test_NextBillboardBidAfterBid() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        spireth.bidBillboard{value: 0.005 ether}("https://example.com", "Test");
        
        assertEq(spireth.nextBillboardBid(), 0.006 ether);
    }
    
    function test_BillboardEmptyUrlReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidUrl.selector);
        spireth.bidBillboard{value: 0.001 ether}("", "Test");
    }
    
    function test_BillboardEmptyLabelReverts() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        vm.expectRevert(TheSpireth.InvalidLabel.selector);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", "");
    }
    
    function test_BillboardDevFeesSoftFail() public {
        RevertingReceiver revertingDev = new RevertingReceiver();
        TheSpireth spirethWithRevertingDev = new TheSpireth(owner, address(revertingDev), ROLL_COST, MINT_CAP);
        
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        
        vm.prank(alice);
        spirethWithRevertingDev.mint();
        vm.prank(bob);
        spirethWithRevertingDev.mint();
        vm.prank(owner);
        spirethWithRevertingDev.soundHorn();
        
        uint256 bidAmount = 0.01 ether;
        uint256 expectedDevFee = bidAmount * 10 / 100;
        
        vm.prank(alice);
        spirethWithRevertingDev.bidBillboard{value: bidAmount}("https://example.com", "Test");
        
        assertEq(spirethWithRevertingDev.pendingDevFees(), expectedDevFee);
        assertEq(spirethWithRevertingDev.prizePool(), bidAmount - expectedDevFee);
    }
    
    function test_BillboardLabelAllowsSpaces() public {
        _setupLiveSeason();
        
        vm.prank(alice);
        spireth.bidBillboard{value: 0.001 ether}("https://example.com", "My Cool Ad With Spaces");
        
        (, string memory label,,) = spireth.getBillboard();
        assertEq(label, "My Cool Ad With Spaces");
    }
}

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
error OwnableUnauthorizedAccount(address account);

contract MockERC721 {
    mapping(uint256 => address) private _owners;
    
    function mint(address to, uint256 tokenId) external {
        _owners[tokenId] = to;
    }
    
    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }
}

contract RevertingReceiver {
    bool public acceptEth = false;
    
    function setAcceptEth(bool _accept) external {
        acceptEth = _accept;
    }
    
    receive() external payable {
        if (!acceptEth) {
            revert("No ETH accepted");
        }
    }
}
