const { expect } = require('@1inch/solidity-utils');
import * as fs from 'fs';
import * as path from 'path';
import { generateQrCodes, saveQrCode, ensureDirectoryExists } from '../../../src/lib/qr';
import sinon from 'sinon';

describe('QR Library Integration Tests', () => {
  const testDir = './test-qr-output';
  const testQrDir = './test-qr-output/test';

  beforeEach(() => {
    // Create test directories
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (!fs.existsSync(testQrDir)) {
      fs.mkdirSync(testQrDir, { recursive: true });
    }
    // Stub console to prevent output
    sinon.stub(console, 'log');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    sinon.restore();
  });

  describe('saveQrCode', () => {
    it('should generate a QR code image file', () => {
      const testUrl = 'https://example.com/test';
      const index = 1;

      saveQrCode(testUrl, index, testDir);

      // Check that file was created
      const outputPath = path.join(testDir, '1.png');
      expect(fs.existsSync(outputPath)).to.be.true;
      
      // Check that file has content
      const stats = fs.statSync(outputPath);
      expect(stats.size).to.be.greaterThan(0);
    });

    it('should handle special characters in URL', () => {
      const testUrl = 'https://example.com/test?param=value&other=123';
      const index = 2;

      saveQrCode(testUrl, index, testDir);

      const outputPath = path.join(testDir, '2.png');
      expect(fs.existsSync(outputPath)).to.be.true;
    });
  });

  describe('generateQrCodes', () => {
    it('should generate multiple QR codes in correct directories', () => {
      const urls = [
        'https://example.com/1',
        'https://example.com/2',
        'https://example.com/3'
      ];
      const indices = [1, 2, 3];
      const testCount = 1; // First URL goes to test directory

      generateQrCodes(urls, indices, testCount, testDir, testQrDir);

      // Check that files were created in correct directories
      expect(fs.existsSync(path.join(testQrDir, '1.png'))).to.be.true; // Test file
      expect(fs.existsSync(path.join(testDir, '2.png'))).to.be.true;   // Production file
      expect(fs.existsSync(path.join(testDir, '3.png'))).to.be.true;   // Production file
    });

    it('should handle empty URL array', () => {
      const urls: string[] = [];
      const indices: number[] = [];

      expect(() => {
        generateQrCodes(urls, indices, 0, testDir, testQrDir);
      }).to.not.throw();
    });

    it('should handle all test URLs', () => {
      const urls = ['https://example.com/1', 'https://example.com/2'];
      const indices = [10, 20];
      const testCount = 2; // All URLs are test

      generateQrCodes(urls, indices, testCount, testDir, testQrDir);

      // All files should be in test directory
      expect(fs.existsSync(path.join(testQrDir, '10.png'))).to.be.true;
      expect(fs.existsSync(path.join(testQrDir, '20.png'))).to.be.true;
    });
  });

  describe('ensureDirectoryExists', () => {
    it('should create directory if it does not exist', () => {
      const newDir = path.join(testDir, 'new-directory');
      
      expect(fs.existsSync(newDir)).to.be.false;
      
      ensureDirectoryExists(newDir);
      
      expect(fs.existsSync(newDir)).to.be.true;
    });

    it('should not throw if directory already exists', () => {
      expect(() => {
        ensureDirectoryExists(testDir);
      }).to.not.throw();
    });

    it('should create nested directories', () => {
      const nestedDir = path.join(testDir, 'level1', 'level2', 'level3');
      
      ensureDirectoryExists(nestedDir);
      
      expect(fs.existsSync(nestedDir)).to.be.true;
    });
  });
});
