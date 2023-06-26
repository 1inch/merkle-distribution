const hre = require('hardhat');
const { getChainId } = hre;
const { deployAndGetContract } = require('@1inch/solidity-utils');

// Must be replaced with real value
const VERSION = 0;

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script: deploy script ' + VERSION.toString());
    console.log('network id ', await getChainId());

    const { deployer } = await getNamedAccounts();

    // 1inch address, merkle root, tree height
    // Must be replaced with real values
    const args = ['address', 'merkle root', 0];

    const deploymentName = 'MerkleDrop128-' + VERSION.toString();
    await deployAndGetContract({
        contractName: 'SignatureMerkleDrop128',
        constructorArgs: args,
        deployments,
        deployer,
        deploymentName,
    });
};

module.exports.skip = async () => true;
