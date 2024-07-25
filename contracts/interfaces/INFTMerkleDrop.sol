// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

// Allows anyone to claim a token if they exist in a merkle root.
interface ICumulativeMerkleDrop {
    // This event is triggered whenever a call to #setMerkleRoot succeeds.
    event MerkelRootUpdated(bytes32 oldMerkleRoot, bytes32 newMerkleRoot);
    // This event is triggered whenever a call to #claim succeeds.
    event Claimed(address indexed account, uint256 amount);

    error InvalidProof();
    error NothingToClaim();
    error MerkleRootWasUpdated();

    // Returns the address of the token distributed by this contract.
    function token() external view returns (address);
    // Returns the merkle root of the merkle tree containing cumulative account balances available to claim.
    function merkleRoot() external view returns (bytes32);
    // Sets the merkle root of the merkle tree containing cumulative account balances available to claim.
    function setMerkleRoot(bytes32 merkleRoot_) external;
    // Claim the given amount of the token to the given address. Reverts if the inputs are invalid.

    // for EIP 721. probably changed for 1155
    function claim(
        // Hk (according to https://medium.com/crypto-0-nite/merkle-proofs-explained-6dd429623dc5)
        address account,
        uint256 cumulativeAmount, // TODO: NFT ids (uint256) array instead

        // could be last item of merkleProof. one per contract! for the next drop use new contract
        bytes32 expectedMerkleRoot,

        // [Hl, ...]
        bytes32[] calldata merkleProof
    ) external;

    // TODO: implementation will look like...
    // make bool!
    mapping(address => bool) public cumulativeClaimed;

    function claim(
        address account,
        uint256 cumulativeAmount, // rename to nfts
        bytes32 expectedMerkleRoot,
        bytes32[] calldata merkleProof
    ) external override {
        if (merkleRoot != expectedMerkleRoot) revert MerkleRootWasUpdated();

        // Verify the merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(account, cumulativeAmount));
        if (!_verifyAsm(merkleProof, expectedMerkleRoot, leaf)) revert InvalidProof();

        // Mark it claimed
        // TODO cumulativeClaimed has bool as a val
        uint256 preclaimed = cumulativeClaimed[account];
        if (preclaimed >= cumulativeAmount) revert NothingToClaim();
        cumulativeClaimed[account] = cumulativeAmount;

        // Send the token
        unchecked {
            // TODO: 721...
            uint256 amount = cumulativeAmount - preclaimed;
            IERC20(token).safeTransfer(account, amount);

            emit Claimed(account, amount);
        }
    }
}
