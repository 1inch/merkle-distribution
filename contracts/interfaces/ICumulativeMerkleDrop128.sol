// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

/**
 * @title ICumulativeMerkleDrop128
 * @author 1inch Network
 * @notice Interface for gas-optimized cumulative Merkle drop contracts using 128-bit proofs
 * @dev Allows anyone to claim tokens if they exist in a merkle root with cumulative balances.
 * Uses 128-bit (16 bytes) Merkle tree nodes for gas optimization.
 */
interface ICumulativeMerkleDrop128 {
    /**
     * @notice Emitted when the Merkle root is updated
     * @param oldMerkleRoot The previous 128-bit Merkle root
     * @param newMerkleRoot The new 128-bit Merkle root
     */
    event MerkelRootUpdated(bytes16 oldMerkleRoot, bytes16 newMerkleRoot);
    
    /**
     * @notice Emitted when tokens are successfully claimed
     * @param account The account that claimed tokens
     * @param amount The amount of tokens claimed
     */
    event Claimed(address indexed account, uint256 amount); // solhint-disable-line gas-indexed-events

    error InvalidProof();
    error NothingToClaim();
    error MerkleRootWasUpdated();

    /**
     * @notice Returns the address of the token distributed by this contract
     * @return The ERC20 token address
     */
    function token() external view returns (address);
    
    /**
     * @notice Returns the merkle root of the merkle tree containing cumulative account balances available to claim
     * @return The current 128-bit Merkle root
     */
    function merkleRoot() external view returns (bytes16);
    
    /**
     * @notice Sets the merkle root of the merkle tree containing cumulative account balances available to claim
     * @param merkleRoot_ The new 128-bit Merkle root to set
     */
    function setMerkleRoot(bytes16 merkleRoot_) external;
    
    /**
     * @notice Claim the given amount of the token to the given address
     * @dev Reverts if the inputs are invalid. Uses a salt for additional security.
     * @param salt A 128-bit salt value used in leaf generation for added security
     * @param account The address of the account to claim for
     * @param cumulativeAmount The total cumulative amount the account is entitled to
     * @param expectedMerkleRoot The 128-bit Merkle root the proof was generated for
     * @param merkleProof The Merkle proof verifying the claim (must be a multiple of 16 bytes)
     */
    function claim(
        bytes16 salt,
        address account,
        uint256 cumulativeAmount,
        bytes16 expectedMerkleRoot,
        bytes calldata merkleProof
    ) external;
}
