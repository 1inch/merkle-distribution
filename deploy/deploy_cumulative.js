const hre = require('hardhat');
const { getChainId } = hre;
const { deployAndGetContract } = require('@1inch/solidity-utils');

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deployer } = await getNamedAccounts();

    // Token address
    // Must be replaced with real value
    const args = ['token address'];
    // Must be replaced with real value
    const merkleRoot = 'merkle root';
    const maxFeePerGas = 1e11;
    const maxPriorityFeePerGas = 2e9;

    const cumulativeMerkleDrop = await deployAndGetContract({
        contractName: 'CumulativeMerkleDrop',
        constructorArgs: args,
        deployments,
        deployer,
    });

    const txn = await cumulativeMerkleDrop.setMerkleRoot(
        merkleRoot,
        {
            maxFeePerGas,
            maxPriorityFeePerGas,
        },
    );
    await txn.wait();

    console.log('CumulativeMerkleDrop deployed to:', await cumulativeMerkleDrop.getAddress());
};

module.exports.skip = async () => true;
