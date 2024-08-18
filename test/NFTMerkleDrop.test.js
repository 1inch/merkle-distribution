const hre = require('hardhat');
const { ethers, getChainId } = hre;
const { generateNFTDrop, parseMapping } = require('../src/nft_drop/nft_drop'); // Adjust the path if necessary
const fs = require('fs');
const path = require('path');
const { shouldBehaveLikeNFTMerkleDrop } = require('./behaviors/NFTMerkleDrop.behavior');
const { deployContract } = require('@1inch/solidity-utils');
const { createNewNFTDropSettings } = require('../src/nft_drop/gen_nft_lib');

async function deployContractsFixture () {
    const [deployer] = await ethers.getSigners();

    // Deploy the ERC721 contract
    const myNFT = await deployContract('MyERC721Token', ['My NFT', 'MNFT', deployer.address]);

    // Generate Merkle Drop
    // Get the chain ID
    const chainId = await getChainId();

    // Load and parse the mapping file
    const dropMapping = parseMapping(fs.readFileSync(path.resolve('./input/testMapping.json'), 'utf8'));

    // Pass only the necessary parameters, others will be set to their defaults
    const params = {
        nftMapping: dropMapping,
        flagNoDeploy: true,
    };

    // Generate the NFT Drop
    const dropResult = await generateNFTDrop(params);
    /**
     * @type {DropResult}
     */
    const dropResult = await generateNFTDrop();

    // Deploy NFTMerkleDrop contract
    const nftDrop = await deployContract('NFTMerkleDrop', [myNFT.target, dropResult.root]);

    return { deployer, myNFT, nftDrop, dropResult };
}

// Main test suite
describe('NFTMerkleDrop', function () {
    shouldBehaveLikeNFTMerkleDrop({
        deployContractsFixture,
    });
});
