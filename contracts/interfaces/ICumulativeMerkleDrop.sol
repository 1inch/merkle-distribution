// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

/**
 * @title ICumulativeMerkleDrop
 * @author 1inch Network
 * @notice Interface for cumulative Merkle drop contracts
 * @dev Allows anyone to claim tokens if they exist in a merkle root with cumulative balances
 */
interface ICumulativeMerkleDrop {
    /**
     * @notice Emitted when the Merkle root is updated
     * @param oldMerkleRoot The previous Merkle root
     * @param newMerkleRoot The new Merkle root
     */
    event MerkelRootUpdated(bytes32 oldMerkleRoot, bytes32 newMerkleRoot);
    
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
     * @return The current Merkle root
     */
    function merkleRoot() external view returns (bytes32);
    
    /**
     * @notice Sets the merkle root of the merkle tree containing cumulative account balances available to claim
     * @param merkleRoot_ The new Merkle root to set
     */
    function setMerkleRoot(bytes32 merkleRoot_) external;
    
    /**
     * @notice Claim the given amount of the token to the given address
     * @dev Reverts if the inputs are invalid
     * @param account The address of the account to claim for
     * @param cumulativeAmount The total cumulative amount the account is entitled to
     * @param expectedMerkleRoot The Merkle root the proof was generated for
     * @param merkleProof The Merkle proof verifying the claim
     */
    function claim(
        address account,
        uint256 cumulativeAmount,
        bytes32 expectedMerkleRoot,
        bytes32[] calldata merkleProof
    ) external;
}
