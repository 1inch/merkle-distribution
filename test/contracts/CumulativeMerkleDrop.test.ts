import '@nomicfoundation/hardhat-chai-matchers';
const hre = require('hardhat');
const { ethers } = hre;
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployContract, expect } from '@1inch/solidity-utils';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import { Contract, Signer } from 'ethers';

// import { gasspectEVM } from '@1inch/solidity-utils';

import {
    shouldBehaveLikeMerkleDropFor4WalletsWithBalances1234,
} from './behaviors/MerkleDrop.behavior';

import {
    shouldBehaveLikeCumulativeMerkleDropFor4WalletsWithBalances1234,
} from './behaviors/CumulativeMerkleDrop.behavior';

interface MerkleDropData {
    hashedElements: string[];
    leaves: string[];
    root: string;
    proofs: string[][];
}

interface Contracts {
    token: Contract;
    drop: Contract;
}

async function makeDrop(
    token: Contract,
    drop: Contract,
    walletsAddresses: string[],
    amounts: bigint[],
    deposit: bigint
): Promise<MerkleDropData> {
    const elements = walletsAddresses.map((w, i) => w + amounts[i].toString(16).padStart(64, '0'));
    const hashedElements = elements.map(keccak256).map(x => MerkleTree.bufferToHex(x));
    const tree = new MerkleTree(elements, keccak256, { hashLeaves: true, sort: true });
    const root = tree.getHexRoot();
    const leaves = tree.getHexLeaves();
    const proofs = leaves.map(tree.getHexProof, tree);

    await drop.setMerkleRoot(root);
    await token.mint(drop, deposit);

    return { hashedElements, leaves, root, proofs };
}

describe('CumulativeMerkleDrop', function () {
    function findSortedIndex(self: MerkleDropData, i: number): number {
        return self.leaves.indexOf(self.hashedElements[i]);
    }

    async function initContracts(): Promise<Contracts> {
        const token = await deployContract('TokenMock', ['1INCH Token', '1INCH']) as unknown as Contract;
        const drop = await deployContract('CumulativeMerkleDrop', [await token.getAddress()]) as unknown as Contract;
        return { token, drop };
    }

    async function deployContractsFixture() {
        const [owner, alice, bob, carol, dan] = await ethers.getSigners();

        const { token, drop } = await initContracts();
        await Promise.all([alice, bob, carol, dan].map(w => token.mint(w, 1n)));

        return {
            accounts: { owner, alice, bob, carol, dan },
            contracts: { token, drop },
        };
    }

    it.skip('Benchmark 30000 wallets (merkle tree height 15)', async function () { // if you want to run this test, add verify & verifyAsm to CumulativeMerkleDrop.sol
        const { accounts: { alice }, contracts: { token, drop } } = await loadFixture(deployContractsFixture);
        const accounts = Array(30000).fill(null).map((_, i) => '0x' + (BigInt(alice.address) + BigInt(i)).toString(16));
        const amounts = Array(30000).fill(null).map((_, i) => BigInt(i + 1));

        const params = await makeDrop(token, drop, accounts, amounts, 1000000n);

        if (drop.interface.getFunction('verify')) {
            await drop['verify'](params.proofs[findSortedIndex(params, 0)], params.root, params.leaves[0]);
            expect(await drop['verify'](params.proofs[findSortedIndex(params, 0)], params.root, params.leaves[0])).to.be.true;
        }
        await drop['verifyAsm'](params.proofs[findSortedIndex(params, 0)], params.root, params.leaves[0]);
        expect(await drop['verifyAsm'](params.proofs[findSortedIndex(params, 0)], params.root, params.leaves[0])).to.be.true;
        const tx = await drop.claim(accounts[0], 1, params.root, params.proofs[findSortedIndex(params, 0)]);
        await expect(tx).to.changeTokenBalances(token, [accounts[0], drop], [1, -1]);
    });

    describe('behave like merkle drop', function () {
        async function makeDropForSomeAccounts(
            token: Contract,
            drop: Contract,
            allWallets: Signer[],
            params: { amounts: bigint[]; deposit: bigint }
        ) {
            const wallets = allWallets.slice(1, params.amounts.length + 1); // drop first wallet
            const walletAddresses = await Promise.all(wallets.map(w => w.getAddress()));
            return {
                ...(await makeDrop(token, drop, walletAddresses, params.amounts, params.deposit)),
                wallets,
            };
        }

        describe('Single drop for 4 wallets: [1, 2, 3, 4]', function () {
            shouldBehaveLikeMerkleDropFor4WalletsWithBalances1234({
                walletsCount: 4,
                initContracts,
                functions: { makeDrop: makeDropForSomeAccounts, findSortedIndex },
                makeDropParams: {
                    amounts: [1n, 2n, 3n, 4n],
                    deposit: 10n,
                },
            });
        });

        describe('Double drop for 4 wallets: [1, 2, 3, 4] + [2, 3, 4, 5] = [3, 5, 7, 9]', async function () {
            shouldBehaveLikeCumulativeMerkleDropFor4WalletsWithBalances1234({
                initContracts,
                functions: {
                    makeFirstDrop: makeDropForSomeAccounts,
                    makeSecondDrop: makeDropForSomeAccounts,
                    findSortedIndex,
                },
                makeFirstDropParams: {
                    amounts: [1n, 2n, 3n, 4n],
                    deposit: 1n + 2n + 3n + 4n,
                },
                makeSecondDropParams: {
                    amounts: [3n, 5n, 7n, 9n],
                    deposit: 2n + 3n + 4n + 5n,
                },
            });
        });
    });
});
