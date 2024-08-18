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

function setUpNetworks () {
    const networksCollector = new Networks();
    const { etherscan } = networksCollector.registerAll();
    const customNetworks = {
        polygon: {
            network: 'polygon',
            chainId: 137,
            urls: {
                rpcURL: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
                etherscanApiURL: 'https://api.polygonscan.com/api',
                browserURL: 'https://polygonscan.com/',
            },
            hardfork: 'london',
        },
        sepolia: {
            network: 'sepolia',
            chainId: 11155111, // Sepolia testnet chainId
            urls: {
                rpcURL: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
                etherscanApiURL: 'https://api-sepolia.etherscan.io/api',
                browserURL: 'https://sepolia.etherscan.io/',
            },
            hardfork: 'london',
        },
        polygonAmoy: {
            network: 'polygonAmoy',
            chainId: 80002, // Assuming PolygonAmoy testnet chainId is 80002
            urls: {
                rpcURL: `https://polygon-amoy.infura.io/v3/${process.env.INFURA_API_KEY}`,
                etherscanApiURL: 'https://api-amoy.polygonscan.com/api',
                browserURL: 'https://amoy.polygonscan.com/',
            },
            hardfork: 'london',
        },
    };

    // Registering custom networks
    Object.entries(customNetworks).forEach(([name, data]) => {
        networksCollector.registerCustom(
            data.network,
            data.chainId,
            data.urls.rpcURL,
            process.env[`${name.toUpperCase()}_PRIVATE_KEY`] || process.env.PRIVATE_KEY,
            data.urls.etherscanApiURL,
            data.urls.rpcURL,
            data.urls.browserURL,
            data.hardfork,
        );

        etherscan.customChains.push({
            network: data.network,
            chainId: data.chainId,
            urls: {
                apiURL: data.urls.etherscanApiURL,
                browserURL: data.urls.browserURL,
            },
        });
    });
    // Extend etherscan API keys
    etherscan.apiKey = {
        ...etherscan.apiKey,
        eth: process.env.ETHERSCAN_API_KEY,
        sepolia: process.env.ETHERSCAN_API_KEY,
        polygon: process.env.POLYGONSCAN_API_KEY,
        polygonAmoy: process.env.POLYGONSCAN_API_KEY,
    };
    return { networks: networksCollector.networks, etherscan };
}

const { networks, etherscan } = setUpNetworks();

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
task('deploy:nft', 'Deploys the NFTMerkleDrop contract with custom parameters')
    .addParam('n', 'The NFT contract address')
    .addParam('r', 'The 16-byte Merkle root')
    .setAction(async (taskArgs, hre) => {
        const deploymentScript = require('./deploy/deploy_nft.js');
        await deploymentScript({
            nftContract: taskArgs.n,
            merkleRoot: taskArgs.r,
            deployments: hre.deployments,
            getNamedAccounts: hre.getNamedAccounts,
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
