// const { assert } = require('chai');
const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    // 10500000000000000000000
    const args = ['0x111111111117dC0aa78b770fA6A738034120C302', '0x86c6d5cf74f9c62fda7526eed4340693', 9];

    const merkleDrop128 = await deploy('MerkleDrop128-9', {
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
