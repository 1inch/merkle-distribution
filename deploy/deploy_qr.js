// const { assert } = require('chai');
const { deployAndGetContract } = require('@1inch/solidity-utils');
const hre = require('hardhat');
const { getChainId } = hre;

const oneInchAddresses = [
    {
        networkId: 1, // mainnet
        addr: '0x111111111117dC0aa78b770fA6A738034120C302',
    },
    {
        networkId: 31337, // hardhat
        addr: '0x111111111117dC0aa78b770fA6A738034120C302',
    },
    {
        networkId: 8453, // base
        addr: '0xc5fecC3a29Fb57B5024eEc8a2239d4621e111CBE',
    },
];

module.exports = async ({ deployments, getNamedAccounts, version, merkleRoot, merkleHeight }) => {
    const chainId = await getChainId();

    console.log(`running deploy script: deploy script ${version} with parameters: ${merkleRoot} ${merkleHeight}`);
    console.log('network id ', chainId);

    const rewardToken = oneInchAddresses.find((token) => token.networkId == chainId); // eslint-disable-line eqeqeq

    if (rewardToken === undefined || rewardToken.addr === undefined) {
        console.log('No reward token mapped for the chain', chainId);
        return;
    }
    console.log('reward token address', rewardToken.addr);

    const { deployer } = await getNamedAccounts();

    // 1inch address, merkle root, tree height
    const args = [rewardToken.addr, merkleRoot, merkleHeight];

    const deployScriptName = 'MerkleDrop128-' + version.toString();

    await deployAndGetContract({
        contractName: 'SignatureMerkleDrop128',
        constructorArgs: args,
        deployments,
        deployer,
        deploymentName: deployScriptName,
    });
};

module.exports.skip = async () => false;
