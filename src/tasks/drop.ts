// Hardhat
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import { successfulResult, errorResult } from 'hardhat/utils/result';
// Deploy script
import { deploy } from '../../ignition/deploy-signature';
// Services to perform drop generation and verification
import { DropService } from '../services/DropService';
// Processing .latest file to determine version
import { verifyLinksWithProgress } from './lib/verification';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DropTaskArguments {
    ver: number;
    amounts: string;
    numbers: string;
    debug: boolean;
}

export default async function (
    args: DropTaskArguments,
    hre: HardhatRuntimeEnvironment,
) {
    console.log('\n🚀 Starting merkle drop deployment...\n');
    
    if (args.amounts === 'not set' || args.numbers === 'not set') {
        console.error('❌ Error: Both --amounts and --numbers parameters must be set');
        return errorResult(new Error('Missing required parameters'));
    }

    // Determine version: use provided version or read from .latest and increment
    let version = args.ver;
    if (version < 1) {
        const latestFilePath = path.join(__dirname, '..', '.latest');
        try {
            const latestVersion = fs.readFileSync(latestFilePath, 'utf-8').trim();
            const latestVersionNum = parseInt(latestVersion, 10);
            if (isNaN(latestVersionNum)) {
                return errorResult(new Error(`Invalid version number in .latest file: ${latestVersion}`));
            }
            version = (latestVersionNum + 1);
            console.log(`📌 No version specified, using auto-incremented version: ${version} (previous: ${latestVersion})\n`);
        } catch (error) {
            console.error('❌ Failed to read .latest file. Please specify version with --v parameter');
            return errorResult(error);
        }
    }

    const amounts = args.amounts;
    const counts = args.numbers;
    const debugMode = args.debug;

    const conn = await hre.network.connect();
    const chainId = conn.networkConfig.chainId ?? 31337;

    console.log(`🔗 Connected to network with chain ID: ${chainId}\n`);
    // Generate links
    const { merkleRoot, height, urls } = await DropService.generateLinks(amounts, counts, version.toString(), chainId, debugMode);

    console.log('\n📊 Generated drop with:');
    console.log(`   - Merkle root: ${merkleRoot}`);
    console.log(`   - Tree height: ${height}`);
    console.log(`   - Total links: ${urls.length}\n`);

    if (!args.debug) {
        console.log('📝 Deploying contract...\n');
    
        const contract = await deploy(version, merkleRoot, height);

        if (!contract) {
            console.error('❌ Contract deployment failed');
            return errorResult(new Error('Contract deployment failed'));
        }

        console.log(`✅ Contract deployed at: ${await contract.getAddress()}\n`);
    
        // Verify all links using the helper function
        await verifyLinksWithProgress(contract, urls, merkleRoot, Number(chainId));
        console.log();
        
        // Update .latest file with the new version after successful deployment
        const latestFilePath = path.join(__dirname, '..', '.latest');
        try {
            fs.writeFileSync(latestFilePath, version.toString());
            console.log(`📝 Updated .latest file with version: ${version}\n`);
        } catch (error) {
            console.warn(`⚠️  Warning: Failed to update .latest file: ${error}`);
        }
    }

    return successfulResult<boolean>(true);
}
