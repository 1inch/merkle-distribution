import * as fs from 'fs';
import * as path from 'path';
import { HardhatDropTaskArgs, HardhatQRDeployTaskArgs } from '../types';
import { DropService } from '../services/DropService';
import { VerificationService } from '../services/VerificationService';

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
  
    // Connect to the token contract to query Transfer events
    const tokenABI = [
        'event Transfer(address indexed from, address indexed to, uint256 value)',
        'function decimals() external view returns (uint8)',
        'function symbol() external view returns (string)',
    ];
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, ethers.provider);
  
    // Get token details
    let decimals = 18;
    let symbol = 'tokens';
    try {
        decimals = await tokenContract.decimals();
        symbol = await tokenContract.symbol();
    } catch (error) {
        console.log(`⚠️  Using default decimals (18) and symbol (tokens)`);
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
        
        // Query Transfer events where 'from' is the drop contract
        const filter = tokenContract.filters.Transfer(deployed.address, null, null);
        
        // Try to query all at once first (works with good providers)
        let events;
        try {
            events = await tokenContract.queryFilter(filter, startBlock, 'latest');
            console.log(`   - Found ${events.length} claim events`);
        } catch (error: any) {
            // If full range fails, use batched parallel queries
            console.log(`   - Using optimized parallel queries...`);
            
            const blockRange = 50000; // Chunk size
            const maxConcurrent = 10; // Limit concurrent requests to avoid overwhelming the RPC
            const chunks = [];
            
            // Create chunks
            for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += blockRange) {
                const toBlock = Math.min(fromBlock + blockRange - 1, currentBlock);
                chunks.push({ from: fromBlock, to: toBlock });
            }
            
            console.log(`   - Processing ${chunks.length} chunks (max ${maxConcurrent} concurrent)...`);
            
            events = [];
            let completedChunks = 0;
            
            // Process chunks in batches to avoid overwhelming the RPC
            for (let i = 0; i < chunks.length; i += maxConcurrent) {
                const batch = chunks.slice(i, Math.min(i + maxConcurrent, chunks.length));
                
                const batchPromises = batch.map(async (chunk) => {
                    let retries = 3;
                    let lastError;
                    
                    // Try with progressively smaller ranges if needed
                    const ranges = [50000, 10000, 5000, 1000];
                    
                    for (const range of ranges) {
                        if (chunk.to - chunk.from + 1 <= range) {
                            for (let attempt = 0; attempt < retries; attempt++) {
                                try {
                                    const chunkEvents = await tokenContract.queryFilter(filter, chunk.from, chunk.to);
                                    completedChunks++;
                                    process.stdout.write(`\r   - Progress: ${completedChunks}/${chunks.length} chunks completed`);
                                    return chunkEvents;
                                } catch (err: any) {
                                    lastError = err;
                                    if (attempt < retries - 1) {
                                        // Wait a bit before retrying
                                        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
                                    }
                                }
                            }
                        }
                    }
                    
                    // If all attempts failed, try smaller chunks silently
                    const smallerEvents = [];
                    const smallRange = 1000;
                    let failedRanges = [];
                    
                    for (let from = chunk.from; from <= chunk.to; from += smallRange) {
                        const to = Math.min(from + smallRange - 1, chunk.to);
                        try {
                            await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
                            const small = await tokenContract.queryFilter(filter, from, to);
                            smallerEvents.push(...small);
                        } catch {
                            // Track failed ranges
                            failedRanges.push(`${from}-${to}`);
                        }
                    }
                    
                    // Only show warning if some ranges couldn't be recovered
                    if (failedRanges.length > 0) {
                        console.error(`\n⚠️  Skipped blocks in chunk ${chunk.from}-${chunk.to}: ${failedRanges.join(', ')}`);
                    }
                    
                    completedChunks++;
                    process.stdout.write(`\r   - Progress: ${completedChunks}/${chunks.length} chunks completed`);
                    return smallerEvents;
                });
                
                // Wait for batch to complete
                const batchResults = await Promise.all(batchPromises);
                events.push(...batchResults.flat());
            }
            
            process.stdout.write(`\r   - Found ${events.length} claim events                    \n`);
        }
  
        if (events.length === 0) {
            console.log(`\n📊 Claims Statistics:`);
            console.log(`   - Total Claims: 0`);
            console.log(`   - Total Amount Claimed: 0 ${symbol}`);
            console.log(`\n✅ No claims have been made yet.`);
            return;
        }
  
        // Aggregate the data
        let totalClaims = events.length;
        let totalAmount = BigInt(0);
  
        for (const event of events) {
            if (event.args && event.args.value) {
                totalAmount += BigInt(event.args.value.toString());
            }
        }
  
        // Format the amounts
        const totalAmountFormatted = ethers.formatUnits(totalAmount.toString(), decimals);
        const averageClaim = Number(totalAmountFormatted) / totalClaims;
  
        console.log(`\n📊 Claims Statistics:`);
        console.log(`   - Total Claims: ${totalClaims.toLocaleString()}`);
        console.log(`   - Total Amount Claimed: ${Number(totalAmountFormatted).toLocaleString()} ${symbol}`);
        console.log(`   - Average Claim: ${averageClaim.toFixed(2)} ${symbol}`);
  
        // Show first and last claim info if available
        if (events.length > 0) {
            const firstClaim = events[0];
            const lastClaim = events[events.length - 1];
            
            console.log(`\n📅 Timeline:`);
            if (firstClaim.blockNumber) {
                const firstBlock = await ethers.provider.getBlock(firstClaim.blockNumber);
                if (firstBlock && firstBlock.timestamp) {
                    const firstDate = new Date(firstBlock.timestamp * 1000);
                    console.log(`   - First Claim: Block ${firstClaim.blockNumber} (${firstDate.toISOString()})`);
                }
            }
            
            if (lastClaim.blockNumber && events.length > 1) {
                const lastBlock = await ethers.provider.getBlock(lastClaim.blockNumber);
                if (lastBlock && lastBlock.timestamp) {
                    const lastDate = new Date(lastBlock.timestamp * 1000);
                    console.log(`   - Last Claim: Block ${lastClaim.blockNumber} (${lastDate.toISOString()})`);
                }
            }
        }
  
        console.log(`\n✅ Statistics collection complete!`);
  
    } catch (error) {
        console.error(`\n❌ Failed to query Transfer events: ${error}`);
        return;
    }
}
