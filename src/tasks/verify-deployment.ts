import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import { successfulResult, errorResult } from 'hardhat/utils/result';
import { verifyContract } from '@nomicfoundation/hardhat-verify/verify';
import { SignatureDropIgnition } from './lib/hardhat-helpers';

interface VerifyDeploymentTaskArguments {
    ver: number;
}

export default async function (
    args: VerifyDeploymentTaskArguments,
    hre: HardhatRuntimeEnvironment,
) {
    const version = args.ver;
    if (version < 1) {
        console.error('❌ Error: Version must be specified with --v parameter');
        return errorResult(new Error('Missing required version parameter'));
    }

    const conn = await hre.network.connect();
    const chainId = conn.networkConfig.chainId ?? 31337;
    const networkName = conn.networkName;

    if (!chainId || chainId === 31337) {
        console.error('❌ Error: Verification is only supported on live networks. Please specify a non-local network with --network parameter');
        return errorResult(new Error('Unsupported network for verification'));
    }

    const deployed = await SignatureDropIgnition.getAddress(networkName, version);
    if (!deployed) {
        console.error(`❌ Deployment file not found for version: ${version} (network: ${networkName})`);
        console.error('Check that --network and --ver arguments are correct');
        return errorResult(new Error('Deployment file not found'));
    }

    const constructorArgs = await SignatureDropIgnition.getConstructorArgs(networkName, version);

    if (constructorArgs === undefined) {
        console.error(`❌ Constructor arguments not found in deployment artifacts for version: ${version} (network: ${networkName})`);
        console.error('Check that --network and --ver arguments are correct');
        return errorResult(new Error('Constructor arguments not found in deployment artifacts'));
    }

    await verifyContract({
        address: deployed,
        constructorArgs: constructorArgs,
    }, hre);

    return successfulResult('This task is a placeholder for verifying deployment on Etherscan. Implementation will be added in the future.');
}
