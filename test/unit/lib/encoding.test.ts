import {
    uriEncode,
    uriDecode,
    generateClaimUrl,
    parseClaimUrl,
    shuffle,
} from '../../../src/lib/encoding';
import { createMerkleDrop } from '../../../src/lib/merkle';
import { testWallets, testAmounts } from '../../fixtures/test-data';
const { expect } = require('@1inch/solidity-utils');

describe('Encoding Library', () => {
    describe('uriEncode', () => {
        it('should encode buffer to URI-safe base64', () => {
            const buffer = Buffer.from('test data');
            const encoded = uriEncode(buffer);
      
            expect(encoded).to.be.a('string');
            expect(encoded).to.not.include('+');
            expect(encoded).to.not.include('/');
            expect(encoded).to.not.include('=');
        });

        it('should replace special characters correctly', () => {
            // Create a buffer that will produce +, /, and = in base64
            // We need a buffer that when base64 encoded will have these characters
            const testString = 'Sure, here is text that will include + / = in base64';
            const buffer = Buffer.from(testString);
            const encoded = uriEncode(buffer);
      
            // The encoded string should have replacements
            expect(encoded).to.match(/[-_!]/); // Should contain at least one of the replacement characters
            expect(encoded).to.not.include('+');
            expect(encoded).to.not.include('/');
            expect(encoded).to.not.include('=');
        });
    });

    describe('uriDecode', () => {
        it('should decode URI-safe base64 to buffer', () => {
            const original = Buffer.from('test data');
            const encoded = uriEncode(original);
            const decoded = uriDecode(encoded);
      
            expect(decoded).to.be.instanceOf(Buffer);
            expect(decoded.toString()).to.equal(original.toString());
        });

        it('should handle special characters correctly', () => {
            const encoded = 'dGVzdC1kYXRhXw!!'; // Contains -, _, and !
            const decoded = uriDecode(encoded);
      
            expect(decoded).to.be.instanceOf(Buffer);
        });
    });

    describe('generateClaimUrl', () => {
        it('should generate a valid claim URL', () => {
            const privateKey = testWallets[0].privateKey;
            const amount = testAmounts[0];
            const proof = [
                { position: 'left' as const, data: Buffer.from('1234567890abcdef', 'hex') },
                { position: 'right' as const, data: Buffer.from('fedcba0987654321', 'hex') },
            ];
            const version = 1;
            // lgtm [js/incomplete-hostname-regexp]
            const prefix = 'https://app\\.1inch\\.io/#/1/qr?';
      
            const url = generateClaimUrl(privateKey, amount, proof, version, prefix);
      
            expect(url).to.be.a('string');
            expect(url).to.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
            expect(url).to.include('d=');
        });

        it('should encode all components correctly', () => {
            const privateKey = '0000000000000000000000000000000000000000000000000000000000000001';
            const amount = BigInt('1000000000000000000');
            const proof = [
                { position: 'left' as const, data: Buffer.alloc(16, 0) },
            ];
            const version = 42;
            const prefix = 'https://test.com?';
      
            const url = generateClaimUrl(privateKey, amount, proof, version, prefix);
            const encoded = url.substring(prefix.length + 2);
            const decoded = uriDecode(encoded);
      
            expect(decoded[0]).to.equal(version); // Version byte
            expect(decoded.length).to.be.at.least(29); // Version + key + amount + proof
        });
    });

    describe('parseClaimUrl', () => {
        it('should parse and verify a valid claim URL', () => {
            // Create a real merkle drop
            const wallets = [testWallets[0].address];
            const amounts = [testAmounts[0]];
            const drop = createMerkleDrop(wallets, amounts);
      
            // Generate a claim URL
            const privateKey = testWallets[0].privateKey;
            const url = generateClaimUrl(
                privateKey,
                amounts[0],
                drop.proofs[0],
                1,
                'https://app.1inch.io/#/1/qr?',
            );
      
            // Parse and verify
            const result = parseClaimUrl(url, drop.root, 'https://app.1inch.io/#/1/qr?');
      
            expect(result.isValid).to.be.true;
            expect(result.wallet?.toLowerCase()).to.equal(wallets[0].toLowerCase());
            expect(result.amount?.toString()).to.equal(amounts[0].toString());
        });

        it('should reject invalid URL with wrong root', () => {
            const wallets = [testWallets[0].address];
            const amounts = [testAmounts[0]];
            const drop = createMerkleDrop(wallets, amounts);
      
            const privateKey = testWallets[0].privateKey;
            const url = generateClaimUrl(
                privateKey,
                amounts[0],
                drop.proofs[0],
                1,
                'https://app.1inch.io/#/1/qr?',
            );
      
            const result = parseClaimUrl(url, '0xwrongroot', 'https://app.1inch.io/#/1/qr?');
      
            expect(result.isValid).to.be.false;
        });

        it('should display results when requested', () => {
            const wallets = [testWallets[0].address];
            const amounts = [testAmounts[0]];
            const drop = createMerkleDrop(wallets, amounts);
      
            const privateKey = testWallets[0].privateKey;
            const url = generateClaimUrl(
                privateKey,
                amounts[0],
                drop.proofs[0],
                1,
                'https://app.1inch.io/#/1/qr?',
            );
      
            // Capture console output
            const originalLog = console.log;
            const logs: string[] = [];
            console.log = (msg: string) => logs.push(msg);
      
            parseClaimUrl(url, drop.root, 'https://app.1inch.io/#/1/qr?', true);
      
            console.log = originalLog;
      
            expect(logs).to.have.lengthOf(3);
            expect(logs[0]).to.include('root');
            expect(logs[1]).to.include('proof');
            expect(logs[2]).to.include('leaf');
        });
    });

    describe('shuffle', () => {
        it('should return a new array', () => {
            const original = [1, 2, 3, 4, 5];
            const shuffled = shuffle(original);
      
            expect(shuffled).to.not.equal(original);
            expect(original).to.deep.equal([1, 2, 3, 4, 5]); // Original unchanged
        });

        it('should contain all original elements', () => {
            const original = [1, 2, 3, 4, 5];
            const shuffled = shuffle(original);
      
            expect(shuffled).to.have.lengthOf(original.length);
            expect(shuffled.sort()).to.deep.equal(original.sort());
        });

        it('should handle empty array', () => {
            const shuffled = shuffle([]);
            expect(shuffled).to.deep.equal([]);
        });

        it('should handle single element array', () => {
            const shuffled = shuffle([42]);
            expect(shuffled).to.deep.equal([42]);
        });

        it('should produce different orders (statistical test)', () => {
            const original = [1, 2, 3, 4, 5];
            const results = new Set<string>();
      
            // Run shuffle multiple times
            for (let i = 0; i < 100; i++) {
                const shuffled = shuffle(original);
                results.add(JSON.stringify(shuffled));
            }
      
            // Should produce multiple different orderings
            expect(results.size).to.be.greaterThan(1);
        });
    });
});
