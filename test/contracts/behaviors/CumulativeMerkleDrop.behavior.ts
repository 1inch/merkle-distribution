import '@nomicfoundation/hardhat-chai-matchers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from '@1inch/solidity-utils';
import { Contract, Signer } from 'ethers';
const hre = require('hardhat');
const { ethers } = hre;

interface MerkleDropData {
    hashedElements: string[];
    leaves: string[];
    root: string;
    proofs: string[][];
    wallets: Signer[];
    salts?: string[];
}

interface CumulativeMerkleDropBehaviorConfig {
    initContracts: () => Promise<{ token: Contract; drop: Contract }>;
    functions: {
        makeFirstDrop: (
            token: Contract,
            drop: Contract,
            allWallets: Signer[],
            params: { amounts: bigint[]; deposit: bigint }
        ) => Promise<MerkleDropData>;
        makeSecondDrop: (
            token: Contract,
            drop: Contract,
            allWallets: Signer[],
            params: { amounts: bigint[]; deposit: bigint }
        ) => Promise<MerkleDropData>;
        findSortedIndex: (self: MerkleDropData, i: number) => number;
    };
    makeFirstDropParams: {
        amounts: bigint[];
        deposit: bigint;
    };
    makeSecondDropParams: {
        amounts: bigint[];
        deposit: bigint;
    };
}

export function shouldBehaveLikeCumulativeMerkleDropFor4WalletsWithBalances1234 ({
    initContracts,
    functions: { makeFirstDrop, makeSecondDrop, findSortedIndex },
    makeFirstDropParams,
    makeSecondDropParams,
}: CumulativeMerkleDropBehaviorConfig) {
    describe('Double drop for wallets', async function () {
        async function deployContractsFixture () {
            const wallets = await ethers.getSigners();

            const { token, drop } = await initContracts();
            const firstDropData = await makeFirstDrop(token, drop, wallets, makeFirstDropParams);
            const secondDropData = await makeSecondDrop(token, drop, wallets, makeSecondDropParams);

            return {
                contracts: { drop },
                other: { firstDropData, secondDropData },
            };
        }

        for (let i = 0; i < 4; i++) {
            describe(`Wallet ${i + 1}`, function () {
                it('should succeed to claim', async function () {
                    const {
                        contracts: { drop },
                        other: { secondDropData },
                    } = await loadFixture(deployContractsFixture);

                    const walletAddress = await secondDropData.wallets[i].getAddress();

                    const claimTx = secondDropData.salts
                        ? drop.claim(
                            secondDropData.salts[i],
                            await secondDropData.wallets[i].getAddress(),
                            makeSecondDropParams.amounts[i],
                            secondDropData.root,
                            secondDropData.proofs[findSortedIndex(secondDropData, i)],
                        )
                        : drop.claim(
                            await secondDropData.wallets[i].getAddress(),
                            makeSecondDropParams.amounts[i],
                            secondDropData.root,
                            secondDropData.proofs[findSortedIndex(secondDropData, i)],
                        );

                    await expect(claimTx).to.emit(drop, 'Claimed').withArgs(walletAddress, makeSecondDropParams.amounts[i].toString());
                });

                it('should fail to claim from the first drop', async function () {
                    const {
                        contracts: { drop },
                        other: { firstDropData, secondDropData },
                    } = await loadFixture(deployContractsFixture);

                    if (secondDropData.salts) {
                        await drop.claim(
                            secondDropData.salts[i],
                            await secondDropData.wallets[i].getAddress(),
                            makeSecondDropParams.amounts[i],
                            secondDropData.root,
                            secondDropData.proofs[findSortedIndex(secondDropData, i)],
                        );
                    } else {
                        await drop.claim(
                            await secondDropData.wallets[i].getAddress(),
                            makeSecondDropParams.amounts[i],
                            secondDropData.root,
                            secondDropData.proofs[findSortedIndex(secondDropData, i)],
                        );
                    }

                    const claimTx = firstDropData.salts
                        ? drop.claim(
                            firstDropData.salts[i],
                            await firstDropData.wallets[i].getAddress(),
                            makeFirstDropParams.amounts[i],
                            firstDropData.root,
                            firstDropData.proofs[findSortedIndex(firstDropData, i)],
                        )
                        : drop.claim(
                            await firstDropData.wallets[i].getAddress(),
                            makeFirstDropParams.amounts[i],
                            firstDropData.root,
                            firstDropData.proofs[findSortedIndex(firstDropData, i)],
                        );

                    await expect(claimTx).to.be.revertedWithCustomError(drop, 'MerkleRootWasUpdated');
                });

                it('should fail to claim second time', async function () {
                    const {
                        contracts: { drop },
                        other: { secondDropData },
                    } = await loadFixture(deployContractsFixture);

                    if (secondDropData.salts) {
                        await drop.claim(
                            secondDropData.salts[i],
                            await secondDropData.wallets[i].getAddress(),
                            makeSecondDropParams.amounts[i],
                            secondDropData.root,
                            secondDropData.proofs[findSortedIndex(secondDropData, i)],
                        );
                    } else {
                        await drop.claim(
                            await secondDropData.wallets[i].getAddress(),
                            makeSecondDropParams.amounts[i],
                            secondDropData.root,
                            secondDropData.proofs[findSortedIndex(secondDropData, i)],
                        );
                    }

                    const claimTx2 = secondDropData.salts
                        ? drop.claim(
                            secondDropData.salts[i],
                            await secondDropData.wallets[i].getAddress(),
                            makeSecondDropParams.amounts[i],
                            secondDropData.root,
                            secondDropData.proofs[findSortedIndex(secondDropData, i)],
                        )
                        : drop.claim(
                            await secondDropData.wallets[i].getAddress(),
                            makeSecondDropParams.amounts[i],
                            secondDropData.root,
                            secondDropData.proofs[findSortedIndex(secondDropData, i)],
                        );

                    await expect(claimTx2).to.be.revertedWithCustomError(drop, 'NothingToClaim');
                });
            });
        }
    });
}
