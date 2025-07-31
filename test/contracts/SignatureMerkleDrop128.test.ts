import '@nomicfoundation/hardhat-chai-matchers';
const hre = require('hardhat');
const { ethers } = hre;
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { deployContract, expect } from '@1inch/solidity-utils';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import { personalSign } from '@metamask/eth-sig-util';
import Wallet from 'ethereumjs-wallet';
import { Contract, Signer } from 'ethers';

function keccak128(input: Buffer | string): Buffer {
    return keccak256(input).slice(0, 16);
}

interface AccountWithDropValue {
    account: Signer;
    amount: number;
}

describe('SignatureMerkleDrop128', function () {
    async function deployContractsFixture() {
        const [owner, alice, bob, carol, dan] = await ethers.getSigners();
        const token = await deployContract('TokenMock', ['1INCH Token', '1INCH']) as unknown as Contract;

        await Promise.all([alice, bob, carol, dan].map(w => token.mint(w, 1n)));

        const accountWithDropValues: AccountWithDropValue[] = [
            {
                account: owner,
                amount: 1,
            },
            {
                account: alice,
                amount: 1,
            },
            {
                account: bob,
                amount: 1,
            },
            {
                account: carol,
                amount: 1,
            },
            {
                account: dan,
                amount: 1,
            },
        ];

        const elements = await Promise.all(accountWithDropValues.map(async (w) => {
            const address = await w.account.getAddress();
            return '0x' + address.slice(2) + BigInt(w.amount).toString(16).padStart(64, '0');
        }));
        const hashedElements = elements.map((elem) => MerkleTree.bufferToHex(keccak128(elem)));
        const tree = new MerkleTree(elements, keccak128, { hashLeaves: true, sort: true });
        const root = tree.getHexRoot();
        const leaves = tree.getHexLeaves();
        const proofs = leaves
            .map(tree.getHexProof, tree)
            .map(proof => '0x' + proof.map(p => p.slice(2)).join(''));

        const SignatureMerkleDrop128Factory = await ethers.getContractFactory('SignatureMerkleDrop128');
        const drop = await SignatureMerkleDrop128Factory.deploy(await token.getAddress(), root, tree.getDepth());
        await token.mint(await drop.getAddress(), accountWithDropValues.map(w => w.amount).reduce((a, b) => a + b, 0));

        const account = Wallet.fromPrivateKey(Buffer.from('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', 'hex'));
        const data = MerkleTree.bufferToHex(keccak256(await alice.getAddress()));
        const signature = personalSign({ privateKey: account.getPrivateKey(), data });

        return {
            accounts: { owner, alice, bob, carol, dan },
            contracts: { token, drop },
            others: { hashedElements, leaves, proofs, signature },
        };
    }

    it('Should enumerate items properly', async function () {
        const { contracts: { drop }, others: { hashedElements, leaves, proofs } } = await loadFixture(deployContractsFixture);
        for (let i = 0; i < proofs.length; i++) {
            const index = leaves.indexOf(hashedElements[i]);
            const result = await drop.verify(proofs[index], leaves[index]);
            expect(result.valid).to.be.true;
            expect(result.index).to.be.equal(BigInt(index));
        }
    });

    it('Should transfer money to another wallet', async function () {
        const { accounts: { alice }, contracts: { drop }, others: { hashedElements, leaves, proofs, signature } } = await loadFixture(deployContractsFixture);
        await drop.claim(alice, 1, proofs[leaves.indexOf(hashedElements[0])], signature);
    });

    it('Should transfer money to another wallet with extra value', async function () {
        const { accounts: { alice }, contracts: { drop }, others: { hashedElements, leaves, proofs, signature } } = await loadFixture(deployContractsFixture);
        const txn = await drop.claim(alice, 1, proofs[leaves.indexOf(hashedElements[0])], signature, { value: 10 });
        expect(txn).to.changeEtherBalance(alice, 10);
    });

    it('Should disallow invalid proof', async function () {
        const { accounts: { alice }, contracts: { drop }, others: { signature } } = await loadFixture(deployContractsFixture);
        await expect(
            drop.claim(alice, 1, '0x', signature),
        ).to.be.revertedWithCustomError(drop, 'InvalidProof');
    });

    it('Should disallow invalid receiver', async function () {
        const { accounts: { bob }, contracts: { drop }, others: { hashedElements, leaves, proofs, signature } } = await loadFixture(deployContractsFixture);
        await expect(
            drop.claim(bob, 1, proofs[leaves.indexOf(hashedElements[0])], signature),
        ).to.be.revertedWithCustomError(drop, 'InvalidProof');
    });

    it('Should disallow double claim', async function () {
        const { accounts: { alice }, contracts: { drop }, others: { hashedElements, leaves, proofs, signature } } = await loadFixture(deployContractsFixture);
        const fn = () => drop.claim(alice, 1, proofs[leaves.indexOf(hashedElements[0])], signature);
        await fn();
        await expect(fn()).to.be.revertedWithCustomError(drop, 'DropAlreadyClaimed');
    });
});
