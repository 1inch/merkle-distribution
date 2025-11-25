import esmock from 'esmock';
import sinon from 'sinon';
import { expect } from 'chai';
import { testWallets, testAmounts } from '../../fixtures/test-data';
import type { VerificationService as VerificationServiceType } from '../../../src/services/VerificationService';

describe('VerificationService', () => {
    let VerificationService: typeof VerificationServiceType;
    let parseClaimUrlStub: sinon.SinonStub;
    let consoleLogStub: sinon.SinonStub;
    let consoleErrorStub: sinon.SinonStub;

    beforeEach(async () => {
        parseClaimUrlStub = sinon.stub();
        consoleLogStub = sinon.stub(console, 'log');
        consoleErrorStub = sinon.stub(console, 'error');

        // Mock the module before importing
        const module = await esmock('../../../src/services/VerificationService.js', {
            '../../../src/lib/encoding.js': {
                parseClaimUrl: parseClaimUrlStub,
            },
        });
        VerificationService = module.VerificationService;
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('verifyLink', () => {
        it('should verify a valid link successfully', () => {
            const url = 'https://app.1inch.io/#/1/qr?d=test';
            const root = '0x1234567890abcdef';
            const chainId = 1;

            parseClaimUrlStub.returns({
                root,
                proof: Buffer.from('proof', 'hex'),
                leaf: '0xleaf',
                isValid: true,
                wallet: testWallets[0].address,
                amount: testAmounts[0],
            });

            const result = VerificationService.verifyLink(url, root, chainId, false);

            expect(result.isValid).to.be.true;
            expect(result.wallet).to.equal(testWallets[0].address);
            expect(result.amount).to.equal(testAmounts[0]);
            expect(parseClaimUrlStub.calledOnce).to.be.true;
            expect(parseClaimUrlStub.calledWith(url, root, 'https://1inch.network/qr?d=', false)).to.be.true;
        });

        it('should handle invalid link', () => {
            const url = 'https://app.1inch.io/#/1/qr?d=invalid';
            const root = '0x1234567890abcdef';
            const chainId = 1;

            parseClaimUrlStub.returns({
                root,
                proof: Buffer.from('proof', 'hex'),
                leaf: '0xleaf',
                isValid: false,
                wallet: undefined,
                amount: undefined,
            });

            const result = VerificationService.verifyLink(url, root, chainId, false);

            expect(result.isValid).to.be.false;
            expect(result.wallet).to.be.undefined;
            expect(result.amount).to.be.undefined;
        });

        it('should display results when requested', () => {
            const url = 'https://app.1inch.io/#/1/qr?d=test';
            const root = '0x1234567890abcdef';
            const chainId = 1;

            parseClaimUrlStub.returns({
                root,
                proof: Buffer.from('proof', 'hex'),
                leaf: '0xleaf',
                isValid: true,
                wallet: testWallets[0].address,
                amount: testAmounts[0],
            });

            const result = VerificationService.verifyLink(url, root, chainId, true);

            expect(result.isValid).to.be.true;
            expect(parseClaimUrlStub.calledWith(url, root, 'https://1inch.network/qr?d=', true)).to.be.true;
            // Check that console.log was called (the exact message may vary)
            expect(consoleLogStub.called).to.be.true;
        });

        it('should display invalid message for invalid link', () => {
            const url = 'https://app.1inch.io/#/1/qr?d=invalid';
            const root = '0x1234567890abcdef';
            const chainId = 1;

            parseClaimUrlStub.returns({
                root,
                proof: Buffer.from('proof', 'hex'),
                leaf: '0xleaf',
                isValid: false,
            });

            const result = VerificationService.verifyLink(url, root, chainId, true);

            expect(result.isValid).to.be.false;
            // The service uses console.error for invalid proofs
            expect(consoleErrorStub.called).to.be.true;
        });

        it('should use correct prefix for different chain IDs', () => {
            const url = 'https://app.1inch.io/#/56/qr?d=test';
            const root = '0x1234567890abcdef';
            const chainId = 56; // BSC

            parseClaimUrlStub.returns({
                root,
                proof: Buffer.from('proof', 'hex'),
                leaf: '0xleaf',
                isValid: true,
                wallet: testWallets[0].address,
                amount: testAmounts[0],
            });

            VerificationService.verifyLink(url, root, chainId, false);

            expect(parseClaimUrlStub.calledWith(url, root, 'https://1inch.network/qr?d=', false)).to.be.true;
        });

        it('should handle errors gracefully', () => {
            const url = 'https://app.1inch.io/#/1/qr?d=test';
            const root = '0x1234567890abcdef';
            const chainId = 1;

            parseClaimUrlStub.throws(new Error('Parse error'));

            expect(() => {
                VerificationService.verifyLink(url, root, chainId, false);
            }).to.throw('Parse error');
        });
    });

    describe('parseLink', () => {
        it('should parse a valid link', () => {
            const url = 'https://app.1inch.io/#/1/qr?d=test';
            const root = '0x1234567890abcdef';
            const chainId = 1;

            parseClaimUrlStub.returns({
                root,
                proof: Buffer.from('proof', 'hex'),
                leaf: '0xleaf',
                isValid: true,
                wallet: testWallets[0].address,
                amount: testAmounts[0],
            });

            const result = VerificationService.parseLink(url, root, chainId);

            expect(result).to.deep.equal({
                root,
                proof: Buffer.from('proof', 'hex'),
                leaf: '0xleaf',
                isValid: true,
                wallet: testWallets[0].address,
                amount: testAmounts[0],
            });
        });

        it('should handle parse errors', () => {
            const url = 'invalid-url';
            const root = '0x1234567890abcdef';
            const chainId = 1;

            parseClaimUrlStub.throws(new Error('Invalid URL format'));

            expect(() => {
                VerificationService.parseLink(url, root, chainId);
            }).to.throw('Invalid URL format');
        });
    });
});
