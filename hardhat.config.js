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
const { generateLinks, verifyLink } = require('./src/drop_task.js');

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

// Example yarn drop base --v 53 --a 5,10,20,30,40,50 --n 10,15,20,25,20,10 --debug
task('drop', 'Deploys contracts with custom parameters')
    .addParam('v', 'Deployment version')
    .addParam('a', 'Amounts to generate')
    .addParam('n', 'Codes to generate')
    .addFlag('debug', 'Debug mode')
    .setAction(async (taskArgs, hre) => {
        const chainId = await hre.getChainId();

        const { merkleRoot, height, urls } = await generateLinks(taskArgs.a, taskArgs.n, taskArgs.v, chainId, taskArgs.debug);

        if (taskArgs.debug) {
            const deploymentScript = require('./deploy/deploy_qr.js');
            const { deployments, getNamedAccounts } = hre;
            const contract = await deploymentScript({
                deployments,
                getNamedAccounts,
                version: taskArgs.v,
                merkleRoot,
                merkleHeight: height.toString(),
            });

            console.log('Verification:');
            process.stdout.write('[');
            for (const url of urls) {
                const merkleNode = verifyLink(url, merkleRoot, chainId);
                const response = await contract.verify(merkleNode.proof, merkleNode.leaf);
                const progress = response[0] ? '\x1b[32m■' : '\x1b[31m■';
                process.stdout.write(progress);
            }
            process.stdout.write('\x1b[0m]\n');
        }
    });

task('verify-deployment', 'Deploys contracts with custom parameters')
    .addParam('v', 'Deployment version')
    .setAction(async (taskArgs, hre) => {
        const { deployments } = hre;

        const deployed = await deployments.getOrNull(`MerkleDrop128-${taskArgs.v}`);

        if (!deployed) {
            console.log('Deployment file not found for the version: ', taskArgs.v);
            return;
        }

        await hre.run('verify:verify', {
            address: deployed.address,
            constructorArguments: deployed.args,
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
