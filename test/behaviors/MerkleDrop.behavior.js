const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('@1inch/solidity-utils');

function shouldBehaveLikeMerkleDropFor4WalletsWithBalances1234 ({
    walletsCount,
    initContracts,
    functions: { makeDrop, findSortedIndex },
    is128version = false,
    makeDropParams,
}) {
    describe('Single drop for wallets', async function () {
        async function deployContractsFixture () {
            const wallets = await ethers.getSigners();

            const { token, drop } = await initContracts();
            const params = await makeDrop(token, drop, wallets, makeDropParams);

            return {
                contracts: { drop },
                other: { params },
            };
        }

        for (let i = 0; i < walletsCount; i++) {
            describe(`Wallet ${i + 1}`, function () {
                it('should succeed to claim', async function () {
                    const {
                        contracts: { drop },
                        other: { params },
                    } = await loadFixture(deployContractsFixture);

                    await expect(
                        is128version
                            ? await drop.claim(params.salts[i], params.wallets[i], i + 1, params.root, params.proofs[findSortedIndex(params, i)])
                            : await drop.claim(params.wallets[i], i + 1, params.root, params.proofs[findSortedIndex(params, i)]),
                    ).to.emit(drop, 'Claimed').withArgs(params.wallets[i].address, `${i + 1}`);
                });

                it('should fail to claim second time', async function () {
                    const {
                        contracts: { drop },
                        other: { params },
                    } = await loadFixture(deployContractsFixture);

                    if (is128version) {
                        await drop.claim(params.salts[i], params.wallets[i], i + 1, params.root, params.proofs[findSortedIndex(params, i)]);
                    } else {
                        await drop.claim(params.wallets[i], i + 1, params.root, params.proofs[findSortedIndex(params, i)]);
                    }

                    await expect(
                        is128version
                            ? drop.claim(params.salts[i], params.wallets[i], i + 1, params.root, params.proofs[findSortedIndex(params, i)])
                            : drop.claim(params.wallets[i], i + 1, params.root, params.proofs[findSortedIndex(params, i)]),
                    ).to.be.revertedWithCustomError(drop, 'NothingToClaim');
                });
            });
        }
    });
}

module.exports = {
    shouldBehaveLikeMerkleDropFor4WalletsWithBalances1234,
};
