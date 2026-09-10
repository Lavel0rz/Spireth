// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";

/// @dev OpenZeppelin StandardMerkleTree-compatible helper for Foundry tests.
library MerkleTreeHelper {
    function prizeLeaf(uint256 impId, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(impId, amount))));
    }

    function buildRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        if (leaves.length == 0) return bytes32(0);
        if (leaves.length == 1) return leaves[0];

        bytes32[] memory level = leaves;
        while (level.length > 1) {
            level = _buildNextLevel(level);
        }
        return level[0];
    }

    function getProof(bytes32[] memory leaves, uint256 index) internal pure returns (bytes32[] memory) {
        require(index < leaves.length, "index out of bounds");

        bytes32[32] memory tempProof;
        uint256 proofLen;

        bytes32[] memory level = leaves;
        uint256 idx = index;

        while (level.length > 1) {
            if (idx % 2 == 1) {
                tempProof[proofLen++] = level[idx - 1];
            } else if (idx + 1 < level.length) {
                tempProof[proofLen++] = level[idx + 1];
            }

            level = _buildNextLevel(level);
            idx /= 2;
        }

        bytes32[] memory proof = new bytes32[](proofLen);
        for (uint256 i = 0; i < proofLen; i++) {
            proof[i] = tempProof[i];
        }
        return proof;
    }

    function _buildNextLevel(bytes32[] memory level) private pure returns (bytes32[] memory) {
        bytes32[] memory next = new bytes32[]((level.length + 1) / 2);
        for (uint256 i = 0; i < level.length; i += 2) {
            if (i + 1 < level.length) {
                next[i / 2] = Hashes.commutativeKeccak256(level[i], level[i + 1]);
            } else {
                next[i / 2] = level[i];
            }
        }
        return next;
    }
}
