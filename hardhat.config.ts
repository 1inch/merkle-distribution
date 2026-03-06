import { defineConfig } from 'hardhat/config';
import type { HardhatPlugin } from 'hardhat/types/plugins';
import hardhatEthers from '@nomicfoundation/hardhat-ethers';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import hardhatEthersChaiMatchers from '@nomicfoundation/hardhat-ethers-chai-matchers';
import hardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';
import hardhatIgnition from '@nomicfoundation/hardhat-ignition';
import hardhatVerify from '@nomicfoundation/hardhat-verify';
import { configDotenv } from 'dotenv';

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
});
