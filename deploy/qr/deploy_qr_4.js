// const { assert } = require('chai');
const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const args = ['0x111111111117dC0aa78b770fA6A738034120C302', '0x1b6aa26860c7d18e5e8a9b73e9a30b08', 10];

    const merkleDrop128 = await deploy('MerkleDrop128-4', {
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
