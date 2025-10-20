import * as fs from 'fs';
import * as path from 'path';
import { HardhatDropTaskArgs, HardhatQRDeployTaskArgs } from '../types';
import { DropService } from '../services/DropService';
import { VerificationService } from '../services/VerificationService';
import { StatisticsService } from '../services/StatisticsService';
import { getTestDetectionConfig } from '../config/test-detection.config';

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
  
    // Determine version: use provided version or read from .latest and increment
    let version = args.v;
    if (!version) {
        const latestFilePath = path.join(__dirname, '..', '.latest');
        try {
            const latestVersion = fs.readFileSync(latestFilePath, 'utf-8').trim();
            const latestVersionNum = parseInt(latestVersion, 10);
            if (isNaN(latestVersionNum)) {
                throw new Error(`Invalid version number in .latest file: ${latestVersion}`);
            }
            version = (latestVersionNum + 1).toString();
            console.log(`📌 No version specified, using auto-incremented version: ${version} (previous: ${latestVersion})\n`);
        } catch (error) {
            console.error('❌ Failed to read .latest file. Please specify version with --v parameter');
            throw error;
        }
    }
  
    // Generate links
    const { merkleRoot, height, urls } = await generateLinks(
        args.a,
        args.n,
        version,
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
            v: version,
            r: merkleRoot,
            h: height.toString(),
        });
    
        console.log(`✅ Contract deployed at: ${await contract.getAddress()}\n`);
    
        // Verify all links using the helper function
        await verifyLinksWithProgress(contract, urls, merkleRoot, Number(chainId));
        console.log('');
        
        // Update .latest file with the new version after successful deployment
        if (!args.v) {
            const latestFilePath = path.join(__dirname, '..', '.latest');
            try {
                fs.writeFileSync(latestFilePath, version);
                console.log(`📝 Updated .latest file with version: ${version}\n`);
            } catch (error) {
                console.warn(`⚠️  Warning: Failed to update .latest file: ${error}`);
            }
        }
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
    
    // Parse comma-separated versions
    const versions = version.split(',').map(v => v.trim());
    
    console.log(`\n📊 On-Chain Statistics for Drop Version${versions.length > 1 ? 's' : ''}: ${versions.join(', ')}`);
    console.log(`${'━'.repeat(50)}`);
    console.log(`📍 Network: ${networkName}`);
    
    // Collect deployment info for all versions
    const dropConfigs: Array<{
        version: string;
        contractAddress: string;
        tokenAddress: string;
        deploymentBlock: number;
    }> = [];
    
    const dropContractABI = [
        'function token() external view returns (address)',
    ];
    
    for (const v of versions) {
        const deployed = await deployments.getOrNull(`MerkleDrop128-${v}`);
        
        if (!deployed) {
            console.warn(`⚠️  Deployment file not found for version: ${v}, skipping...`);
            continue;
        }
        
        // Get token address
        const dropContract = new ethers.Contract(deployed.address, dropContractABI, ethers.provider);
        let tokenAddress: string;
        
        try {
            tokenAddress = await dropContract.token();
        } catch {
            console.warn(`⚠️  Failed to get token address for version ${v}, skipping...`);
            continue;
        }
        
        dropConfigs.push({
            version: v,
            contractAddress: deployed.address,
            tokenAddress,
            deploymentBlock: deployed.receipt?.blockNumber || 0,
        });
        
        console.log(`📍 Drop v${v}: ${deployed.address}`);
    }
    
    if (dropConfigs.length === 0) {
        console.error('❌ No valid deployments found for the specified versions');
        return;
    }
    
    console.log(`\n📈 Collecting statistics for ${dropConfigs.length} drop${dropConfigs.length > 1 ? 's' : ''}...`);
    
    try {
        // Get test detection config for the current network
        const testConfig = getTestDetectionConfig(networkName);
        
        // Use multi-drop collection method (works for single drop too)
        const multiStats = await StatisticsService.collectStatisticsForMultipleDrops(
            dropConfigs,
            ethers.provider,
            testConfig,
        );
        
        // Format and display statistics
        StatisticsService.formatMultiDropStatisticsOutput(multiStats);
        
        console.log('\n✅ Statistics collection complete!');
        
    } catch (error) {
        console.error(`\n❌ Failed to collect statistics: ${error}`);
        return;
    }
}

/**
 * Rescue tokens from deployed drop contract
 */
export async function rescueTask (
    hre: ExtendedHRE,
    version: string,
): Promise<void> {
    const { deployments, ethers, getNamedAccounts } = hre;
    const networkName = hre.network.name;
  
    // Get deployment
    const deployed = await deployments.getOrNull(`MerkleDrop128-${version}`);
  
    if (!deployed) {
        console.error(`❌ Deployment file not found for version: ${version}`);
        return;
    }
  
    console.log(`\n💰 Rescuing Tokens from Drop Version ${version}`);
    console.log(`${'━'.repeat(50)}`);
    console.log(`📍 Network: ${networkName}`);
    console.log(`📍 Contract: ${deployed.address}`);
  
    // Get the deployer account
    const { deployer } = await getNamedAccounts();
    const signer = await ethers.getSigner(deployer);
    console.log(`📍 Rescuer (Owner): ${deployer}\n`);
  
    // Connect to the drop contract
    const dropContractABI = [
        'function token() external view returns (address)',
        'function owner() external view returns (address)',
        'function rescueFunds(address token_, uint256 amount) external',
    ];
    const dropContract = new ethers.Contract(deployed.address, dropContractABI, signer);
  
    // Get token address from the contract
    let tokenAddress: string;
    try {
        tokenAddress = await dropContract.token();
        console.log(`📍 1inch Token: ${tokenAddress}`);
    } catch (error) {
        console.error(`❌ Failed to get token address from drop contract: ${error}`);
        return;
    }
  
    // Verify ownership
    try {
        const owner = await dropContract.owner();
        if (owner.toLowerCase() !== deployer.toLowerCase()) {
            console.error('\n❌ Error: Only the contract owner can rescue funds');
            console.error(`   Current owner: ${owner}`);
            console.error(`   Your address: ${deployer}`);
            return;
        }
    } catch (error) {
        console.error(`❌ Failed to verify ownership: ${error}`);
        return;
    }
  
    // Connect to the token contract to check balance
    const tokenABI = [
        'function balanceOf(address account) external view returns (uint256)',
        'function decimals() external view returns (uint8)',
        'function symbol() external view returns (string)',
    ];
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, ethers.provider);
  
    let balance: bigint;
    let decimals: number;
    let symbol: string;
  
    try {
        // Get token details
        [balance, decimals, symbol] = await Promise.all([
            tokenContract.balanceOf(deployed.address),
            tokenContract.decimals(),
            tokenContract.symbol(),
        ]);
  
        const formattedBalance = ethers.formatUnits(balance, decimals);
        console.log(`\n💎 Token Balance on Contract: ${formattedBalance} ${symbol}`);
  
        if (balance === 0n) {
            console.log('\n✅ No tokens to rescue - contract balance is already 0');
            return;
        }
    } catch (error) {
        console.error(`❌ Failed to get token balance: ${error}`);
        return;
    }
  
    // Execute rescue
    console.log('\n🚀 Initiating rescue transaction...');
    console.log(`   Amount to rescue: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
  
    try {
        const tx = await dropContract.rescueFunds(tokenAddress, balance);
        console.log(`\n📝 Transaction submitted: ${tx.hash}`);
        console.log('⏳ Waiting for confirmation...');
  
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log('\n✅ SUCCESS! Tokens rescued successfully');
            console.log(`${'━'.repeat(50)}`);
            console.log('📊 Rescue Summary:');
            console.log('   - Status: SUCCESS ✅');
            console.log(`   - Amount Retrieved: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
            console.log(`   - Recipient Address: ${deployer}`);
            console.log(`   - Transaction Hash: ${receipt.hash}`);
            console.log(`   - Block Number: ${receipt.blockNumber}`);
            console.log(`   - Gas Used: ${receipt.gasUsed.toString()}`);
            
            // Verify the tokens were transferred
            const newBalance = await tokenContract.balanceOf(deployed.address);
            const rescuerBalance = await tokenContract.balanceOf(deployer);
            console.log('\n📍 Final Balances:');
            console.log(`   - Contract Balance: ${ethers.formatUnits(newBalance, decimals)} ${symbol}`);
            console.log(`   - Your Balance: ${ethers.formatUnits(rescuerBalance, decimals)} ${symbol}`);
        } else {
            console.error('\n❌ FAILED! Transaction was reverted');
            console.log(`   - Transaction Hash: ${receipt.hash}`);
        }
    } catch (error: any) {
        console.error('\n❌ FAILED! Rescue transaction failed');
        console.error(`   - Error: ${error.message || error}`);
        
        if (error.reason) {
            console.error(`   - Reason: ${error.reason}`);
        }
        
        if (error.code) {
            console.error(`   - Error Code: ${error.code}`);
        }
    }
}
