// const { assert } = require('chai');
const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const args = ['0x111111111117dC0aa78b770fA6A738034120C302', '0x0349d101a6ccb88da273f8d8884e6950', 9];

    const merkleDrop128 = await deploy('MerkleDrop128-12', {
        contract: 'SignatureMerkleDrop128',
        from: deployer,
        args,
    });

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: merkleDrop128.address,
            constructorArguments: args,
        });
    }
};

module.exports.skip = async () => true;
