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

// Manually adding the Mumbai network to the etherscan configuration
etherscan.customChains = [
    {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
            apiURL: "https://api-amoy.polygonscan.com/api",
            browserURL: "https://amoy.polygonscan.com/"
        }
    }
];
etherscan.apiKey = {
      ...etherscan.apiKey, // Spread existing keys
      eth: process.env.ETHERSCAN_API_KEY,
      sepolia: process.env.ETHERSCAN_API_KEY,
      polygon: process.env.POLYGONSCAN_API_KEY,
      polygonAmoy: process.env.POLYGONSCAN_API_KEY,
}

// Extend the networks with your custom configurations
Object.assign(networks, {
  polygon: {
    url: `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    accounts: [`0x${process.env.PRIVATE_KEY}`]
  },
  polygonAmoy: {
    url: `https://polygon-amoy.infura.io/v3/${process.env.INFURA_API_KEY}`,
    accounts: [`0x${process.env.PRIVATE_KEY}`]
  },
  sepolia: {
    url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
    accounts: [`0x${process.env.SEPOLIA_PRIVATE_KEY}`]
  }
});

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
