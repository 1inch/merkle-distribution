const { expect } = require('chai');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { personalSign } = require('@metamask/eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;

function keccak128 (input) {
    return keccak256(input).slice(0, 16);
}

describe('SignatureMerkleDrop128', function () {
    let addr1, w1, w2, w3, w4;

    before(async function () {
        [addr1, w1, w2, w3, w4] = await ethers.getSigners();
    });

    async function initContracts () {
        const TokenMockFactory = await ethers.getContractFactory('TokenMock');
        const token = await TokenMockFactory.deploy('1INCH Token', '1INCH');

        await Promise.all([w1, w2, w3, w4].map(w => token.mint(w, 1)));

        const accountWithDropValues = [
            {
                account: addr1,
                amount: 1,
            },
            {
                account: w1,
                amount: 1,
            },
            {
                account: w2,
                amount: 1,
            },
            {
                account: w3,
                amount: 1,
            },
            {
                account: w4,
                amount: 1,
            },
        ];

        const elements = accountWithDropValues.map((w) => '0x' + w.account.address.substr(2) + BigInt(w.amount).toString(16).padStart(64, '0'));
        const hashedElements = elements.map(keccak128).map(x => MerkleTree.bufferToHex(x));
        const tree = new MerkleTree(elements, keccak128, { hashLeaves: true, sort: true });
        const root = tree.getHexRoot();
        const leaves = tree.getHexLeaves();
        const proofs = leaves
            .map(tree.getHexProof, tree)
            .map(proof => '0x' + proof.map(p => p.substr(2)).join(''));

        const SignatureMerkleDrop128Factory = await ethers.getContractFactory('SignatureMerkleDrop128');
        const drop = await SignatureMerkleDrop128Factory.deploy(await token.getAddress(), root, tree.getDepth());
        await token.mint(await drop.getAddress(), accountWithDropValues.map(w => w.amount).reduce((a, b) => a + b, 0));

        const account = Wallet.fromPrivateKey(Buffer.from('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', 'hex'));
        const data = MerkleTree.bufferToHex(keccak256(w1.address));
        const signature = personalSign({ privateKey: account.getPrivateKey(), data });

        return { hashedElements, leaves, proofs, drop, signature };
    }

    it('Should enumerate items properly', async function () {
        const { hashedElements, leaves, proofs, drop } = await initContracts();
        for (let i = 0; i < proofs.length; i++) {
            const index = leaves.indexOf(hashedElements[i]);
            const result = await drop.verify(proofs[index], leaves[index]);
            expect(result.valid).to.be.true;
            expect(result.index).to.be.equal(BigInt(index));
        }
    });

    it('Should transfer money to another wallet', async function () {
        const { hashedElements, leaves, proofs, drop, signature } = await initContracts();
        await drop.claim(w1, 1, proofs[leaves.indexOf(hashedElements[0])], signature);
    });

    it('Should disallow invalid proof', async function () {
        const { drop, signature } = await initContracts();
        await expect(
            drop.claim(w1, 1, '0x', signature),
        ).to.be.revertedWith('MD: Invalid proof');
    });

    it('Should disallow invalid receiver', async function () {
        const { hashedElements, leaves, proofs, drop, signature } = await initContracts();
        await expect(
            drop.claim(w2, 1, proofs[leaves.indexOf(hashedElements[0])], signature),
        ).to.be.revertedWith('MD: Invalid proof');
    });

    it('Should disallow double claim', async function () {
        const { hashedElements, leaves, proofs, drop, signature } = await initContracts();
        const fn = () => drop.claim(w1, 1, proofs[leaves.indexOf(hashedElements[0])], signature);
        await fn();
        await expect(fn()).to.be.revertedWith('MD: Drop already claimed');
    });
});
