const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { BigNumber } = require('ethers');

function shouldBehaveLikeNFTMerkleDrop({
    deployContractsFixture,
}) {
    describe('NFTMerkleDrop Behavior', function () {
        it('should allow valid claims and reject invalid ones', async function () {
            // Call the fixture function to deploy contracts and get instances
            const { deployer, myNFT, nftDrop, dropResult } = await loadFixture(deployContractsFixture);

            // Set Approval for All
            await myNFT.setApprovalForAll(nftDrop.target, true);

            const { recipients, root } = dropResult;

            // Claim NFTs
            for (let i = 0; i < recipients.length; i++) {
                /**
                 * @type {Recipient}
                 */
                const recipient = recipients[i];

                // Convert tokenId from string to BigInt
                const tokenIdsArray = recipient.tokenId.map(id => BigInt(id));

                // Convert proofs to array of bytes32
                const proofArray = recipient.proof.map(p => p.data);

                await expect(nftDrop.claim(recipient.account, tokenIdsArray, root, proofArray))
                    .to.emit(nftDrop, 'Claimed')
                    .withArgs(recipient.account, tokenIdsArray.length);  // Assuming the `Claimed` event emits the account and the number of claimed tokens
            }

            // Attempt to reclaim the same NFTs (should fail)
            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i];
                const tokenIdsArray = recipient.tokenId.map(id => BigInt(id));
                const proofArray = recipient.proof.map(p => p.data);

                await expect(nftDrop.claim(recipient.account, tokenIdsArray, root, proofArray))
                    .to.be.revertedWithCustomError(nftDrop, 'NothingToClaim');
            }
        });
    });
}

module.exports = {
    shouldBehaveLikeNFTMerkleDrop,
};
