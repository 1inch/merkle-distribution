const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

function shouldBehaveLikeNFTMerkleDrop({
    deployContractsFixture,
    addressesData,
}) {
    describe('NFTMerkleDrop Behavior', function () {
        it('should allow valid claims and reject invalid ones', async function () {
            // Call the fixture function to deploy contracts and get instances
            const { deployer, myNFT, nftDrop } = await loadFixture(deployContractsFixture);

            // Set Approval for All
            await myNFT.setApprovalForAll(nftDrop.address, true);

            const { proofs, recipients } = addressesData;

            // Claim NFTs
            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i];
                const proof = proofs[i];
                await expect(nftDrop.claim(recipient.address, recipient.tokenIds, addressesData.root, proof))
                    .to.emit(nftDrop, 'Claimed')
                    .withArgs(recipient.address, recipient.tokenIds.length);
            }

            // Attempt to reclaim the same NFTs (should fail)
            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i];
                const proof = proofs[i];
                await expect(nftDrop.claim(recipient.address, recipient.tokenIds, addressesData.root, proof))
                    .to.be.revertedWithCustomError(nftDrop, 'NothingToClaim');
            }
        });
    });
}

module.exports = {
    shouldBehaveLikeNFTMerkleDrop,
};
