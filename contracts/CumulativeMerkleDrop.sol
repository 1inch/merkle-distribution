// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20, IERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
// import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import { ICumulativeMerkleDrop } from "./interfaces/ICumulativeMerkleDrop.sol";

contract CumulativeMerkleDrop is Ownable, ICumulativeMerkleDrop {
    using SafeERC20 for IERC20;
    // using MerkleProof for bytes32[];

    // solhint-disable-next-line immutable-vars-naming
    address public immutable override token;

    bytes32 public override merkleRoot;
    mapping(address => uint256) public cumulativeClaimed;

    constructor(address token_) Ownable(msg.sender) {
        token = token_;
    }

    function setMerkleRoot(bytes32 merkleRoot_) external override onlyOwner {
        emit MerkelRootUpdated(merkleRoot, merkleRoot_);
        merkleRoot = merkleRoot_;
    }

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
