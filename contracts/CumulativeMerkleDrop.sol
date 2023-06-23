// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
// import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import "./interfaces/ICumulativeMerkleDrop.sol";

/// @title CumulativeMerkleDrop
/// @dev This contract allows for claims of tokens based on a merkle tree.
contract CumulativeMerkleDrop is Ownable, ICumulativeMerkleDrop {
    using SafeERC20 for IERC20;
    // using MerkleProof for bytes32[];

    /// @notice The token to be claimed.
    address public immutable override token;

    /// @notice The current merkle root for the claims tree.
    bytes32 public override merkleRoot;
    /// @notice Tracks the cumulative amount claimed for each address.
    mapping(address => uint256) public cumulativeClaimed;

    /// @param token_ The token to be claimed.
    constructor(address token_) {
        token = token_;
    }

    /// @notice Sets a new merkle root for the claims tree.
    /// @dev Only callable by the owner.
    /// @param merkleRoot_ The new merkle root.
    function setMerkleRoot(bytes32 merkleRoot_) external override onlyOwner {
        emit MerkelRootUpdated(merkleRoot, merkleRoot_);
        merkleRoot = merkleRoot_;
    }

    /// @notice Allows an account to claim an amount of the token.
    /// @param account The address of the account making the claim.
    /// @param cumulativeAmount The cumulative amount the account is claiming.
    /// @param expectedMerkleRoot The expected current merkle root.
    /// @param merkleProof The merkle proof needed to claim the tokens.
    function claim(
        address account,
        uint256 cumulativeAmount,
        bytes32 expectedMerkleRoot,
        bytes32[] calldata merkleProof
    ) external override {
        require(merkleRoot == expectedMerkleRoot, "CMD: Merkle root was updated");

        // Verify the merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(account, cumulativeAmount));
        require(_verifyAsm(merkleProof, expectedMerkleRoot, leaf), "CMD: Invalid proof");

        // Mark it claimed
        uint256 preclaimed = cumulativeClaimed[account];
        require(preclaimed < cumulativeAmount, "CMD: Nothing to claim");
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

    /// @dev Verifies a merkle proof in assembly.
    /// @param proof The merkle proof.
    /// @param root The root of the merkle tree.
    /// @param leaf The leaf being proven.
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
