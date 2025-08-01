import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import { MerkleDropData } from '../types';

/**
 * Keccak256 hash truncated to 128 bits (16 bytes)
 */
export function keccak128 (input: string | Buffer): Buffer {
    return keccak256(input).slice(0, 16);
}

/**
 * Create a merkle drop from wallets and amounts
 */
export function createMerkleDrop (wallets: string[], amounts: bigint[]): MerkleDropData {
    // Create elements by concatenating wallet address and amount (padded to 64 hex chars)
    const elements = wallets.map((wallet, i) =>
        wallet + amounts[i].toString(16).padStart(64, '0'),
    );

    // Create leaves by hashing elements
    const leaves = elements.map(element =>
        MerkleTree.bufferToHex(keccak128(element)),
    );

    // Create merkle tree
    const tree = new MerkleTree(leaves, keccak128, { sortPairs: true });
  
    // Get root and proofs
    const root = tree.getHexRoot();
    const proofs = leaves.map(leaf => tree.getProof(leaf));

    return {
        elements,
        leaves,
        root,
        proofs,
    };
}

/**
 * Verify a merkle proof
 */
export function verifyMerkleProof (
    wallet: string,
    amount: bigint,
    proof: Buffer[],
    root: string,
): boolean {
    const tree = new MerkleTree([], keccak128, { sortPairs: true });
    const element = wallet + amount.toString(16).padStart(64, '0');
    const leaf = MerkleTree.bufferToHex(keccak128(element));
  
    return tree.verify(proof, leaf, root);
}

/**
 * Calculate the height of a merkle tree given the number of leaves
 */
export function calculateMerkleHeight (leafCount: number): number {
    return Math.ceil(Math.log2(leafCount));
}
