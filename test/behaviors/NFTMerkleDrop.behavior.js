const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { BigNumber } = require('ethers');

function shouldBehaveLikeNFTMerkleDrop({
    deployContractsFixture,
}) {
    describe('NFTMerkleDrop Behavior', function () {
        it('should allow valid claims and reject invalid ones', async function () {
            const { deployer, myNFT, nftDrop, dropResult } = await loadFixture(deployContractsFixture);
            console.log(`Contracts deployed by ${deployer.address}`);

            const { recipients, root } = dropResult;

            // Check initial ownership
            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i];
                const owner = await myNFT.ownerOf(BigInt(recipient.tokenId[0]));
                console.log(`Before approval: Token ${recipient.tokenId[0]} owned by ${owner}`);
            }

            // Set Approval for All
            await myNFT.setApprovalForAll(nftDrop.target, true);
            console.log(`setApprovalForAll for nftDrop.target ${nftDrop.target}`);

            // Check initial ownership
            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i];
                const owner = await myNFT.ownerOf(BigInt(recipient.tokenId[0]));
                console.log(`Before claim: Token ${recipient.tokenId[0]} owned by ${owner}`);

                const isApproved = await myNFT.isApprovedForAll(deployer.address, nftDrop.target);
                console.log(`Is NFTMerkleDrop contract approved to transfer recipient's NFTs: ${isApproved}`);
                expect(isApproved).to.be.true;
            }

            // Claim NFTs
            for (let i = 0; i < recipients.length; i++) {
                const recipient = recipients[i];

                const tokenIdsArray = recipient.tokenId.map(id => BigInt(id));
                const proofArray = recipient.proof.map(p => p.data);

                await expect(nftDrop.claim(recipient.account, tokenIdsArray, root, proofArray))
                    .to.emit(nftDrop, 'Claimed')
                    .withArgs(recipient.account, tokenIdsArray.length);

                const newOwner = await myNFT.ownerOf(tokenIdsArray[0]);
                console.log(`After claim: Token ${tokenIdsArray[0]} owned by ${newOwner}`);
                expect(newOwner).to.equal(recipient.account);
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
