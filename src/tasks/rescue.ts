import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import { ethers } from 'ethers';
import { successfulResult, errorResult } from 'hardhat/utils/result';
import { erc20TokenABI } from '../types/abi';
import { SignatureDropIgnition } from './lib/hardhat-helpers';

interface RescueTaskArguments {
    ver: number;
}

export default async function (
    args: RescueTaskArguments,
    hre: HardhatRuntimeEnvironment,
) {
    const version = args.ver;
    if (version < 1) {
        console.error('❌ Error: Version must be specified with --v parameter');
        return errorResult(new Error('Missing required version parameter'));
    }

    const conn = await hre.network.connect();
    const networkName = conn.networkName;

    // Get deployment address
    const journal = await SignatureDropIgnition.getLogValues(networkName, version);
    if (!journal || !journal.address || !journal.rewardToken) {
        console.error(`❌ Deployment file not found for version: ${version} (network: ${networkName})`);
        console.error('Check that --network and --ver arguments are correct');
        return errorResult(new Error('Deployment file not found'));
    }

    console.log(`\n💰 Rescuing Tokens from Drop Version ${version}`);
    console.log(`${'━'.repeat(50)}`);
    console.log(`📍 Network: ${networkName}`);
    console.log(`📍 Contract: ${journal.address}`);

    const contract = await conn.ethers.getContractAt('SignatureMerkleDrop128', journal.address);

    // Verify ownership
    const signer = (await conn.ethers.getSigners())[0];
    try {
        const owner = await contract.owner();
        if (owner.toLowerCase() !== signer.address.toLowerCase()) {
            console.error('\n❌ Error: Only the contract owner can rescue funds');
            console.error(`   Current owner: ${owner}`);
            console.error(`   Your address: ${signer.address}`);
            return errorResult(new Error('Unauthorized: Not contract owner'));
        }
        console.log('\n✅ Ownership verified: You are the contract owner');
    } catch (error) {
        console.error(`❌ Failed to verify ownership: ${error}`);
        return errorResult(new Error('Failed to verify ownership'));
    }

    console.log('rewardToken', journal.rewardToken);
    // Connect to the token contract to check balance
    const tokenContract = await conn.ethers.getContractAt(erc20TokenABI, journal.rewardToken);
    // const tokenContract = await conn.ethers.getContractAt(erc20TokenABI, '0x464682b682c3a1246324f93593b4b1c63599be12');
  
    let balance: bigint;
    let decimals: number;
    let symbol: string;
  
    try {
        // Get token details
        [balance, decimals, symbol] = await Promise.all([
            tokenContract.balanceOf(journal.address),
            tokenContract.decimals(),
            tokenContract.symbol(),
        ]);
  
        const formattedBalance = ethers.formatUnits(balance, decimals);
        console.log(`\n💎 Token Balance on Contract: ${formattedBalance} ${symbol}`);
  
        if (balance === 0n) {
            console.log('\n✅ No tokens to rescue - contract balance is already 0');
            return successfulResult(true);
        }
    } catch (error) {
        console.error('❌ Failed to get token balance: ', error);
        return errorResult(new Error('Failed to get token balance'));
    }

    return successfulResult(true);
}
