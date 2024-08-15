require('hardhat/config');
const hre = require('hardhat');  // Import Hardhat Runtime Environment
const { ethers } = hre;
const { Command } = require('commander');

const program = new Command();

program
    .option('-n, --network <network>', 'Network to use')
    .option('-c, --nftContract <nftContract>', 'NFT Contract address')
    .option('-d, --nftMerkleDrop <nftMerkleDrop>', 'NFTMerkleDrop Contract address')
    .option('-a, --account <account>', 'Recipient account address')
    .option('-t, --tokenIds <tokenIds>', 'Comma-separated list of token IDs')
    .option('-r, --merkleRoot <merkleRoot>', 'Expected Merkle root')
    .option('-p, --merkleProof <merkleProof>', 'Comma-separated list of Merkle proof hashes');

program.parse(process.argv);
const options = program.opts();

async function main() {
    const { network, nftContract, nftMerkleDrop, account, tokenIds, merkleRoot, merkleProof } = options;

    if (!network || !nftContract || !nftMerkleDrop || !account || !tokenIds || !merkleRoot || !merkleProof) {
        console.error('Missing required arguments. Please provide all required options.');
        process.exit(1);
    }

    // Ensure that the selected network is available in the Hardhat config
    if (!hre.config.networks[network]) {
        console.error(`Network ${network} is not configured in the Hardhat config.`);
        process.exit(1);
    }

    // Use the provider from the Hardhat network configuration
    const provider = hre.network.provider;
    const signer = (await ethers.getSigners())[0]; // Get the first signer from the configured accounts

    console.log(`Claiming NFTs on ${network} network...`);
    console.log(`NFT Contract address: ${nftContract}`);
    console.log(`NFTMerkleDrop Contract address: ${nftMerkleDrop}`);
    console.log(`Account: ${account}`);
    console.log(`Token IDs: ${tokenIds}`);
    console.log(`Expected Merkle Root: ${merkleRoot}`);
    console.log(`Merkle Proof: ${merkleProof}`);

    const nftContractInstance = new ethers.Contract(nftContract, [
        "function ownerOf(uint256 tokenId) public view returns (address)"
    ], provider);

    console.log("\nChecking ownership before the claim:");
    const tokenIdsArray = tokenIds.split(',').map(id => BigInt(id.trim())); // Convert to BigInt
    for (let tokenId of tokenIdsArray) {
        const ownerBefore = await nftContractInstance.ownerOf(tokenId);
        console.log(`Token ID ${tokenId.toString()}: Owned by ${ownerBefore}`);
    }

    const nftMerkleDropInstance = new ethers.Contract(nftMerkleDrop, [
        "function claim(address account, uint256[] calldata tokenIds, bytes32 expectedMerkleRoot, bytes32[] calldata merkleProof) external"
    ], signer);

    const tx = await nftMerkleDropInstance.claim(
        account,
        tokenIdsArray,
        merkleRoot,
        merkleProof.split(',')
    );

    console.log('Transaction hash:', tx.hash);

    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);
    console.log('Claim successful!');

    console.log("\nChecking ownership after the claim:");
    for (let tokenId of tokenIdsArray) {
        const ownerAfter = await nftContractInstance.ownerOf(tokenId);
        console.log(`Token ID ${tokenId.toString()}: Owned by ${ownerAfter}`);
    }

    const ownershipTransferSuccess = tokenIdsArray.every(async tokenId => {
        const ownerAfter = await nftContractInstance.ownerOf(tokenId);
        return ownerAfter === account;
    });

    if (ownershipTransferSuccess) {
        console.log("\nAll NFTs have been successfully transferred to the recipient.");
    } else {
        console.log("\nError: Not all NFTs have been transferred to the recipient.");
    }
}

// Allow the script to be used both as a task in Hardhat and as a standalone Node.js script
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;
