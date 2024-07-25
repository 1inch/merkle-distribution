// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { INFTMerkleDrop } from "./INFTMerkleDrop.sol";

contract NFTMerkleDrop is Ownable, INFTMerkleDrop {
    bytes32 public override merkleRoot;
    mapping(address => bool) public claimed;

    function setMerkleRoot(bytes32 merkleRoot_) external override onlyOwner {
        emit MerkelRootUpdated(merkleRoot, merkleRoot_);
        merkleRoot = merkleRoot_;
    }

    function claim(
        address account,
        uint256[] calldata tokenIds,
        bytes32 expectedMerkleRoot,
        bytes32[] calldata merkleProof
    ) external override {
        if (merkleRoot != expectedMerkleRoot) revert MerkleRootWasUpdated();

        // Check if already claimed
        if (claimed[account]) revert NothingToClaim();

        // Verify merkle proof for each token
        for (uint256 i = 0; i < tokenIds.length; i++) {
            bytes32 leaf = keccak256(abi.encodePacked(account, tokenIds[i]));
            if (!MerkleProof.verify(merkleProof, expectedMerkleRoot, leaf)) revert InvalidProof();
        }

        // Mark it claimed
        claimed[account] = true;

        // Send the NFTs
        for (uint256 i = 0; i < tokenIds.length; i++) {
            IERC721(address(this)).safeTransferFrom(address(this), account, tokenIds[i]);
        }

        emit Claimed(account, tokenIds);
    }
}
