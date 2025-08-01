import {
    keccak128,
    createMerkleDrop,
    verifyMerkleProof,
    calculateMerkleHeight,
} from '../../../src/lib/merkle';
import { testWallets, testAmounts } from '../../fixtures/test-data';
const { expect } = require('@1inch/solidity-utils');

describe('Merkle Library', () => {
    describe('keccak128', () => {
        it('should return 16 bytes hash', () => {
            const input = 'test input';
            const hash = keccak128(input);
            expect(hash).to.be.instanceOf(Buffer);
            expect(hash.length).to.equal(16);
        });

        it('should produce consistent hashes', () => {
            const input = 'test input';
            const hash1 = keccak128(input);
            const hash2 = keccak128(input);
            expect(hash1.toString('hex')).to.equal(hash2.toString('hex'));
        });

        it('should produce different hashes for different inputs', () => {
            const hash1 = keccak128('input1');
            const hash2 = keccak128('input2');
            expect(hash1.toString('hex')).to.not.equal(hash2.toString('hex'));
        });
    });

    describe('createMerkleDrop', () => {
        it('should create merkle drop with correct structure', () => {
            const wallets = testWallets.map(w => w.address);
            const amounts = testAmounts;
      
            const drop = createMerkleDrop(wallets, amounts);
      
            expect(drop).to.have.property('elements');
            expect(drop).to.have.property('leaves');
            expect(drop).to.have.property('root');
            expect(drop).to.have.property('proofs');
      
            expect(drop.elements).to.have.lengthOf(wallets.length);
            expect(drop.leaves).to.have.lengthOf(wallets.length);
            expect(drop.proofs).to.have.lengthOf(wallets.length);
        });

        it('should create valid merkle proofs', () => {
            const wallets = testWallets.map(w => w.address);
            const amounts = testAmounts;
      
            const drop = createMerkleDrop(wallets, amounts);
      
            // Verify each proof
            for (let i = 0; i < wallets.length; i++) {
                const proofBuffers = drop.proofs[i].map(p => p.data);
                const isValid = verifyMerkleProof(wallets[i], amounts[i], proofBuffers, drop.root);
                expect(isValid).to.be.true;
            }
        });

        it('should create deterministic merkle root', () => {
            const wallets = testWallets.map(w => w.address);
            const amounts = testAmounts;
      
            const drop1 = createMerkleDrop(wallets, amounts);
            const drop2 = createMerkleDrop(wallets, amounts);
      
            expect(drop1.root).to.equal(drop2.root);
        });
    });

    describe('verifyMerkleProof', () => {
        it('should verify valid proof', () => {
            const wallets = testWallets.map(w => w.address);
            const amounts = testAmounts;
            const drop = createMerkleDrop(wallets, amounts);
      
            const proofBuffers = drop.proofs[0].map(p => p.data);
            const isValid = verifyMerkleProof(wallets[0], amounts[0], proofBuffers, drop.root);
      
            expect(isValid).to.be.true;
        });

        it('should reject invalid proof', () => {
            const wallets = testWallets.map(w => w.address);
            const amounts = testAmounts;
            const drop = createMerkleDrop(wallets, amounts);
      
            // Use wrong wallet address
            const proofBuffers = drop.proofs[0].map(p => p.data);
            const isValid = verifyMerkleProof(wallets[1], amounts[0], proofBuffers, drop.root);
      
            expect(isValid).to.be.false;
        });

        it('should reject proof with wrong amount', () => {
            const wallets = testWallets.map(w => w.address);
            const amounts = testAmounts;
            const drop = createMerkleDrop(wallets, amounts);
      
            // Use wrong amount
            const proofBuffers = drop.proofs[0].map(p => p.data);
            const isValid = verifyMerkleProof(wallets[0], amounts[1], proofBuffers, drop.root);
      
            expect(isValid).to.be.false;
        });

        it('should reject proof with wrong root', () => {
            const wallets = testWallets.map(w => w.address);
            const amounts = testAmounts;
            const drop = createMerkleDrop(wallets, amounts);
      
            const proofBuffers = drop.proofs[0].map(p => p.data);
            const isValid = verifyMerkleProof(wallets[0], amounts[0], proofBuffers, '0xwrongroot');
      
            expect(isValid).to.be.false;
        });
    });

    describe('calculateMerkleHeight', () => {
        it('should calculate correct height for power of 2', () => {
            expect(calculateMerkleHeight(1)).to.equal(0);
            expect(calculateMerkleHeight(2)).to.equal(1);
            expect(calculateMerkleHeight(4)).to.equal(2);
            expect(calculateMerkleHeight(8)).to.equal(3);
            expect(calculateMerkleHeight(16)).to.equal(4);
        });

        it('should calculate correct height for non-power of 2', () => {
            expect(calculateMerkleHeight(3)).to.equal(2);
            expect(calculateMerkleHeight(5)).to.equal(3);
            expect(calculateMerkleHeight(7)).to.equal(3);
            expect(calculateMerkleHeight(9)).to.equal(4);
            expect(calculateMerkleHeight(15)).to.equal(4);
        });

        it('should handle large numbers', () => {
            expect(calculateMerkleHeight(1000)).to.equal(10);
            expect(calculateMerkleHeight(10000)).to.equal(14);
        });
    });
});
