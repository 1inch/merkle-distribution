// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

/**
 * @title ISignatureMerkleDrop128
 * @author 1inch Network
 * @notice Interface for signature-based Merkle drop contracts using 128-bit proofs
 * @dev Allows anyone to claim tokens if they exist in a merkle root and provide a valid signature.
 * Uses 128-bit (16 bytes) Merkle tree nodes for gas optimization.
 */
interface ISignatureMerkleDrop128 {
    error InvalidProof();
    error DropAlreadyClaimed();

    /**
     * @notice Returns the address of the token distributed by this contract
     * @return The ERC20 token address
     */
    function token() external view returns (address);
    
    /**
     * @notice Returns the merkle root of the merkle tree containing account balances available to claim
     * @return The 128-bit Merkle root
     */
    function merkleRoot() external view returns (bytes16);
    
    /**
     * @notice Returns the tree depth of the merkle tree containing account balances available to claim
     * @return The depth of the Merkle tree
     */
    function depth() external view returns (uint256);
    
    /**
     * @notice Claim the given amount of the token to the given address
     * @dev Reverts if the inputs are invalid. Requires a valid signature from the account in the Merkle tree.
     * @param receiver The address that will receive the tokens
     * @param amount The amount of tokens to claim
     * @param merkleProof The Merkle proof verifying the claim (must be a multiple of 16 bytes)
     * @param signature The signature from the account authorized in the Merkle tree
     */
    function claim(address receiver, uint256 amount, bytes calldata merkleProof, bytes calldata signature) external payable;
    
    /**
     * @notice Verifies that given leaf and merkle proof matches given merkle root and returns leaf index
     * @param proof The Merkle proof to verify (must be a multiple of 16 bytes)
     * @param root The 128-bit Merkle root to verify against
     * @param leaf The 128-bit leaf node to verify
     * @return valid True if the proof is valid, false otherwise
     * @return index The index of the leaf in the Merkle tree
     */
    function verify(bytes calldata proof, bytes16 root, bytes16 leaf) external view returns (bool valid, uint256 index);
    
    /**
     * @notice Returns true if the index has been marked claimed
     * @param index The index in the Merkle tree to check
     * @return True if the claim has been made, false otherwise
     */
    function isClaimed(uint256 index) external view returns (bool);
}
