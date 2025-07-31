import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import sinon from 'sinon';
import { VerificationService } from '../../../src/services/VerificationService';
import * as encoding from '../../../src/lib/encoding';
import { testWallets, testAmounts } from '../../fixtures/test-data';

describe('VerificationService', () => {
  let parseClaimUrlStub: sinon.SinonStub;
  let consoleLogStub: sinon.SinonStub;
  let consoleErrorStub: sinon.SinonStub;

  beforeEach(() => {
    parseClaimUrlStub = sinon.stub(encoding, 'parseClaimUrl');
    consoleLogStub = sinon.stub(console, 'log');
    consoleErrorStub = sinon.stub(console, 'error');
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
        amount: testAmounts[0]
      });

      const result = VerificationService.verifyLink(url, root, chainId, false);

      expect(result.isValid).to.be.true;
      expect(result.wallet).to.equal(testWallets[0].address);
      expect(result.amount).to.equal(testAmounts[0]);
      expect(parseClaimUrlStub.calledOnce).to.be.true;
      expect(parseClaimUrlStub.calledWith(url, root, 'https://app.1inch.io/#/1/qr?', false)).to.be.true;
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
        amount: undefined
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
        amount: testAmounts[0]
      });

      const result = VerificationService.verifyLink(url, root, chainId, true);

      expect(result.isValid).to.be.true;
      expect(parseClaimUrlStub.calledWith(url, root, 'https://app.1inch.io/#/1/qr?', true)).to.be.true;
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
        isValid: false
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
        amount: testAmounts[0]
      });

      VerificationService.verifyLink(url, root, chainId, false);

      expect(parseClaimUrlStub.calledWith(url, root, 'https://app.1inch.io/#/56/qr?', false)).to.be.true;
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
        amount: testAmounts[0]
      });

      const result = VerificationService.parseLink(url, root, chainId);

      expect(result).to.deep.equal({
        root,
        proof: Buffer.from('proof', 'hex'),
        leaf: '0xleaf',
        isValid: true,
        wallet: testWallets[0].address,
        amount: testAmounts[0]
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
