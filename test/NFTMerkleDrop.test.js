const hre = require("hardhat");
const { ethers, getChainId } = hre;
const { generate_nft_drop, parseMapping} = require('../src/nft_drop/nft_drop'); // Adjust the path if necessary
const fs = require('fs');
const path = require('path');
const { shouldBehaveLikeNFTMerkleDrop } = require('./behaviors/NFTMerkleDrop.behavior');
const { deployContract } = require('@1inch/solidity-utils');
const {createNewNFTDropSettings} = require("../src/nft_drop/gen_nft_lib");

// Read the input JSON once and cache it
const dropMapping = parseMapping(fs.readFileSync(path.resolve('./input/0.json'), 'utf8'));

// Step 1: Generate Merkle Root by calling the appropriate function
async function generateMerkleRoot() {
    // Retrieve the current chain ID from the Hardhat environment
    const chainId = await getChainId();

    // Call the generate_nft_drop function with the necessary arguments
    const settings = createNewNFTDropSettings(true,false, false, dropMapping, null, chainId, true);
    return await generate_nft_drop(settings);
}

// Step 2: Deploy MyERC721Token.sol and NFTMerkleDrop contracts using @1inch/solidity-utils
async function deployContractsFixture() {
    const [deployer] = await ethers.getSigners();

    // Deploy the ERC721 contract using deployContract
    const myNFT = await deployContract('MyERC721Token', ['My NFT', 'MNFT', deployer.address]);

    // Generate the Merkle Root
    const merkleRoot = await generateMerkleRoot(dropMapping);

    // Deploy the NFTMerkleDrop contract using deployContract
    const nftDrop = await deployContract('NFTMerkleDrop', [myNFT.address, merkleRoot]);

    return { deployer, myNFT, nftDrop };
}

// Main test suite
describe('NFTMerkleDrop', function () {
    // Use the behavior in your test suite
    shouldBehaveLikeNFTMerkleDrop({
        deployContractsFixture,
        addressesData: dropMapping,
    });
});
