// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { INFTMerkleDrop } from "./interfaces/INFTMerkleDrop.sol";

contract NFTMerkleDrop is Ownable, INFTMerkleDrop {
    bytes32 public override merkleRoot;
    address public nftContract;
    mapping(address => bool) public claimed;

    constructor(address initialNFTContract, bytes32 merkleRoot_) Ownable(msg.sender) {
        nftContract = initialNFTContract;
        merkleRoot = merkleRoot_;
    }

    // Sets the merkle root of the merkle tree
    function setMerkleRoot(bytes32 merkleRoot_) external override onlyOwner {
        emit MerkelRootUpdated(merkleRoot, merkleRoot_);
        merkleRoot = merkleRoot_;
    }

    // Sets the NFT contract address from which the NFTs will be transferred
    function setNFTContract(address nftContract_) external override onlyOwner {
        require(nftContract_ != address(0), "Invalid NFT contract address");
        emit NFTContractUpdated(nftContract, nftContract_);
        nftContract = nftContract_;
    }

    // Claims the given NFTs to the specified address
    function claim(
        address account,
        uint256[] calldata tokenIds,
        bytes32 expectedMerkleRoot,
        bytes32[] calldata merkleProof
    ) external override {
        if (merkleRoot != expectedMerkleRoot) revert MerkleRootWasUpdated();

        // Check if already claimed
        if (claimed[account]) revert NothingToClaim();

        // Verify merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(account, tokenIds));
        if (!MerkleProof.verify(merkleProof, expectedMerkleRoot, leaf)) revert InvalidProof();

        // Mark it claimed
        claimed[account] = true;

        // Send the NFTs
        for (uint256 i = 0; i < tokenIds.length; i++) {
            IERC721(nftContract).safeTransferFrom(owner(), account, tokenIds[i]);
        }

        emit Claimed(account, tokenIds);
    }
}
