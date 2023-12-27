// const { assert } = require('chai');
const { deployAndGetContract } = require('@1inch/solidity-utils');
const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ deployments, getNamedAccounts, version, merkleRoot, merkleHeight }) => {
    console.log(`running deploy script: deploy script ${version} with parameters: ${merkleRoot} ${merkleHeight}`);
    console.log('network id ', await getChainId());

    const { deployer } = await getNamedAccounts();

    // 1inch address, merkle root, tree height
    const args = ['0x111111111117dC0aa78b770fA6A738034120C302', merkleRoot, merkleHeight];

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