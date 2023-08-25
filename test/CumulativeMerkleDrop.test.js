const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployContract, expect } = require('@1inch/solidity-utils');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

// const { gasspectEVM } = require('./helpers/profileEVM');

const {
    shouldBehaveLikeMerkleDropFor4WalletsWithBalances1234,
} = require('./behaviors/MerkleDrop.behavior');

const {
    shouldBehaveLikeCumulativeMerkleDropFor4WalletsWithBalances1234,
} = require('./behaviors/CumulativeMerkleDrop.behavior');

async function makeDrop (token, drop, walletsAddresses, amounts, deposit) {
    const elements = walletsAddresses.map((w, i) => w + BigInt(amounts[i]).toString(16).padStart(64, '0'));
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
    function findSortedIndex (self, i) {
        return self.leaves.indexOf(self.hashedElements[i]);
    }

    async function initContracts () {
        const token = await deployContract('TokenMock', ['1INCH Token', '1INCH']);
        const drop = await deployContract('CumulativeMerkleDrop', [token]);
        return { token, drop };
    };

    async function deployContractsFixture () {
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
        const accounts = Array(30000).fill().map((_, i) => '0x' + (BigInt(alice.address) + BigInt(i)).toString(16));
        const amounts = Array(30000).fill().map((_, i) => i + 1);

        const params = await makeDrop(token, drop, accounts, amounts, 1000000n);

        if (drop.interface.getFunction('verify')) {
            await drop.contract.methods.verify(params.proofs[findSortedIndex(params, 0)], params.root, params.leaves[0]).send();
            expect(await drop.verify(params.proofs[findSortedIndex(params, 0)], params.root, params.leaves[0])).to.be.true;
        }
        await drop.contract.methods.verifyAsm(params.proofs[findSortedIndex(params, 0)], params.root, params.leaves[0]).send();
        expect(await drop.verifyAsm(params.proofs[findSortedIndex(params, 0)], params.root, params.leaves[0])).to.be.true;
        const tx = await drop.claim(accounts[0], 1, params.root, params.proofs[findSortedIndex(params, 0)]);
        await expect(tx).to.changeTokenBalances(token, [accounts[0], drop], [1, -1]);
    });

    describe('behave like merkle drop', function () {
        async function makeDropForSomeAccounts (token, drop, allWallets, params) {
            const wallets = allWallets.slice(1, params.amounts.length + 1); // drop first wallet
            return {
                ...(await makeDrop(token, drop, wallets.map((w) => w.address), params.amounts, params.deposit)),
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
