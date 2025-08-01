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

interface MerkleDropBehaviorConfig {
    walletsCount: number;
    initContracts: () => Promise<{ token: Contract; drop: Contract }>;
    functions: {
        makeDrop: (
            token: Contract,
            drop: Contract,
            allWallets: Signer[],
            params: { amounts: bigint[]; deposit: bigint }
        ) => Promise<MerkleDropData>;
        findSortedIndex: (self: MerkleDropData, i: number) => number;
    };
    is128version?: boolean;
    makeDropParams: {
        amounts: bigint[];
        deposit: bigint;
    };
}

export function shouldBehaveLikeMerkleDropFor4WalletsWithBalances1234 ({
    walletsCount,
    initContracts,
    functions: { makeDrop, findSortedIndex },
    is128version = false,
    makeDropParams,
}: MerkleDropBehaviorConfig) {
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

                    const walletAddress = await params.wallets[i].getAddress();

                    await expect(
                        is128version
                            ? await drop.claim(params.salts![i], await params.wallets[i].getAddress(), i + 1, params.root, params.proofs[findSortedIndex(params, i)])
                            : await drop.claim(await params.wallets[i].getAddress(), i + 1, params.root, params.proofs[findSortedIndex(params, i)]),
                    ).to.emit(drop, 'Claimed').withArgs(walletAddress, `${i + 1}`);
                });

                it('should fail to claim second time', async function () {
                    const {
                        contracts: { drop },
                        other: { params },
                    } = await loadFixture(deployContractsFixture);

                    if (is128version) {
                        await drop.claim(params.salts![i], await params.wallets[i].getAddress(), i + 1, params.root, params.proofs[findSortedIndex(params, i)]);
                    } else {
                        await drop.claim(await params.wallets[i].getAddress(), i + 1, params.root, params.proofs[findSortedIndex(params, i)]);
                    }

                    await expect(
                        is128version
                            ? drop.claim(params.salts![i], await params.wallets[i].getAddress(), i + 1, params.root, params.proofs[findSortedIndex(params, i)])
                            : drop.claim(await params.wallets[i].getAddress(), i + 1, params.root, params.proofs[findSortedIndex(params, i)]),
                    ).to.be.revertedWithCustomError(drop, 'NothingToClaim');
                });
            });
        }
    });
}
