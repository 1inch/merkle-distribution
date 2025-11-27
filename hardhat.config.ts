import { defineConfig } from 'hardhat/config';
import type { HardhatPlugin } from 'hardhat/types/plugins';
import hardhatEthers from '@nomicfoundation/hardhat-ethers';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import hardhatEthersChaiMatchers from '@nomicfoundation/hardhat-ethers-chai-matchers';
import hardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';

// Ensure TypeScript recognizes these as valid plugins
const plugins: HardhatPlugin[] = [
    hardhatNetworkHelpers,
    hardhatEthers,
    hardhatToolboxMochaEthers,
    hardhatEthersChaiMatchers,
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
        version: '0.8.23',
        npmFilesToBuild: ["@1inch/solidity-utils/contracts/mocks/TokenMock.sol"],
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
            // evmVersion: (networks[getNetwork()] as { hardfork?: string })?.hardfork || 'shanghai',
        },
    },
});
