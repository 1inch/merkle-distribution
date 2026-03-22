import path from 'path';
import fs from 'fs';
import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import { ethers } from 'ethers';
import { successfulResult, errorResult } from 'hardhat/utils/result';
import { SignatureDropIgnition } from './lib/hardhat-helpers';
import { verifyLinksWithProgress } from './lib/verification';

interface VerifyLinksTaskArguments {
    ver: number;
}

export default async function (
    args: VerifyLinksTaskArguments,
    hre: HardhatRuntimeEnvironment,
) {

    const version = args.ver;
    if (version < 1) {
        console.error('❌ Error: Version must be specified with --v parameter');
        return errorResult(new Error('Missing required version parameter'));
    }
    
    // Check for links file
    const linksFilePath = path.join('./drops/gendata', `${version}-qr-links.json`);

    if (!fs.existsSync(linksFilePath)) {
        console.error(`❌ Links file not found: ${linksFilePath}`);
        return errorResult(new Error('Links file not found'));
    }

    const conn = await hre.network.connect();
    const chainId = conn.networkConfig.chainId ?? 31337;
    const networkName = conn.networkName;

    // Get deployment address
    const deployed = await SignatureDropIgnition.getAddress(networkName, version);
    if (!deployed) {
        console.error(`❌ Deployment file not found for version: ${version} (network: ${networkName})`);
        console.error('Check that --network and --ver arguments are correct');
        return errorResult(new Error('Deployment file not found'));
    }
  
    console.log(`\n🔍 Starting link verification for version ${version}...`);
    console.log(`📍 Network: ${networkName} (chainId: ${chainId})`);
    console.log(`📍 Contract address: ${deployed}\n`);
  
    // Read and parse the links file
    const linksData = JSON.parse(fs.readFileSync(linksFilePath, 'utf-8'));
    const merkleRoot = linksData.root;
    const productionUrls = linksData.codes.map((code: any) => code.url); // eslint-disable-line
  
    // Read test links if they exist
    const testLinksFilePath = path.join('./drops/gendata', `${version}-qr-links-test.json`);
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
    const contract = new ethers.Contract(deployed, contractABI, conn.ethers.provider);
  
    // Verify all links using the helper function
    await verifyLinksWithProgress(contract, allUrls, merkleRoot, chainId);
    console.log('');

    return successfulResult(true);
}
