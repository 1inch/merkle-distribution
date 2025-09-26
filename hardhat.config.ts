import '@nomicfoundation/hardhat-verify';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import 'hardhat-dependency-compiler';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'dotenv/config';
import { task, HardhatUserConfig } from 'hardhat/config';
import { Networks, getNetwork } from '@1inch/solidity-utils/hardhat-setup';
import { dropTask, verifyDeploymentTask, deployQRDrop, verifyLinksTask, collectStatsTask, rescueTask } from './src/tasks/hardhat-drop-task';

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

/**
 * Verify Links for Deployed Contract
 *
 * Description:
 *   Verifies all generated links against a previously deployed merkle drop contract.
 *   Reads the links from the generated JSON files and verifies each one against
 *   the deployed contract to ensure they are valid.
 *
 * Parameters:
 *   --v : Deployment version number (must match the deployed contract)
 *
 * Usage:
 *   yarn hardhat verify-links --network <network> --v <version>
 *
 * Examples:
 *   # Verify links for version 61 on base network
 *   yarn hardhat verify-links --network base --v 61
 *
 *   # Verify links for version 42 on mainnet
 *   yarn hardhat verify-links --network mainnet --v 42
 *
 * Note:
 *   - Requires deployment artifacts to exist in deployments/<network>/MerkleDrop128-<version>.json
 *   - Requires link files to exist in generated-data/<version>-qr-links.json
 *   - Will also check generated-data/<version>-qr-links-test.json if it exists
 */
task('verify-links', 'Verify all generated links against a deployed merkle drop contract')
    .addParam('v', 'Deployment version')
    .setAction(async (taskArgs, hre) => {
        await verifyLinksTask(hre, taskArgs.v);
    });

/**
 * Collect On-Chain Statistics for Deployed Drops
 *
 * Description:
 *   Collects and displays on-chain statistics for a deployed merkle drop contract.
 *   Queries Transfer events from the token contract to track all claims made
 *   through the drop contract.
 *
 * Parameters:
 *   --v : Deployment version number (must match the deployed contract)
 *
 * Usage:
 *   yarn stat <network> --v <version>
 *
 * Examples:
 *   # Get statistics for version 61 on base network
 *   yarn stat base --v 61
 *
 *   # Get statistics for version 41 on mainnet
 *   yarn stat mainnet --v 41
 *
 *   # Get statistics for version 3 on BSC
 *   yarn stat bsc --v 3
 *
 * Statistics Displayed:
 *   - Total number of claims
 *   - Total amount claimed
 *   - Average claim amount
 *   - First and last claim timestamps
 *
 * Note:
 *   Requires deployment artifacts to exist in deployments/<network>/MerkleDrop128-<version>.json
 */
task('stats', 'Collect on-chain statistics for deployed drops')
    .addParam('v', 'Deployment version')
    .setAction(async (taskArgs, hre) => {
        await collectStatsTask(hre, taskArgs.v);
    });

/**
 * Rescue Tokens from Drop Contract
 *
 * Description:
 *   Rescues any remaining reward tokens from a deployed merkle drop contract.
 *   Only the contract owner can execute this function. The rescued tokens
 *   will be transferred to the owner's address.
 *
 * Parameters:
 *   --v : Deployment version number (must match the deployed contract)
 *
 * Usage:
 *   yarn rescue <network> --v <version>
 *
 * Examples:
 *   # Rescue tokens from version 61 on base network
 *   yarn rescue base --v 61
 *
 *   # Rescue tokens from version 41 on mainnet
 *   yarn rescue mainnet --v 41
 *
 *   # Rescue tokens from version 3 on BSC
 *   yarn rescue bsc --v 3
 *
 * Information Displayed:
 *   - Current token balance on the contract
 *   - Success or failure status
 *   - Amount of tokens retrieved
 *   - Recipient address (owner)
 *   - Transaction details
 *
 * Note:
 *   - Requires deployment artifacts to exist in deployments/<network>/MerkleDrop128-<version>.json
 *   - Only the contract owner can execute this function
 *   - Will check the balance before attempting rescue
 */
task('rescue', 'Rescue remaining tokens from a deployed merkle drop contract')
    .addParam('v', 'Deployment version')
    .setAction(async (taskArgs, hre) => {
        await rescueTask(hre, taskArgs.v);
    });

const config: HardhatUserConfig = {
    etherscan,
    solidity: {
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
            evmVersion: (networks[getNetwork()] as { hardfork?: string })?.hardfork || 'shanghai',
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

export default config;
