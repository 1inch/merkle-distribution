import '@nomicfoundation/hardhat-verify';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import 'hardhat-dependency-compiler';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'dotenv/config';
import { task } from 'hardhat/config';
import { Networks, getNetwork } from '@1inch/solidity-utils/hardhat-setup';
import { dropTask, verifyDeploymentTask, deployQRDrop } from './src/tasks/hardhat-drop-task';

const { networks, etherscan } = new Networks().registerAll();

/**
 * Deploy QR-based Merkle Drop Contract
 * 
 * Description:
 *   Deploys a merkle drop contract using a pre-computed merkle root.
 *   This task is useful when you already have generated the merkle tree
 *   and just need to deploy the contract with specific parameters.
 * 
 * Parameters:
 *   --v : Deployment version number (used for contract naming)
 *   --r : Pre-computed merkle root (hex string)
 *   --h : Height of the merkle tree
 * 
 * Usage:
 *   yarn hardhat deploy:qr --network <network> --v <version> --r <root> --h <height>
 * 
 * Examples:
 *   # Deploy on mainnet with version 35
 *   yarn hardhat deploy:qr --network mainnet --v 35 --r 0xc8f9f70ceaa4d05d893e74c933eed42b --h 9
 *   
 *   # Deploy on base network
 *   yarn hardhat deploy:qr --network base --v 42 --r 0xabcdef1234567890 --h 10
 */
task('deploy:qr', 'Deploy a QR-based merkle drop contract with pre-computed merkle root and tree height')
    .addParam('r', 'Merkle root')
    .addParam('v', 'Deployment version')
    .addParam('h', 'Merkle tree height')
    .setAction(async (taskArgs, hre) => {
        await deployQRDrop(hre, taskArgs);
    });

/**
 * Complete Merkle Drop Deployment
 * 
 * Description:
 *   Performs a complete merkle drop deployment workflow:
 *   1. Generates claim links with specified amounts
 *   2. Creates merkle tree from the generated data
 *   3. Deploys the merkle drop contract (unless in debug mode)
 *   4. Verifies all generated links against the deployed contract
 * 
 * Parameters:
 *   --v     : Deployment version number
 *   --a     : Comma-separated list of token amounts for each tier
 *   --n     : Comma-separated list of how many codes to generate per tier
 *   --debug : (Optional) Debug mode - generates links without deploying
 * 
 * Usage:
 *   yarn hardhat drop --network <network> --v <version> --a <amounts> --n <counts> [--debug]
 * 
 * Examples:
 *   # Deploy on base with 6 tiers of different amounts
 *   yarn hardhat drop --network base --v 53 --a 5,10,20,30,40,50 --n 10,15,20,25,20,10
 *   
 *   # Deploy on mainnet with 3 tiers
 *   yarn hardhat drop --network mainnet --v 54 --a 100,250,500 --n 50,30,20
 *   
 *   # Test generation without deployment
 *   yarn hardhat drop --network hardhat --v 55 --a 10,20 --n 5,5 --debug
 */
task('drop', 'Generate merkle drop links, deploy contract, and verify all generated claim links')
    .addParam('v', 'Deployment version')
    .addParam('a', 'Amounts to generate')
    .addParam('n', 'Codes to generate')
    .addFlag('debug', 'Debug mode')
    .setAction(async (taskArgs, hre) => {
        await dropTask(hre, taskArgs);
    });

/**
 * Verify Contract on Etherscan
 * 
 * Description:
 *   Verifies a previously deployed merkle drop contract on Etherscan
 *   or the appropriate block explorer for the network. Uses saved
 *   deployment artifacts to provide constructor arguments.
 * 
 * Parameters:
 *   --v : Deployment version number (must match the deployed contract)
 * 
 * Usage:
 *   yarn hardhat verify-deployment --network <network> --v <version>
 * 
 * Examples:
 *   # Verify version 53 on base network
 *   yarn hardhat verify-deployment --network base --v 53
 *   
 *   # Verify version 42 on mainnet
 *   yarn hardhat verify-deployment --network mainnet --v 42
 * 
 * Note:
 *   Requires deployment artifacts to exist in deployments/<network>/MerkleDrop128-<version>.json
 */
task('verify-deployment', 'Verify a deployed merkle drop contract on Etherscan using deployment artifacts')
    .addParam('v', 'Deployment version')
    .setAction(async (taskArgs, hre) => {
        await verifyDeploymentTask(hre, taskArgs.v);
    });

export default {
    etherscan,
    solidity: {
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
            evmVersion: (networks[getNetwork()] as any)?.hardfork || 'shanghai',
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
