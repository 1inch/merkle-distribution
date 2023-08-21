const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('@1inch/solidity-utils');

function shouldBehaveLikeCumulativeMerkleDropFor4WalletsWithBalances1234 ({
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
                contracts: { token, drop },
                wallets,
                other: { params },
            };
        }

        it('should success to claim 1 token, second drop and claim 2 tokens twice', async function () {
            const {
                contracts: { token, drop },
                wallets,
                other: { params },
            } = await loadFixture(deployContractsFixture);

            await expect(
                is128version
                    ? await drop.claim(params.salts[0], params.wallets[0], 1, params.root, params.proofs[findSortedIndex(params, 0)])
                    : await drop.claim(params.wallets[0], 1, params.root, params.proofs[findSortedIndex(params, 0)]),
            ).to.emit(drop, 'Claimed').withArgs(params.wallets[0].address, '1');

            const newParams = await makeSecondDrop(token, drop, wallets, makeSecondDropParams);

            await expect(
                is128version
                    ? await drop.claim(newParams.salts[0], newParams.wallets[0], 3, newParams.root, newParams.proofs[findSortedIndex(newParams, 0)])
                    : await drop.claim(newParams.wallets[0], 3, newParams.root, newParams.proofs[findSortedIndex(newParams, 0)]),
            ).to.emit(drop, 'Claimed').withArgs(newParams.wallets[0].address, '2');

            await expect(
                is128version
                    ? drop.claim(newParams.salts[0], newParams.wallets[0], 3, newParams.root, newParams.proofs[findSortedIndex(newParams, 0)])
                    : drop.claim(newParams.wallets[0], 3, newParams.root, newParams.proofs[findSortedIndex(newParams, 0)]),
            ).to.be.revertedWithCustomError(drop, 'NothingToClaim');
        });

        it('should fail to claim after succelfful claim of all 3 tokens after second drop', async function () {
            const {
                contracts: { token, drop },
                wallets,
            } = await loadFixture(deployContractsFixture);

            const params = await makeSecondDrop(token, drop, wallets, makeSecondDropParams);

            await expect(
                is128version
                    ? await drop.claim(params.salts[0], params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)])
                    : await drop.claim(params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)]),
            ).to.emit(drop, 'Claimed').withArgs(params.wallets[0].address, '3');

            await expect(
                is128version
                    ? drop.claim(params.salts[0], params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)])
                    : drop.claim(params.wallets[0], 3, params.root, params.proofs[findSortedIndex(params, 0)]),
            ).to.be.revertedWithCustomError(drop, 'NothingToClaim');
        });
    });
}

module.exports = {
    shouldBehaveLikeCumulativeMerkleDropFor4WalletsWithBalances1234,
};
