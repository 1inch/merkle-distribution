import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import { ethers } from 'ethers';
import { successfulResult, errorResult } from 'hardhat/utils/result';
import { SignatureDropIgnition } from './lib/hardhat-helpers';

/** Minimal ERC-20 ABI for balance readout (no compile artifact in this repo). */
const erc20TokenABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
] as const;

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

    console.log(`📍 Reward Token: ${journal.rewardToken}`);

    // Connect to the token contract to check balance
    const tokenContract = await conn.ethers.getContractAt(erc20TokenABI, journal.rewardToken);
  
    let balance: bigint;
    let decimals: number;
    let symbol: string;
  
    try {
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

    // Execute rescue
    console.log('\n🚀 Initiating rescue transaction...');
    console.log(`   Amount to rescue: ${ethers.formatUnits(balance, decimals)} ${symbol}`);

    try {
        const tx = await contract.rescueFunds(journal.rewardToken, balance);
        console.log(`\n📝 Transaction submitted: ${tx.hash}`);
        console.log('⏳ Waiting for confirmation...');

        const receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log('\n✅ SUCCESS! Tokens rescued successfully');
            console.log(`${'━'.repeat(50)}`);
            console.log('📊 Rescue Summary:');
            console.log('   - Status: SUCCESS ✅');
            console.log(`   - Amount Retrieved: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
            console.log(`   - Recipient Address: ${signer.address}`);
            console.log(`   - Transaction Hash: ${receipt.hash}`);
            console.log(`   - Block Number: ${receipt.blockNumber}`);
            console.log(`   - Gas Used: ${receipt.gasUsed.toString()}`);

            const newBalance = await tokenContract.balanceOf(journal.address);
            const rescuerBalance = await tokenContract.balanceOf(signer.address);
            console.log('\n📍 Final Balances:');
            console.log(`   - Contract Balance: ${ethers.formatUnits(newBalance, decimals)} ${symbol}`);
            console.log(`   - Your Balance: ${ethers.formatUnits(rescuerBalance, decimals)} ${symbol}`);
        } else {
            console.error('\n❌ FAILED! Transaction was reverted');
            console.log(`   - Transaction Hash: ${receipt.hash}`);
            return errorResult(new Error('Rescue transaction reverted'));
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
        return errorResult(new Error('Rescue transaction failed'));
    }

    return successfulResult(true);
}
