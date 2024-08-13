// Load Hardhat environment
require('hardhat/config');

const hre = require('hardhat');
const { deployAndGetContract } = require('@1inch/solidity-utils');

// Helper function to pad hex strings to 32 bytes
function padHexToBytes32(hexValue) {
    const value = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
    const paddedValue = value.padStart(64, '0');
    return '0x' + paddedValue;
}

// Main function to deploy the NFTMerkleDrop contract
async function main({ nftContract, merkleRoot, deployments, getNamedAccounts }) {
    const chainId = await ethers.provider.getNetwork().then(net => net.chainId);
    const { deployer } = await getNamedAccounts();

    const merkleRoot32 = padHexToBytes32(merkleRoot);

    console.log(`Deploying NFTMerkleDrop to network ID ${chainId} with merkleRoot ${merkleRoot32}`);

    // Setting the gas fees to avoid the 'transaction underpriced' error
    const maxFeePerGas = 50e9 ; // 50 gwei
    const maxPriorityFeePerGas = 2e9; // 2 gwei

    // Deploy the contract with the constructor arguments
    const nftMerkleDrop = await deployAndGetContract({
        contractName: 'NFTMerkleDrop',
        constructorArgs: [nftContract, merkleRoot32],
        deployments,
        deployer,
        overrides: {
            maxFeePerGas,
            maxPriorityFeePerGas,
        },
    });

    console.log('NFTMerkleDrop deployed to:', await nftMerkleDrop.getAddress(), nftMerkleDrop.address);
}

// Allow the script to be used both as a task in Hardhat and as a standalone Node.js script
if (require.main === module) {
    const args = {
        nftContract: process.argv[2],
        merkleRoot: process.argv[3],
    };
    main(args)
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
