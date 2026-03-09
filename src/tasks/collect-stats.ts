import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import { successfulResult, errorResult } from 'hardhat/utils/result';
import { getTestDetectionConfig } from '../config/test-detection.config';
import { DropConfig, StatisticsService } from '../services/StatisticsService';
import { SignatureDropIgnition } from './lib/hardhat-helpers';

interface CollectStatsTaskArguments {
    versions: number[];
}

export default async function (
    args: CollectStatsTaskArguments,
    hre: HardhatRuntimeEnvironment,
) {
    const versions = args.versions.filter((v) => v > 0);
    if (versions.length === 0) {
        console.error('❌ Error: At least one valid version number must be provided with --versions parameter');
        return errorResult(new Error('No valid versions provided'));
    }

    const conn = await hre.network.connect();
    const chainId = conn.networkConfig.chainId ?? 31337;
    const networkName = conn.networkName;

    if (!chainId || chainId === 31337) {
        console.error('❌ Error: Statistics collection is only supported on live networks. Please specify a non-local network with --network parameter');
        return errorResult(new Error('Unsupported network'));
    }

    // Collect deployment info for all versions
    const dropConfigs: Array<DropConfig> = [];

    for (const v of versions) {

        const journal = await SignatureDropIgnition.getLogValues(networkName, v);
        if (!journal || !journal.address || !journal.rewardToken ) {
            console.warn(`⚠️  Constructor arguments not found or invalid for version ${v}, skipping...`);
            continue;
        }

        const tokenAddress = journal.rewardToken as string;
        
        dropConfigs.push({
            version: v.toString(),
            contractAddress: journal.address,
            tokenAddress,
            deploymentBlock: journal.blockNumber || 0,
        });
        
        console.log(`📍 Drop v${v}: ${journal.address}`);
    }

    if (dropConfigs.length === 0) {
        console.error('❌ No valid deployments found for the specified versions');
        return errorResult(new Error('No valid deployments found'));
    }

    console.log(`\n📈 Collecting statistics for ${dropConfigs.length} drop${dropConfigs.length > 1 ? 's' : ''}...`);
    
    try {
        // Get test detection config for the current network
        const testConfig = getTestDetectionConfig(networkName);
        
        // Use multi-drop collection method (works for single drop too)
        const multiStats = await StatisticsService.collectStatisticsForMultipleDrops(
            dropConfigs,
            conn.ethers.provider,
            testConfig,
        );
        
        // Format and display statistics
        StatisticsService.formatMultiDropStatisticsOutput(multiStats);
        
        console.log('\n✅ Statistics collection complete!');
        
    } catch (error) {
        console.error(`\n❌ Failed to collect statistics: ${error}`);
        return errorResult(new Error('Failed to collect statistics'));
    }
    

    return successfulResult(true);
}
