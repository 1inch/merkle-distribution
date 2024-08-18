const hre = require("hardhat");
const { ethers, getChainId } = hre;
const { generateNFTDrop, parseMapping} = require('../src/nft_drop/nft_drop'); // Adjust the path if necessary
const fs = require('fs');
const path = require('path');
const { shouldBehaveLikeNFTMerkleDrop } = require('./behaviors/NFTMerkleDrop.behavior');
const { deployContract } = require('@1inch/solidity-utils');
const {createNewNFTDropSettings, DropResult} = require("../src/nft_drop/gen_nft_lib");

async function deployContractsFixture() {
    const [deployer] = await ethers.getSigners();

    // Deploy the ERC721 contract
    const myNFT = await deployContract('MyERC721Token', ['My NFT', 'MNFT', deployer.address]);

    // Generate Merkle Drop
    const chainId = await getChainId();
    const dropMapping = parseMapping(fs.readFileSync(path.resolve('./input/testMapping.json'), 'utf8'));
    const settings = createNewNFTDropSettings(true,false, false, dropMapping, null, chainId, true);
    /**
     * @type {DropResult}
     */
    const dropResult = await generateNFTDrop(settings);

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
