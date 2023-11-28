// const { assert } = require('chai');
const { deployAndGetContract } = require('@1inch/solidity-utils');
const hre = require('hardhat');
const { getChainId } = hre;

// change number
const VERSION = 30;

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script: deploy script ' + VERSION.toString());
    console.log('network id ', await getChainId());

    const { deployer } = await getNamedAccounts();

    // 1inch address, merkle root, tree height
    const args = ['0x111111111117dC0aa78b770fA6A738034120C302', '0xda1ca6d8cacfb49efbcc261127e6b884', 9];

    const deployScriptName = 'MerkleDrop128-' + VERSION.toString();
    await deployAndGetContract({
        contractName: 'SignatureMerkleDrop128',
        constructorArgs: args,
        deployments,
        deployer,
        deploymentName: deployScriptName,
    });
};

module.exports.skip = async () => true;
