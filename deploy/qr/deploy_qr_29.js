// const { assert } = require('chai');
const hre = require('hardhat');
const { getChainId } = hre;

// change number
const VERSION = 29;

module.exports = async ({ deployments, getNamedAccounts }) => {
    console.log('running deploy script: deploy script ' + VERSION.toString());
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    // 1inch address, merkle root, tree height
    const args = ['0x111111111117dC0aa78b770fA6A738034120C302', '0x7554f23dc98f9f225e2346a6b5a16f0b', 8];

    const deployScriptName = 'MerkleDrop128-' + VERSION.toString();
    const merkleDrop128 = await deploy(deployScriptName, {
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
