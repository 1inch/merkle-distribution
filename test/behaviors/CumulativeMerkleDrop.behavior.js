const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('@1inch/solidity-utils');

function shouldBehaveLikeCumulativeMerkleDropFor4WalletsWithBalances1234 ({
    errorPrefix,
    initContracts,
    functions: { makeFirstDrop, makeSecondDrop, findSortedIndex },
    is128version = false,
    makeFirstDropParams,
    makeSecondDropParams,
}) {
    describe('First wallet checks', async function () {
        async function deployContractsFixture () {
            const wallets = await ethers.getSigners();

            const { token, drop } = await initContracts();
            const params = await makeFirstDrop(token, drop, wallets, makeFirstDropParams);

            return {
                constracts: { token, drop },
                wallets,
                other: { params },
            };
        }

        it.only('should success to claim 1 token, second drop and claim 2 tokens twice', async function () {
            const {
                constracts: { token, drop },
                wallets,
                other: { params },
            } = await loadFixture(deployContractsFixture);

            await expect(
                is128version
                    ? await drop.claim(params.salts[0], params.wallets[0], 1, params.root, params.proofs[findSortedIndex(params, 0)])
                    : await drop.claim(params.wallets[0], 1, params.root, params.proofs[findSortedIndex(params, 0)]),
            ).to.emit(drop, 'Claimed').withArgs(params.wallets[0].address, '1');

            await makeSecondDrop(token, drop, wallets, makeSecondDropParams);

            await expect(
                is128version
                    ? await drop.claim(params.salts[0], params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)])
                    : await drop.claim(params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)]),
            ).to.emit(drop, 'Claimed').withArgs(params.wallets[0].address, '2');

            await expect(
                is128version
                    ? drop.claim(params.salts[0], params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)])
                    : drop.claim(params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)]),
            ).to.be.revertedWith(`${errorPrefix}: Nothing to claim`);
        });

        it('should fail to claim after succelfful claim of all 3 tokens after second drop', async function () {
            const {
                constracts: { token, drop },
                wallets,
                other: { params },
            } = await loadFixture(deployContractsFixture);

            await makeSecondDrop(token, drop, wallets, makeSecondDropParams);

            await expect(
                is128version
                    ? await drop.claim(params.salts[0], params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)])
                    : await drop.claim(params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)]),
            ).to.emit(drop, 'Claimed').withArgs(params.wallets[0].address, '3');

            await expect(
                is128version
                    ? drop.claim(params.salts[0], params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)])
                    : drop.claim(params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)]),
            ).to.be.revertedWith(`${errorPrefix}: Nothing to claim`);
        });
    });
}

module.exports = {
    shouldBehaveLikeCumulativeMerkleDropFor4WalletsWithBalances1234,
};
