import { defineConfig, task } from 'hardhat/config';
import type { HardhatPlugin } from 'hardhat/types/plugins';
import hardhatEthers from '@nomicfoundation/hardhat-ethers';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import hardhatEthersChaiMatchers from '@nomicfoundation/hardhat-ethers-chai-matchers';
import hardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';
import hardhatIgnition from '@nomicfoundation/hardhat-ignition';
import hardhatVerify from '@nomicfoundation/hardhat-verify';
import { ArgumentType } from 'hardhat/types/arguments';
import { configDotenv } from 'dotenv';

/**
 * Merkle Drop Create and Deploy
 *
 * Description:
 *   Performs a complete merkle drop deployment workflow:
 *   1. Generates claim links with specified amounts
 *   2. Creates merkle tree from the generated data
 *   3. Deploys the merkle drop contract (unless in debug mode)
 *   4. Verifies all generated links against the deployed contract
 *
 * Parameters:
 *   -v/--ver     : (Optional) Deployment version number (defaults to .latest + 1)
 *   -a/--amounts : Comma-separated list of token amounts for each tier
 *   -n/--numbers : Comma-separated list of how many codes to generate per tier
 *   -d/--debug   : (Optional) Debug mode - generates links without deploying
 *
 * Usage:
 *   yarn hardhat drop --network <network> [-v <version>] -a <amounts> -n <counts> [-d]
 *
 * Examples:
 *   # Deploy on base with auto-incremented version (reads from .latest file)
 *   yarn hardhat drop --network base -a 5,10,20,30,40,50 -n 10,15,20,25,20,10
 *
 *   # Deploy on base with specific version
 *   yarn hardhat drop --network base -v 53 -a 5,10,20,30,40,50 -n 10,15,20,25,20,10
 *
 *   # Test generation without deployment (debug mode)
 *   yarn hardhat drop --network hardhat -v 55 -a 10,20 -n 5,5 -d
 */
const drop = task('drop', 'Generate merkle drop links, deploy contract, and verify all generated claim links')
    .addOption({
        name: 'ver',
        shortName: 'v',
        description: 'Deployment version (defaults to .latest + 1)',
        defaultValue: 0,
        type: ArgumentType.INT,
    })
    .addOption({
        name: 'amounts',
        shortName: 'a',
        description: 'Amounts for drop to generate',
        defaultValue: 'not set',
        type: ArgumentType.STRING,
    })
    .addOption({
        name: 'numbers',
        shortName: 'n',
        description: 'Number of codes to generate',
        defaultValue: 'not set',
        type: ArgumentType.STRING,
    })
    .addFlag({
        name: 'debug',
        description: 'Debug mode',
    })
    .setAction(() => import('./src/tasks/drop'))
    .build();

/**
 * Verify Links for Deployed Contract
 *
 * Description:
 *   Verifies all generated links against a previously deployed merkle drop contract.
 *   Reads the links from the generated JSON files and verifies each one against
 *   the deployed contract to ensure they are valid.
 *
 * Parameters:
 *   -v/--ver : Deployment version number (must match the deployed contract)
 *
 * Usage:
 *   yarn hardhat verify-links --network <network> -v <version>
 *
 * Examples:
 *   # Verify links for version 61 on base network
 *   yarn hardhat verify-links --network base -v 61
 *
 *   # Verify links for version 42 on mainnet
 *   yarn hardhat verify-links --network mainnet -v 42
 *
 * Note:
 *   - Requires deployment artifacts to exist in deployments/<network>/MerkleDrop128-<version>.json
 *   - Requires link files to exist in generated-data/<version>-qr-links.json
 *   - Will also check generated-data/<version>-qr-links-test.json if it exists
 */
const verifyLinks = task('verify-links', 'Verify all generated links against a deployed merkle drop contract')
    .addOption({
        name: 'ver',
        shortName: 'v',
        description: 'Deployment version',
        defaultValue: 0,
        type: ArgumentType.INT,
    })
    .setAction(() => import('./src/tasks/verify-links'))
    .build();

/**
 * Verify Contract on Etherscan
 *
 * Description:
 *   Verifies a previously deployed merkle drop contract on Etherscan
 *   or the appropriate block explorer for the network. Uses saved
 *   deployment artifacts to provide constructor arguments.
 *
 * Parameters:
 *   -v/--ver : Deployment version number (must match the deployed contract)
 *
 * Usage:
 *   yarn hardhat verify-deployment --network <network> -v <version>
 *
 * Examples:
 *   # Verify version 53 on base network
 *   yarn hardhat verify-deployment --network base -v 53
 *
 *   # Verify version 42 on mainnet
 *   yarn hardhat verify-deployment --network mainnet -v 42
 *
 * Note:
 *   Requires deployment artifacts to exist
 */
const verifyDeployment = task('verify-deployment', 'Verify a deployed merkle drop contract on Etherscan using deployment artifacts')
    .addOption({
        name: 'ver',
        shortName: 'v',
        description: 'Deployment version',
        defaultValue: 0,
        type: ArgumentType.INT,
    })
    .setAction(() => import('./src/tasks/verify-deployment'))
    .build();

/**
 * Collect On-Chain Statistics for Deployed Drops
 *
 * Description:
 *   Collects and displays on-chain statistics for a deployed merkle drop contract.
 *   Queries Transfer events from the token contract to track all claims made
 *   through the drop contract.
 *
 * Parameters:
 *   -v/--ver : Deployment version number (must match the deployed contract)
 *
 * Usage:
 *   yarn stat <network> <versions list>
 *
 * Examples:
 *   # Get statistics for version 61 on base network
 *   yarn stat base 61
 *
 *   # Get statistics for version 41 on mainnet
 *   yarn stat mainnet 41
 *
 *   # Get statistics for versions 3 and 4 on mainnet 
 *   yarn stat mainnet 3 4
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
const stats = task('stats', 'Collect on-chain statistics for deployed drops')
    .addVariadicArgument({
        name: 'versions',
        description: 'Deployment version',
        type: ArgumentType.INT,
    })
    .setAction(() => import('./src/tasks/collect-stats'))
    .build();

/**
 * Rescue Tokens from Drop Contract
 *
 * Description:
 *   Rescues any remaining reward tokens from a deployed merkle drop contract.
 *   Only the contract owner can execute this function. The rescued tokens
 *   will be transferred to the owner's address.
 *
 * Parameters:
 *   -v/--ver : Deployment version number (must match the deployed contract)
 *
 * Usage:
 *   yarn rescue <network> -v <version>
 *
 * Examples:
 *   # Rescue tokens from version 61 on base network
 *   yarn rescue base -v 61
 *
 *   # Rescue tokens from version 41 on mainnet
 *   yarn rescue mainnet -v 41
 *
 *   # Rescue tokens from version 3 on BSC
 *   yarn rescue bsc -v 3
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
const rescue = task('rescue', 'Rescue remaining tokens from a deployed merkle drop contract')
    .addOption({
        name: 'ver',
        shortName: 'v',
        description: 'Deployment version',
        defaultValue: 0,
        type: ArgumentType.INT,
    })
    .setAction(() => import('./src/tasks/rescue'))
    .build();

// Ensure TypeScript recognizes these as valid plugins
const plugins: HardhatPlugin[] = [
    hardhatNetworkHelpers,
    hardhatEthers,
    hardhatToolboxMochaEthers,
    hardhatEthersChaiMatchers,
    hardhatIgnition,
    hardhatVerify,
];

export default defineConfig({
    plugins,
    paths: {
        sources: './contracts',
        tests: './test/contracts',
        cache: './cache',
        artifacts: './artifacts',
    },
    solidity: {
        profiles: {
            default: {
                version: '0.8.23',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 1000000,
                    },
                    evmVersion: 'shanghai',
                },
            },
            production: {
                version: '0.8.23',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 1000000,
                    },
                    evmVersion: 'shanghai',
                },
            },
        },
        npmFilesToBuild: ['@1inch/solidity-utils/contracts/mocks/TokenMock.sol'],
    },
    networks: {
        hardhat: {
            type: 'edr-simulated',
            chainId: 31337,
        },
        localhost: {
            type: 'http',
            url: 'http://localhost:8545',
            chainId: 31337,
        },
        base: {
            type: 'http',
            url: configDotenv().parsed?.BASE_RPC_URL || 'https://base.drpc.org',
            chainId: 8453,
            accounts: [configDotenv().parsed?.BASE_PRIVATE_KEY || ''],
        },
        sepolia: {
            type: 'http',
            url: configDotenv().parsed?.SEPOLIA_RPC_URL || '',
            chainId: 11155111,
            accounts: [configDotenv().parsed?.SEPOLIA_PRIVATE_KEY || ''],
        },
    },
    verify: {
        etherscan: {
            apiKey: configDotenv().parsed?.ETHERSCAN_API_KEY || '',
        },
        blockscout: {
            enabled: false,
        },
        sourcify: {
            enabled: false,
        },
    },
    tasks: [drop, verifyLinks, verifyDeployment, stats, rescue],
});
