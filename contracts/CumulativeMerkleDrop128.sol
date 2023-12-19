// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Ownable } from  "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20, IERC20 } from  "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

import { ICumulativeMerkleDrop128 } from  "./interfaces/ICumulativeMerkleDrop128.sol";

contract CumulativeMerkleDrop128 is Ownable, ICumulativeMerkleDrop128 {
    using SafeERC20 for IERC20;

    // solhint-disable-next-line immutable-vars-naming
    address public immutable override token;

    bytes16 public override merkleRoot;
    mapping(address => uint256) public cumulativeClaimed;

    constructor(address token_) Ownable(msg.sender) {
        token = token_;
    }

    function setMerkleRoot(bytes16 merkleRoot_) external override onlyOwner {
        emit MerkelRootUpdated(merkleRoot, merkleRoot_);
        merkleRoot = merkleRoot_;
    }

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
