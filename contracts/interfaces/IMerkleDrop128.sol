// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;
pragma abicoder v1;

// Allows anyone to claim a token if they exist in a merkle root.
interface IMerkleDrop128 {
    // Returns the address of the token distributed by this contract.
    function token() external view returns (address);
    // Returns the merkle root of the merkle tree containing account balances available to claim.
    function merkleRoot() external view returns (bytes16);
    // Returns the tree depth of the merkle tree containing account balances available to claim.
    function depth() external view returns (uint256);
    // Claim the given amount of the token to the given address. Reverts if the inputs are invalid.
    function claim(address receiver, uint256 amount, bytes calldata merkleProof, bytes calldata signature) external;
}
