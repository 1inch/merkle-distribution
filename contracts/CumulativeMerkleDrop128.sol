// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Ownable } from  "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20, IERC20 } from  "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import { ICumulativeMerkleDrop128 } from  "./interfaces/ICumulativeMerkleDrop128.sol";

/**
 * @title CumulativeMerkleDrop128
 * @author 1inch Network
 * @notice A gas-optimized contract for distributing tokens via 128-bit Merkle tree proofs with cumulative claim amounts
 * @dev This contract uses 128-bit (16 bytes) Merkle tree nodes instead of 256-bit for gas optimization.
 * It allows users to claim tokens based on a Merkle tree where each leaf contains the cumulative
 * amount a user can claim. This design allows for multiple distributions without requiring users
 * to claim from each one separately.
 */
contract CumulativeMerkleDrop128 is Ownable, ICumulativeMerkleDrop128 {
    using SafeERC20 for IERC20;

    /// @notice The ERC20 token being distributed
    address public immutable override token; // solhint-disable-line immutable-vars-naming

    /// @notice The current 128-bit Merkle root for the distribution
    bytes16 public override merkleRoot;
    
    /// @notice Mapping of addresses to their cumulative claimed amounts
    mapping(address => uint256) public cumulativeClaimed;

    /**
     * @notice Constructs the CumulativeMerkleDrop128 contract
     * @param token_ The address of the ERC20 token to be distributed
     */
    constructor(address token_) Ownable(msg.sender) {
        token = token_;
    }

    /**
     * @notice Updates the 128-bit Merkle root for the distribution
     * @dev Only callable by the contract owner
     * @param merkleRoot_ The new 128-bit Merkle root to set
     */
    function setMerkleRoot(bytes16 merkleRoot_) external override onlyOwner {
        emit MerkelRootUpdated(merkleRoot, merkleRoot_);
        merkleRoot = merkleRoot_;
    }

    /**
     * @notice Claims tokens for a given account using a 128-bit Merkle proof
     * @dev The cumulative amount represents the total tokens the account can claim across all distributions.
     * The salt parameter provides additional entropy to prevent rainbow table attacks.
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
    ) external override {
        if (merkleRoot != expectedMerkleRoot) revert MerkleRootWasUpdated();

        // Verify the merkle proof
        bytes16 leaf = bytes16(keccak256((abi.encodePacked(salt, account, cumulativeAmount))));
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

    // function verify(bytes calldata proof, bytes16 root, bytes16 leaf) public pure returns (bool) {
    //     for (uint256 i = 0; i < proof.length / 16; i++) {
    //         bytes16 node = _getBytes16(proof[i*16:(i+1)*16]);
    //         if (leaf < node) {
    //             leaf = _keccak128(abi.encodePacked(leaf, node));
    //         } else {
    //             leaf = _keccak128(abi.encodePacked(node, leaf));
    //         }
    //     }
    //     return leaf == root;
    // }
    //
    // function _keccak128(bytes memory input) internal pure returns(bytes16) {
    //     return bytes16(keccak256(input));
    // }
    //
    // function _getBytes16(bytes calldata input) internal pure returns(bytes16 res) {
    //     // solhint-disable-next-line no-inline-assembly
    //     assembly {
    //         res := calldataload(input.offset)
    //     }
    // }

    /**
     * @notice Verifies a 128-bit Merkle proof using assembly for gas optimization
     * @dev Uses sorted pairs when hashing to match the proof generation. Each proof element is 16 bytes.
     * @param proof The Merkle proof to verify (must be a multiple of 16 bytes)
     * @param root The 128-bit Merkle root to verify against
     * @param leaf The 128-bit leaf node to verify
     * @return valid True if the proof is valid, false otherwise
     */
    function _verifyAsm(bytes calldata proof, bytes16 root, bytes16 leaf) private pure returns (bool valid) {
        /// @solidity memory-safe-assembly
        assembly {  // solhint-disable-line no-inline-assembly
            let ptr := proof.offset

            for { let end := add(ptr, proof.length) } lt(ptr, end) { ptr := add(ptr, 0x10) } {
                let node := calldataload(ptr)

                switch lt(leaf, node)
                case 1 {
                    mstore(0x00, leaf)
                    mstore(0x10, node)
                }
                default {
                    mstore(0x00, node)
                    mstore(0x10, leaf)
                }

                leaf := keccak256(0x00, 0x20)
            }

            valid := iszero(shr(128, xor(root, leaf)))
        }
    }
}
