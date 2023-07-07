const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const fs = require('fs');

function findSortedIndex (self, h) {
    return self.leaves.indexOf(h);
}

function makeDrop (wallets, amounts) {
    const elements = wallets.map((w, i) => w + BigInt(amounts[i]).toString(16).padStart(64, '0'));
    const hashedElements = elements.map(keccak256).map(x => MerkleTree.bufferToHex(x));
    const tree = new MerkleTree(elements, keccak256, { hashLeaves: true, sort: true });
    const root = tree.getHexRoot();
    const leaves = tree.getHexLeaves();
    const proofs = leaves.map(tree.getHexProof, tree);

    return { hashedElements, leaves, root, proofs };
}

const json = JSON.parse(fs.readFileSync('drop_data.json', { encoding: 'utf8' }));
if (typeof json !== 'object') throw new Error('Invalid JSON');

const drop = makeDrop(Object.keys(json), Object.values(json));

console.log(
    JSON.stringify({
        merkleRoot: drop.root,
        tokenTotal: '0x' + Object.values(json).map(BigInt).reduce((a, b) => a + b, 0n).toString(16),
        claims: Object.entries(json).map(([w, amount]) => ({
            wallet: w,
            amount: '0x' + BigInt(amount).toString(16),
            proof: drop.proofs[findSortedIndex(drop, MerkleTree.bufferToHex(keccak256(w + BigInt(amount).toString(16).padStart(64, '0'))))],
        })).reduce((a, { wallet, amount, proof }) => {
            a[wallet] = { amount, proof };
            return a;
        }, {}),
    }, null, 2),
);
