import * as fs from 'fs';
import * as path from 'path';
import { HardhatDropTaskArgs, HardhatQRDeployTaskArgs } from '../types';
import { DropService } from '../services/DropService';
import { VerificationService } from '../services/VerificationService';
import { StatisticsService } from '../services/StatisticsService';

// Extended HRE type that includes hardhat-deploy properties
interface ExtendedHRE {
  getChainId: () => Promise<string>;
  deployments: {
    getOrNull: (name: string) => Promise<{ 
      address: string; 
      args?: unknown[];
      receipt?: {
        blockNumber?: number;
      };
    } | null>;
  };
  getNamedAccounts: () => Promise<{ [name: string]: string }>;
  run: (taskName: string, taskArguments?: unknown) => Promise<unknown>;
  ethers: any; // eslint-disable-line
  network: {
    name: string;
  };
}

// Map network names to chain IDs
const CHAIN_ID_MAP: { [key: string]: number } = {
    'mainnet': 1,
    'base': 8453,
    'bsc': 56,
    'polygon': 137,
    'arbitrum': 42161,
    'optimism': 10,
    'avalanche': 43114,
    // Add more networks as needed
};

/**
 * Verify multiple links with progress visualization
 * @param contract - The contract instance with verify method
 * @param urls - Array of URLs to verify
 * @param merkleRoot - The merkle root for verification
 * @param chainId - The chain ID
 * @returns The count of valid links
 */
async function verifyLinksWithProgress (
    contract: { verify: (proof: unknown, leaf: unknown) => Promise<[boolean]> },
    urls: string[],
    merkleRoot: string,
    chainId: number,
): Promise<number> {
    console.log('🔍 Verifying all links...');
    process.stdout.write('[');
    
    let validCount = 0;
    for (const url of urls) {
        try {
            const merkleNode = verifyLink(url, merkleRoot, chainId);
            const response = await contract.verify(merkleNode.proof, merkleNode.leaf);
            const isValid = response[0];
            
            if (isValid) {
                process.stdout.write('\x1b[32m■\x1b[0m');
                validCount++;
            } else {
                process.stdout.write('\x1b[31m■\x1b[0m');
            }
        } catch {
            process.stdout.write('\x1b[31m■\x1b[0m');
        }
    }
    
    process.stdout.write(']\n\n');
    console.log(`✅ Verification complete: ${validCount}/${urls.length} links valid`);
    
    if (validCount < urls.length) {
        console.log(`⚠️  Warning: ${urls.length - validCount} links failed verification`);
    }
    
    return validCount;
}

/**
 * Generate links for merkle drop
 */
export async function generateLinks (
    amounts: string,
    counts: string,
    version: string,
    chainId: number,
    debugMode: boolean,
): Promise<{ merkleRoot: string; height: number; urls: string[] }> {
    return DropService.generateLinks(amounts, counts, version, chainId, debugMode);
}

/**
 * Verify a claim link
 */
export function verifyLink (
    url: string,
    root: string,
    chainId: number,
): { root: string; proof: Buffer; leaf: string; isValid: boolean } {
    const result = VerificationService.parseLink(url, root, chainId);
  
    if (!result.isValid) {
        throw new Error('Invalid link');
    }
  
    return {
        root: result.root,
        proof: result.proof,
        leaf: result.leaf,
        isValid: result.isValid,
    };
}

/**
 * Deploy QR drop contract
 */
export async function deployQRDrop (
    hre: ExtendedHRE,
    args: HardhatQRDeployTaskArgs,
): Promise<{ getAddress: () => Promise<string>; verify: (proof: unknown, leaf: unknown) => Promise<[boolean]> }> {
    const deploymentScript = require('../../deploy/deploy_signature');
    const { deployments, getNamedAccounts } = hre;
  
    return deploymentScript({
        deployments,
        getNamedAccounts,
        version: args.v,
        merkleRoot: args.r,
        merkleHeight: args.h,
    });
}

/**
 * Full drop deployment task
 */
export async function dropTask (
    hre: ExtendedHRE,
    args: HardhatDropTaskArgs,
): Promise<void> {
    const chainId = await hre.getChainId();
  
    console.log('\n🚀 Starting merkle drop deployment...\n');
  
    // Generate links
    const { merkleRoot, height, urls } = await generateLinks(
        args.a,
        args.n,
        args.v,
        Number(chainId),
        args.debug || false,
    );
  
    console.log('\n📊 Generated drop with:');
    console.log(`   - Merkle root: ${merkleRoot}`);
    console.log(`   - Tree height: ${height}`);
    console.log(`   - Total links: ${urls.length}\n`);
  
    // Deploy contract if not in debug mode
    if (!args.debug) {
        console.log('📝 Deploying contract...\n');
    
        const contract = await deployQRDrop(hre, {
            v: args.v,
            r: merkleRoot,
            h: height.toString(),
        });
    
        console.log(`✅ Contract deployed at: ${await contract.getAddress()}\n`);
    
        // Verify all links using the helper function
        await verifyLinksWithProgress(contract, urls, merkleRoot, Number(chainId));
        console.log('');
    }
}

/**
 * Verify deployment task
 */
export async function verifyDeploymentTask (
    hre: ExtendedHRE,
    version: string,
): Promise<void> {
    const { deployments } = hre;
  
    const deployed = await deployments.getOrNull(`MerkleDrop128-${version}`);
  
    if (!deployed) {
        console.error(`❌ Deployment file not found for version: ${version}`);
        return;
    }
  
    console.log(`\n🔍 Verifying contract deployment for version ${version}...`);
    console.log(`📍 Contract address: ${deployed.address}\n`);
  
    await hre.run('verify:verify', {
        address: deployed.address,
        constructorArguments: deployed.args,
    });
  
    console.log('\n✅ Contract verified successfully!\n');
}

/**
 * Verify links task - verifies all links from a deployed contract
 */
export async function verifyLinksTask (
    hre: ExtendedHRE,
    version: string,
): Promise<void> {
    const { deployments, ethers } = hre;
    const networkName = hre.network.name;
  
    const chainId = CHAIN_ID_MAP[networkName] || Number(await hre.getChainId());
  
    // Get deployment
    const deployed = await deployments.getOrNull(`MerkleDrop128-${version}`);
  
    if (!deployed) {
        console.error(`❌ Deployment file not found for version: ${version}`);
        return;
    }
  
    console.log(`\n🔍 Starting link verification for version ${version}...`);
    console.log(`📍 Network: ${networkName} (chainId: ${chainId})`);
    console.log(`📍 Contract address: ${deployed.address}\n`);
  
    // Read links from JSON file
    const linksFilePath = path.join('./drops/gendata', `${version}-qr-links.json`);
    const testLinksFilePath = path.join('./drops/gendata', `${version}-qr-links-test.json`);

    if (!fs.existsSync(linksFilePath)) {
        console.error(`❌ Links file not found: ${linksFilePath}`);
        return;
    }
  
    // Read and parse the links file
    const linksData = JSON.parse(fs.readFileSync(linksFilePath, 'utf-8'));
    const merkleRoot = linksData.root;
    const productionUrls = linksData.codes.map((code: any) => code.url); // eslint-disable-line
  
    // Read test links if they exist
    let testUrls: string[] = [];
    if (fs.existsSync(testLinksFilePath)) {
        const testLinksData = JSON.parse(fs.readFileSync(testLinksFilePath, 'utf-8'));
        testUrls = testLinksData.codes.map((code: any) => code.url); // eslint-disable-line
    }
  
    // Combine all URLs
    const allUrls = [...testUrls, ...productionUrls];
  
    console.log(`📊 Found ${allUrls.length} links to verify`);
    console.log(`   - Test links: ${testUrls.length}`);
    console.log(`   - Production links: ${productionUrls.length}`);
    console.log(`   - Merkle root: ${merkleRoot}\n`);
  
    // Connect to the contract
    const contractABI = [
        'function verify(bytes calldata proof, bytes16 leaf) external view returns (bool valid, uint256 index)',
    ];
    const contract = new ethers.Contract(deployed.address, contractABI, ethers.provider);
  
    // Verify all links using the helper function
    await verifyLinksWithProgress(contract, allUrls, merkleRoot, chainId);
    console.log('');
}

/**
 * Collect on-chain statistics for deployed drops
 */
export async function collectStatsTask (
    hre: ExtendedHRE,
    version: string,
): Promise<void> {
    const { deployments, ethers } = hre;
    const networkName = hre.network.name;
  
    // Get deployment
    const deployed = await deployments.getOrNull(`MerkleDrop128-${version}`);
  
    if (!deployed) {
        console.error(`❌ Deployment file not found for version: ${version}`);
        return;
    }
  
    console.log(`\n📊 On-Chain Statistics for Drop Version ${version}`);
    console.log(`${'━'.repeat(50)}`);
    console.log(`📍 Network: ${networkName}`);
    console.log(`📍 Contract: ${deployed.address}`);
  
    // Connect to the drop contract to get token address
    const dropContractABI = [
        'function token() external view returns (address)',
    ];
    const dropContract = new ethers.Contract(deployed.address, dropContractABI, ethers.provider);
  
    let tokenAddress: string;
    try {
        tokenAddress = await dropContract.token();
        console.log(`📍 Token: ${tokenAddress}\n`);
    } catch (error) {
        console.error(`❌ Failed to get token address from drop contract: ${error}`);
        return;
    }
  
    console.log(`📈 Collecting claim statistics...`);
  
    try {
        // Get current block number
        const currentBlock = await ethers.provider.getBlockNumber();
        
        // Find deployment block from transaction hash if available
        let startBlock = 0;
        if (deployed.receipt && deployed.receipt.blockNumber) {
            startBlock = deployed.receipt.blockNumber;
            console.log(`   - Scanning from deployment block ${startBlock} to ${currentBlock}`);
        } else {
            console.log(`   - Scanning from block 0 to ${currentBlock}`);
        }
        
        // Use StatisticsService to collect statistics
        const stats = await StatisticsService.collectStatistics(
            deployed.address,
            tokenAddress,
            ethers.provider,
            startBlock,
        );
        
        // Check if there's any activity
        if (stats.totalClaims === 0 && Number(stats.totalFunded) === 0) {
            console.log(`\n📊 Claims Statistics:`);
            console.log(`   - Total Claims: 0`);
            console.log(`   - Total Amount Claimed: 0 ${stats.symbol}`);
            console.log(`\n✅ No activity has been recorded yet.`);
            return;
        }
        
        // Format and display statistics
        const output = StatisticsService.formatStatisticsOutput(stats);
        output.forEach(line => console.log(line));
        
        console.log(`\n✅ Statistics collection complete!`);
  
    } catch (error) {
        console.error(`\n❌ Failed to collect statistics: ${error}`);
        return;
    }
}
