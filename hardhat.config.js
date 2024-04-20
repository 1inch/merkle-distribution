require('@nomicfoundation/hardhat-verify');
require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
require('hardhat-dependency-compiler');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('solidity-coverage');
require('dotenv').config();
const { task } = require('hardhat/config');
const { Networks, getNetwork } = require('@1inch/solidity-utils/hardhat-setup');

const { networks, etherscan } = (new Networks()).registerAll();

// usage   : yarn qr:deploy hardhat --v <version> --r <root> --h <height>
// example : yarn qr:deploy hardhat --v 35 --r 0xc8f9f70ceaa4d05d893e74c933eed42b --h 9
task('deploy:qr', 'Deploys contracts with custom parameters')
    .addParam('r', 'Merkle root')
    .addParam('v', 'Deployment version')
    .addParam('h', 'Merkle tree height')
    .setAction(async (taskArgs, hre) => {
        const deploymentScript = require('./deploy/deploy_qr.js');
        const { deployments, getNamedAccounts } = hre;
        await deploymentScript({
            deployments,
            getNamedAccounts,
            version: taskArgs.v,
            merkleRoot: taskArgs.r,
            merkleHeight: taskArgs.h,
        });
    });

module.exports = {
    etherscan,
    solidity: {
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
            evmVersion: networks[getNetwork()]?.hardfork || 'shanghai',
        },
        version: '0.8.23',
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    networks,
    dependencyCompiler: {
        paths: [
            '@1inch/solidity-utils/contracts/mocks/TokenMock.sol',
        ],
    },
};
