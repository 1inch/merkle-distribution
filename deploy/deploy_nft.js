/**
 * Deploys the NFTMerkleDrop contract to the specified network.
 *
 * This script deploys the NFTMerkleDrop smart contract to a blockchain network
 * and verifies it on Etherscan. It uses the specified network and merkle root
 * to initialize the contract. If the contract has already been deployed and
 * verified on Etherscan, the script will acknowledge this and provide the
 * Etherscan link to the verified contract.
 *
 * Prerequisites:
 *  - Ensure that the following environment variables are set in your `.env` file:
 *    - `PRIVATE_KEY`: The private key of the deployer's account.
 *    - `POLYGONSCAN_API_KEY`: The API key for verifying contracts on PolygonScan (for Polygon networks).
 *    - `INFURA_API_KEY`: The Infura API key for connecting to the network (used for Polygon and other supported networks).
 *
 * Example Usage:
 *  - Deploying to Polygon Amoy network with a specific NFT contract and merkle root from input/0.json:
 *    `npx hardhat deploy:nft --network polygonAmoi --n 0x16B9563f4105a873e756479FC9716ab71E419b7D --r 0x877f9206c3851f0b52f6db59bf278d09`
 *
 * Expected Output:
 *  - Deploys the NFTMerkleDrop contract to the specified network.
 *  - If the contract is already verified on Etherscan, it will acknowledge this and provide the Etherscan link.
 *  - Outputs the deployed contract address.
 *
 * Example Output:
 *  - Deploying NFTMerkleDrop to network ID 80002 with merkleRoot 0x00000000000000000000000000000000877f9206c3851f0b52f6db59bf278d09
 *  - The contract 0x293c897d9C4c67Ba09cC3f2ad4691D6445809515 has already been verified on Etherscan.
 *  - https://amoy.polygonscan.com/address/0x293c897d9C4c67Ba09cC3f2ad4691D6445809515#code
 *  - NFTMerkleDrop deployed to: 0x293c897d9C4c67Ba09cC3f2ad4691D6445809515
 */


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
