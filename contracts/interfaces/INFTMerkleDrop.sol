// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

// Allows anyone to claim NFTs if they exist in a merkle root.
interface INFTMerkleDrop {
    // Event emitted when the NFT contract address is updated
    event NFTContractUpdated(address indexed previousNFTContract, address indexed newNFTContract);

    // This event is triggered whenever a call to #setMerkleRoot succeeds.
    event MerkelRootUpdated(bytes32 oldMerkleRoot, bytes32 newMerkleRoot);

    // This event is triggered whenever a call to #claim succeeds.
    event Claimed(address indexed account, uint256[] tokenIds);

    error InvalidProof();
    error NothingToClaim();
    error MerkleRootWasUpdated();

    // Returns the merkle root of the merkle tree containing cumulative account balances available to claim.
    function merkleRoot() external view returns (bytes32);

    // Sets the merkle root of the merkle tree containing cumulative account balances available to claim.
    function setMerkleRoot(bytes32 merkleRoot_) external;

    // Sets the NFT contract address from which the NFTs will be transferred.
    function setNFTContract(address nftContract_) external;

    // Claim the given NFTs to the given address. Reverts if the inputs are invalid.
    function claim(
        address account,
        uint256[] calldata tokenIds,
        bytes32 expectedMerkleRoot,
        bytes32[] calldata merkleProof
    ) external;
}
