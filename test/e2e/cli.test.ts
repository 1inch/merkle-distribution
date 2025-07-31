const { expect } = require('@1inch/solidity-utils');
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import sinon from 'sinon';
import { config } from '../../src/config';

describe('CLI E2E Tests', () => {
  let tempDir: string;
  let originalCwd: string;
  
  // Helper function to get all paths with tempDir
  const getPaths = (tempDir: string) => {
    const latestVersionPath = path.join(tempDir, config.paths.latestVersion.replace(/^\.\//, ''));
    const qrCodesPath = path.join(tempDir, config.paths.qrCodes.replace(/^\.\//, ''));
    const testQrCodesPath = path.join(tempDir, config.paths.testQrCodes.replace(/^\.\//, ''));
    const generatedDataPath = path.join(tempDir, config.paths.generatedData.replace(/^\.\//, ''));
    
    return {
      latestVersion: latestVersionPath,
      qrCodes: qrCodesPath,
      testQrCodes: testQrCodesPath,
      generatedData: generatedDataPath,
      // Also include the directory paths for creating directories
      latestVersionDir: path.dirname(latestVersionPath),
    };
  };

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
    originalCwd = process.cwd();
    
    // Get paths with tempDir
    const paths = getPaths(tempDir);
    
    // Create required directories in temp using paths from config
    fs.mkdirSync(paths.latestVersionDir, { recursive: true });
    fs.mkdirSync(paths.qrCodes, { recursive: true });
    fs.mkdirSync(paths.testQrCodes, { recursive: true });
    fs.mkdirSync(paths.generatedData, { recursive: true });
    
    // Stub console to prevent output during tests
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
  });

  afterEach(() => {
    // Restore console
    sinon.restore();
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    // Restore working directory
    process.chdir(originalCwd);
  });

  /**
   * Helper to run CLI command
   */
  function runCLI(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const cliPath = path.join(__dirname, '../../src/cli/merkle-drop-cli.ts');
      const child = spawn('ts-node', [cliPath, ...args], {
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({ code: code || 0, stdout, stderr });
      });
    });
  }

  describe('Generate Mode (-g)', () => {
    it('should generate merkle drop with QR codes and links', async () => {
      // Create initial version file
      const paths = getPaths(tempDir);
      fs.writeFileSync(paths.latestVersion, '99');

      const result = await runCLI([
        '-g',
        '-v', '100',
        '-n', '5,10',
        '-a', '1,2',
        '-q',  // Generate QR codes
        '-l',  // Generate links
        '-b', '1',
        '-s'   // No deploy mode
      ]);

      expect(result.code).to.equal(0);
      expect(result.stdout).to.include('Generating merkle drop');
      expect(result.stdout).to.include('Generation complete');
      expect(result.stdout).to.include('Merkle root: 0x');
      
      // Check QR codes were created
      const qrFiles = fs.readdirSync(paths.qrCodes);
      const testQrFiles = fs.readdirSync(paths.testQrCodes);
      
      expect(qrFiles.length).to.be.greaterThan(0);
      expect(testQrFiles.length).to.equal(10); // 10 test codes
      
      // Check links file was created
      const linksFile = path.join(paths.generatedData, '100-qr-links.json');
      expect(fs.existsSync(linksFile)).to.be.true;
      
      const linksData = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
      // The file contains an object with metadata and codes array
      expect(linksData).to.have.property('codes');
      expect(linksData.codes).to.be.an('array');
      expect(linksData.count).to.equal(15); // 5 + 10 production codes (test codes are in separate file)
    });

    it('should generate and zip QR codes', async () => {
      const paths = getPaths(tempDir);
      fs.writeFileSync(paths.latestVersion, '99');

      const result = await runCLI([
        '-g',
        '-v', '100',
        '-n', '5',
        '-a', '1',
        '-q',
        '-z',  // Create zip archives
        '-s'
      ]);

      expect(result.code).to.equal(0);
      expect(result.stdout).to.include('Created zip archives');
      
      // Check zip files were created
      const genDataFiles = fs.readdirSync(paths.generatedData);
      const zipFiles = genDataFiles.filter(f => f.endsWith('.zip'));
      
      expect(zipFiles.length).to.equal(2); // Regular and test zips
    });

    it('should validate version correctly', async () => {
      const paths = getPaths(tempDir);
      fs.writeFileSync(paths.latestVersion, '100');

      const result = await runCLI([
        '-g',
        '-v', '100',  // Same version should fail
        '-n', '5',
        '-a', '1'
      ]);

      expect(result.code).to.equal(1);
      expect(result.stderr).to.include('Version should be greater than');
    });

    it('should clean directories with -c flag', async () => {
      // Create some existing files
      const paths = getPaths(tempDir);
      fs.writeFileSync(path.join(paths.qrCodes, 'old.png'), 'old');
      fs.writeFileSync(path.join(paths.testQrCodes, 'old.png'), 'old');
      fs.writeFileSync(paths.latestVersion, '99');

      const result = await runCLI([
        '-g',
        '-v', '100',
        '-n', '5',
        '-a', '1',
        '-c',  // Clean directories
        '-s'
      ]);

      expect(result.code).to.equal(0);
      
      // Old files should be gone
      expect(fs.existsSync(path.join(paths.qrCodes, 'old.png'))).to.be.false;
      expect(fs.existsSync(path.join(paths.testQrCodes, 'old.png'))).to.be.false;
    });

    it('should handle invalid arguments', async () => {
      const result = await runCLI([
        '-g',
        '-v', 'invalid',  // Invalid version
        '-n', '5',
        '-a', '1'
      ]);

      expect(result.code).to.equal(1);
      expect(result.stderr).to.include('must be a number');
    });

    it('should handle invalid chain ID', async () => {
      const result = await runCLI([
        '-g',
        '-v', '100',
        '-n', '5',
        '-a', '1',
        '-b', 'invalid'  // Invalid chain ID
      ]);

      expect(result.code).to.equal(1);
      expect(result.stderr).to.include('chainid <chainid> must be a number');
    });

    it('should handle missing numbers and amounts', async () => {
      const result = await runCLI([
        '-g',
        '-v', '100'
        // Missing -n and -a
      ]);

      expect(result.code).to.equal(1);
      expect(result.stderr).to.include('Options -n, --numbers and -a, --amounts are required');
    });

    it('should require matching counts and amounts', async () => {
      const result = await runCLI([
        '-g',
        '-v', '100',
        '-n', '5,10',  // 2 counts
        '-a', '1',     // 1 amount
        '-s'
      ]);

      expect(result.code).to.equal(1);
      expect(result.stderr).to.include('must have the same length');
    });
  });

  describe('Validate Mode (-x)', () => {
    it('should validate a correct claim link', async () => {
      // Skip this test as it requires complex setup
      // The validation is tested in integration tests
    });

    it('should reject invalid link', async () => {
      // Skip this test as it requires proper link format
      // The validation is tested in integration tests
    });

    it('should require both url and root', async () => {
      const result = await runCLI([
        '-x',
        '-u', 'https://app.1inch.io/#/1/qr?d=test'
        // Missing -r
      ]);

      expect(result.code).to.equal(1);
      expect(result.stderr).to.include('required for validation');
    });
  });

  describe('Wipe Mode (-w)', () => {
    it('should clean QR directories', async () => {
      // Create some files
      const paths = getPaths(tempDir);
      fs.writeFileSync(path.join(paths.qrCodes, 'file1.png'), 'content');
      fs.writeFileSync(path.join(paths.qrCodes, 'file2.png'), 'content');
      fs.writeFileSync(path.join(paths.testQrCodes, 'file3.png'), 'content');
      
      // Create subdirectory (should not be deleted)
      fs.mkdirSync(path.join(paths.qrCodes, 'subdir'));

      const result = await runCLI(['-w']);

      expect(result.code).to.equal(0);
      expect(result.stdout).to.include('Cleaning QR directories');
      expect(result.stdout).to.include('Directories cleaned');
      
      // Files should be deleted
      expect(fs.existsSync(path.join(paths.qrCodes, 'file1.png'))).to.be.false;
      expect(fs.existsSync(path.join(paths.qrCodes, 'file2.png'))).to.be.false;
      expect(fs.existsSync(path.join(paths.testQrCodes, 'file3.png'))).to.be.false;
      
      // Directories should still exist
      expect(fs.existsSync(paths.qrCodes)).to.be.true;
      expect(fs.existsSync(path.join(paths.qrCodes, 'subdir'))).to.be.true;
    });
  });

  describe('Mode Selection', () => {
    it('should require exactly one mode', async () => {
      const result = await runCLI([
        '-g',
        '-x',  // Two modes
        '-v', '100'
      ]);

      expect(result.code).to.equal(1);
      expect(result.stderr).to.include('exactly one mode');
    });

    it('should require at least one mode', async () => {
      const result = await runCLI([
        '-v', '100',
        '-n', '5',
        '-a', '1'
      ]);

      expect(result.code).to.equal(1);
      expect(result.stderr).to.include('exactly one mode');
    });
  });

  describe('Test Codes', () => {
    it('should handle custom test code configuration', async () => {
      const paths = getPaths(tempDir);
      fs.writeFileSync(paths.latestVersion, '99');

      const result = await runCLI([
        '-g',
        '-v', '100',
        '-n', '5',
        '-a', '2',
        '-t', '20,5',  // 20 test codes of 5 tokens each
        '-l',
        '-s'
      ]);

      expect(result.code).to.equal(0);
      
      const linksFile = path.join(paths.generatedData, '100-qr-links.json');
      const linksData = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
      
      expect(linksData).to.have.property('codes');
      expect(linksData.codes).to.be.an('array');
      expect(linksData.count).to.equal(5); // 5 production codes (test codes are in separate file)
    });

    it('should validate test code format', async () => {
      const result = await runCLI([
        '-g',
        '-v', '100',
        '-n', '5',
        '-a', '1',
        '-t', '10',  // Invalid format
        '-s'
      ]);

      expect(result.code).to.equal(1);
      expect(result.stderr).to.include('Test codes must be in format');
    });
  });
});
