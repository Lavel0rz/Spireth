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

    function test_MintDuringLiveSeason() public {
        _setupLiveSeason();

        vm.prank(charlie);
        spireth.mint();

        assertEq(spireth.ownerOf(2), charlie);
        assertEq(spireth.totalMinted(), 3);
        assertTrue(spireth.hasMinted(charlie));
        assertEq(uint8(spireth.seasonState()), uint8(TheSpireth.SeasonState.Live));
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
        vm.roll(block.number + 2);
        vm.prank(alice);
        spireth.revealRoll(0, secret);
        (int8 height, , , , , ) = spireth.getImp(0);
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

    function test_DeadImpCannotRoll() public {
        _setupLiveSeason();
        vm.warp(block.timestamp + 72 hours + 1);
        bytes32 commitment = keccak256(abi.encodePacked(uint256(12345), uint256(0)));
        vm.prank(alice);
        vm.expectRevert(TheSpireth.ImpIsDead.selector);
        spireth.commitRoll{value: ROLL_COST}(0, commitment);
    }

    function test_FreezeAt45Days() public {
        _setupLiveSeason();
        vm.warp(block.timestamp + 45 days);
        spireth.forceFreeze();
        assertEq(uint8(spireth.seasonState()), uint8(TheSpireth.SeasonState.Frozen));
    }

    function test_SetRollCost() public {
        vm.prank(owner);
        spireth.setRollCost(0.005 ether);
        assertEq(spireth.rollCost(), 0.005 ether);
    }

    function test_FreezeAtPlus25() public {
        _setupLiveSeason();
        
        uint256 secret = 1;
        bool reachedSummit = false;
        
        for (uint256 i = 0; i < 100 && !reachedSummit; i++) {
            (int8 height, , , , ,) = spireth.getImp(0);
            if (height >= 25) {
                reachedSummit = true;
                break;
            }
            
            bytes32 commitment = keccak256(abi.encodePacked(secret, uint256(0)));
            vm.prank(alice);
            spireth.commitRoll{value: ROLL_COST}(0, commitment);
            vm.roll(block.number + 2);
            vm.prank(alice);
            spireth.revealRoll(0, secret);
            
            if (uint8(spireth.seasonState()) == uint8(TheSpireth.SeasonState.Frozen)) {
                reachedSummit = true;
                break;
            }
            
            vm.warp(block.timestamp + 24 hours + 1);
            secret++;
        }
        
        assertEq(spireth.SUMMIT(), int8(25));
        assertEq(spireth.ABYSS(), int8(-25));
    }

    function test_FreezeAtMinus25() public {
        _setupLiveSeason();
        
        uint256 secret = 1;
        bool reachedAbyss = false;
        
        for (uint256 i = 0; i < 100 && !reachedAbyss; i++) {
            (int8 height, , , , ,) = spireth.getImp(0);
            if (height <= -25) {
                reachedAbyss = true;
                break;
            }
            
            bytes32 commitment = keccak256(abi.encodePacked(secret, uint256(0)));
            vm.prank(alice);
            spireth.commitRoll{value: ROLL_COST}(0, commitment);
            vm.roll(block.number + 2);
            vm.prank(alice);
            spireth.revealRoll(0, secret);
            
            if (uint8(spireth.seasonState()) == uint8(TheSpireth.SeasonState.Frozen)) {
                reachedAbyss = true;
                break;
            }
            
            vm.warp(block.timestamp + 24 hours + 1);
            secret++;
        }
        
        assertEq(spireth.SUMMIT(), int8(25));
        assertEq(spireth.ABYSS(), int8(-25));
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
}

contract MockERC721 {
    mapping(uint256 => address) private _owners;
    
    function mint(address to, uint256 tokenId) external {
        _owners[tokenId] = to;
    }
    
    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }
}
