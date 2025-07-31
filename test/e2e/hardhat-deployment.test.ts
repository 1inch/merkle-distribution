import { expect } from 'chai';
import { describe, it, before, beforeEach, afterEach } from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { Contract } from 'ethers';
import {
  generateLinks,
  verifyLink,
  dropTask
} from '../../src/tasks/hardhat-drop-task';
import { DropService } from '../../src/services/DropService';
import { VerificationService } from '../../src/services/VerificationService';
import { config } from '../../src/config';

// ethers is available as a global in Hardhat tests
declare const ethers: any;

describe('Hardhat Deployment E2E Tests', function() {
  this.timeout(60000); // Increase timeout for deployment tests
  
  let owner: SignerWithAddress;
  let receiver: SignerWithAddress;
  let mockToken: Contract;
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

  before(async () => {
    // Get signers
    [owner, receiver] = await ethers.getSigners();
    
    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory('MockERC20');
    mockToken = await MockToken.deploy('Test Token', 'TEST', ethers.parseEther('1000000'));
    await mockToken.waitForDeployment();
  });

  beforeEach(() => {
    // Setup temp directory
    tempDir = path.join(__dirname, '../../temp-test');
    originalCwd = process.cwd();
    
    // Get paths with tempDir
    const paths = getPaths(tempDir);
    
    // Create required directories using paths from config
    fs.mkdirSync(paths.latestVersionDir, { recursive: true });
    fs.mkdirSync(paths.qrCodes, { recursive: true });
    fs.mkdirSync(paths.testQrCodes, { recursive: true });
    fs.mkdirSync(paths.generatedData, { recursive: true });
    
    process.chdir(tempDir);
    
    // Create version file
    fs.writeFileSync(paths.latestVersion, '999');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Contract Deployment and Verification', () => {
    it('should deploy merkle drop contract and verify proofs on-chain', async () => {
      // Step 1: Generate merkle drop
      const { merkleRoot, height, urls } = await generateLinks(
        '1,2',    // 1 and 2 ETH
        '2,3',    // 2 and 3 recipients
        '1000',   // version
        31337,    // Hardhat chainId
        true      // debug mode for now
      );

      expect(merkleRoot).to.match(/^0x[a-fA-F0-9]+$/);
      expect(urls.length).to.equal(15); // 10 test + 5 production
      
      // Step 2: Deploy contract with merkle root
      const SignatureMerkleDrop128 = await ethers.getContractFactory('SignatureMerkleDrop128');
      const merkleDropContract = await SignatureMerkleDrop128.deploy(
        await mockToken.getAddress(),
        merkleRoot,
        height
      );
      await merkleDropContract.waitForDeployment();

      // Transfer tokens to the contract
      await mockToken.transfer(await merkleDropContract.getAddress(), ethers.parseEther('100'));

      // Step 3: Verify each proof on-chain
      let validCount = 0;
      for (const url of urls) {
        const verification = verifyLink(url, merkleRoot, 31337);
        expect(verification.isValid).to.be.true;
        
        // Verify on contract
        const [isValid, index] = await merkleDropContract.verify(
          verification.proof,
          verification.leaf
        );
        
        if (isValid) {
          validCount++;
          
          // Check not claimed yet
          const isClaimed = await merkleDropContract.isClaimed(index);
          expect(isClaimed).to.be.false;
        }
      }
      
      expect(validCount).to.equal(urls.length);
    });

    it('should execute full drop task with actual deployment', async () => {
      // Mock HRE with actual Hardhat runtime
      const hre = {
        getChainId: async () => '31337',
        deployments: {
          getOrNull: async () => null,
          deploy: async (_name: string, options: any) => {
            const factory = await ethers.getContractFactory('SignatureMerkleDrop128');
            const contract = await factory.deploy(...options.args);
            await contract.waitForDeployment();
            return {
              address: await contract.getAddress(),
              contract
            };
          }
        },
        getNamedAccounts: async () => ({
          deployer: owner.address
        }),
        ethers
      };

      // Execute drop task without debug mode
      await dropTask(hre as any, {
        a: '1',      // 1 ETH per drop
        n: '5',      // 5 recipients
        v: '1001',   // version
        debug: false // Deploy mode
      });

      // Note: In real implementation, the deployment would be saved by hardhat-deploy
    });

    it('should reject invalid proofs on-chain', async () => {
      // Generate valid drop
      const { merkleRoot, height } = await generateLinks(
        '1',
        '1',
        '1002',
        31337,
        true
      );

      // Deploy contract
      const SignatureMerkleDrop128 = await ethers.getContractFactory('SignatureMerkleDrop128');
      const merkleDropContract = await SignatureMerkleDrop128.deploy(
        await mockToken.getAddress(),
        merkleRoot,
        height
      );
      await merkleDropContract.waitForDeployment();

      // Try to verify with wrong proof
      const fakeProof = Buffer.alloc(16 * height, 0);
      const fakeLeaf = '0x' + Buffer.alloc(16, 1).toString('hex');
      
      const [isValid] = await merkleDropContract.verify(
        fakeProof,
        fakeLeaf
      );
      
      expect(isValid).to.be.false;
    });

    it('should handle claim process with signature verification', async () => {
      // Generate a simple drop for testing
      const wallet = ethers.Wallet.createRandom();
      const amount = ethers.parseEther('1');
      
      // Create merkle tree with single entry
      const leaf = ethers.keccak256(
        ethers.solidityPacked(['address', 'uint256'], [wallet.address, amount])
      ).slice(0, 34); // Take first 16 bytes + 0x
      
      // For single leaf, root equals leaf
      const merkleRoot = leaf;
      const height = 0;
      const proof = '0x'; // Empty proof for single leaf
      
      // Deploy contract
      const SignatureMerkleDrop128 = await ethers.getContractFactory('SignatureMerkleDrop128');
      const merkleDropContract = await SignatureMerkleDrop128.deploy(
        await mockToken.getAddress(),
        merkleRoot,
        height
      );
      await merkleDropContract.waitForDeployment();
      
      // Fund contract
      await mockToken.transfer(await merkleDropContract.getAddress(), amount);
      
      // Create signature
      const message = ethers.solidityPackedKeccak256(['address'], [receiver.address]);
      const signature = await wallet.signMessage(ethers.getBytes(message));
      
      // Claim tokens
      const balanceBefore = await mockToken.balanceOf(receiver.address);
      
      await merkleDropContract.claim(
        receiver.address,
        amount,
        proof,
        signature
      );
      
      const balanceAfter = await mockToken.balanceOf(receiver.address);
      expect(balanceAfter - balanceBefore).to.equal(amount);
      
      // Verify claimed
      const isClaimed = await merkleDropContract.isClaimed(0);
      expect(isClaimed).to.be.true;
      
      // Try to claim again - should fail
      try {
        await merkleDropContract.claim(receiver.address, amount, proof, signature);
        expect.fail('Should have reverted');
      } catch (error: any) {
        expect(error.message).to.include('DropAlreadyClaimed');
      }
    });
  });

  describe('Integration with DropService', () => {
    it('should generate and deploy complete merkle drop', async () => {
      // Create drop settings with test codes included
      const settings = DropService.createDropSettings(
        false,    // no QR codes
        true,     // save links
        [10n, 5n],     // 10 test codes + 5 production codes
        [ethers.parseEther('1'), ethers.parseEther('1')], // 1 ETH each
        10,       // test code count (for file separation)
        1003,     // version
        false,    // not debug
        31337     // Hardhat
      );

      // Generate codes
      const result = await DropService.generateCodes(settings);
      
      expect(result.merkleRoot).to.exist;
      expect(result.urls.length).to.equal(15); // 10 test + 5 production
      
      // Deploy contract
      const SignatureMerkleDrop128 = await ethers.getContractFactory('SignatureMerkleDrop128');
      const merkleDropContract = await SignatureMerkleDrop128.deploy(
        await mockToken.getAddress(),
        result.merkleRoot,
        result.height
      );
      await merkleDropContract.waitForDeployment();
      
      // Verify contract state
      expect(await merkleDropContract.merkleRoot()).to.equal(result.merkleRoot);
      expect(await merkleDropContract.depth()).to.equal(result.height);
      expect(await merkleDropContract.token()).to.equal(await mockToken.getAddress());
    });
  });

  describe('CLI Integration with Deployment', () => {
    it('should verify links generated by CLI against deployed contract', async () => {
      // Generate using CLI-like process
      const version = 1004;
      const chainId = 31337;
      
      // Simulate CLI generation
      const settings = DropService.createDropSettings(
        false,
        true,
        [3n, 2n],
        [ethers.parseEther('1'), ethers.parseEther('2')],
        10,
        version,
        false,
        chainId
      );
      
      const { merkleRoot, height, urls } = await DropService.generateCodes(settings);
      
      // Deploy contract
      const SignatureMerkleDrop128 = await ethers.getContractFactory('SignatureMerkleDrop128');
      const merkleDropContract = await SignatureMerkleDrop128.deploy(
        await mockToken.getAddress(),
        merkleRoot,
        height
      );
      await merkleDropContract.waitForDeployment();
      
      // Verify each link
      for (const url of urls) {
        const result = VerificationService.parseLink(url, merkleRoot, chainId);
        expect(result.isValid).to.be.true;
        
        // Verify on-chain
        const [isValid] = await merkleDropContract.verify(result.proof, result.leaf);
        expect(isValid).to.be.true;
      }
    });
  });
});

// Note: Mock contract should already exist in contracts/test/MockERC20.sol
