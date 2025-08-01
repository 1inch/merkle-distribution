// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20, IERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
// import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { ICumulativeMerkleDrop } from "./interfaces/ICumulativeMerkleDrop.sol";

/**
 * @title CumulativeMerkleDrop
 * @author 1inch Network
 * @notice A contract for distributing tokens via Merkle tree proofs with cumulative claim amounts
 * @dev This contract allows users to claim tokens based on a Merkle tree where each leaf contains
 * the cumulative amount a user can claim. This design allows for multiple distributions without
 * requiring users to claim from each one separately.
 */
contract CumulativeMerkleDrop is Ownable, ICumulativeMerkleDrop {
    using SafeERC20 for IERC20;
    // using MerkleProof for bytes32[];

    /// @notice The ERC20 token being distributed
    address public immutable override token; // solhint-disable-line immutable-vars-naming


    /// @notice The current Merkle root for the distribution
    bytes32 public override merkleRoot;
    
    /// @notice Mapping of addresses to their cumulative claimed amounts
    mapping(address => uint256) public cumulativeClaimed;

    /**
     * @notice Constructs the CumulativeMerkleDrop contract
     * @param token_ The address of the ERC20 token to be distributed
     */
    constructor(address token_) Ownable(msg.sender) {
        token = token_;
    }

    /**
     * @notice Updates the Merkle root for the distribution
     * @dev Only callable by the contract owner
     * @param merkleRoot_ The new Merkle root to set
     */
    function setMerkleRoot(bytes32 merkleRoot_) external override onlyOwner {
        emit MerkelRootUpdated(merkleRoot, merkleRoot_);
        merkleRoot = merkleRoot_;
    }

    /**
     * @notice Claims tokens for a given account using a Merkle proof
     * @dev The cumulative amount represents the total tokens the account can claim across all distributions
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
    ) external override {
        if (merkleRoot != expectedMerkleRoot) revert MerkleRootWasUpdated();

        // Verify the merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(account, cumulativeAmount));
        if (!_verifyAsm(merkleProof, expectedMerkleRoot, leaf)) revert InvalidProof();

        // Mark it claimed
        uint256 preclaimed = cumulativeClaimed[account];
        // solhint-disable-next-line gas-strict-inequalities
        if (preclaimed >= cumulativeAmount) revert NothingToClaim();
        cumulativeClaimed[account] = cumulativeAmount;

        // Send the token
        unchecked {
            uint256 amount = cumulativeAmount - preclaimed;
            IERC20(token).safeTransfer(account, amount);
            emit Claimed(account, amount);
        }
    }

    // function verify(bytes32[] calldata merkleProof, bytes32 root, bytes32 leaf) public pure returns (bool) {
    //     return merkleProof.verify(root, leaf);
    // }

    /**
     * @notice Verifies a Merkle proof using assembly for gas optimization
     * @dev Uses sorted pairs when hashing to match the proof generation
     * @param proof The Merkle proof to verify
     * @param root The Merkle root to verify against
     * @param leaf The leaf node to verify
     * @return valid True if the proof is valid, false otherwise
     */
    function _verifyAsm(bytes32[] calldata proof, bytes32 root, bytes32 leaf) private pure returns (bool valid) {
        /// @solidity memory-safe-assembly
        assembly {  // solhint-disable-line no-inline-assembly
            let ptr := proof.offset

            for { let end := add(ptr, mul(0x20, proof.length)) } lt(ptr, end) { ptr := add(ptr, 0x20) } {
                let node := calldataload(ptr)

                switch lt(leaf, node)
                case 1 {
                    mstore(0x00, leaf)
                    mstore(0x20, node)
                }
                default {
                    mstore(0x00, node)
                    mstore(0x20, leaf)
                }

                leaf := keccak256(0x00, 0x40)
            }

            valid := eq(root, leaf)
        }
    }
}
