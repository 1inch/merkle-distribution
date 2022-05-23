const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { toBN } = require('../test/helpers/utils');
const Wallet = require('ethereumjs-wallet').default;
const { promisify } = require('util');
const randomBytesAsync = promisify(require('crypto').randomBytes);
const { ether, BN } = require('@openzeppelin/test-helpers');
const qr = require('qr-image');
const fs = require('fs');
const { assert } = require('console');

function keccak128 (input) {
    return keccak256(input).slice(0, 16);
}

const AMOUNTS = [ether('1'), ether('5'), ether('15'), ether('25'), ether('50')];
const COUNTS = [10, 400, 300, 200, 100];

const PREFIX = 'https://app.1inch.io/#/1/qr?';

function makeDrop (wallets, amounts) {
    const elements = wallets.map((w, i) => w + toBN(amounts[i]).toString(16, 64));
    const leaves = elements.map(keccak128).map(x => MerkleTree.bufferToHex(x));
    const tree = new MerkleTree(leaves, keccak128, { sortPairs: true });
    const root = tree.getHexRoot();
    const proofs = leaves.map(tree.getProof, tree);
    return { elements, leaves, root, proofs };
}

async function genPriv () {
    return (await randomBytesAsync(16)).toString('hex').padStart(64, '0');
}

async function genPrivs (n) {
    return Promise.all(Array.from({ length: n }, genPriv));
}

function uriEncode (b) {
    return encodeURIComponent(b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '!'));
}

function saveQr (i, test, url) {
    // console.log(url);
    const code = qr.imageSync(url, { type: 'png' });
    if (test) {
        fs.writeFileSync(`src/test_qr/${i}.png`, code);
    } else {
        fs.writeFileSync(`src/qr/${i}.png`, code);
    }
}

function verifyProof (wallet, amount, proof, root) {
    const tree = new MerkleTree([], keccak128, { sortPairs: true });
    const element = wallet + toBN(amount).toString(16, 64);
    const node = MerkleTree.bufferToHex(keccak128(element));
    // console.log(proof);
    // console.log(node);
    return tree.verify(proof, node, root);
}

function uriDecode (s, root) {
    const b = Buffer.from(s.substring(PREFIX.length + 2).replace(/-/g, '+').replace(/_/g, '/').replace(/!/g, '='), 'base64');
    // const vBuf = b.slice(0, 1);
    // console.log(vBuf);
    const kBuf = b.slice(1, 17);
    const aBuf = b.slice(17, 29);
    let pBuf = b.slice(29);

    const proof = [];
    while (pBuf.length > 0) {
        proof.push(pBuf.slice(0, 16));
        pBuf = pBuf.slice(16);
    }

    const key = kBuf.toString('hex').padStart(64, '0');
    const wallet = Wallet.fromPrivateKey(Buffer.from(key, 'hex')).getAddressString();
    const amount = new BN(aBuf.toString('hex'), 16).toString();

    return verifyProof(wallet, amount, proof, root);
}

function genUrl (priv, amount, proof) {
    const vBuf = Buffer.from([7]);
    const kBuf = Buffer.from(priv.substring(32), 'hex');
    const aBuf = Buffer.from(toBN(amount).toString(16, 24), 'hex');
    const pBuf = Buffer.concat(proof.map(p => p.data));

    const baseArgs = uriEncode(Buffer.concat([vBuf, kBuf, aBuf, pBuf]));
    return PREFIX + 'd=' + baseArgs;
}

function shuffle (array) {
    let currentIndex = array.length; let randomIndex;

    // While there remain elements to shuffle...
    while (currentIndex !== 0) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}

async function main () {
    const privs = await genPrivs(COUNTS.reduce((s, a) => s + a, 0));
    const accounts = privs.map(p => Wallet.fromPrivateKey(Buffer.from(p, 'hex')).getAddressString());
    let amounts = [];
    for (let i = 0; i < COUNTS.length; i++) {
        amounts = amounts.concat(Array(COUNTS[i]).fill(AMOUNTS[i]));
    }
    console.log('total:', amounts.length);
    const drop = makeDrop(accounts, amounts);

    console.log(drop.root, amounts.reduce((acc, v) => acc.add(v), toBN('0')).toString());

    let indices = [];
    for (let i = 0; i < amounts.length; i++) {
        indices.push(i);
    }
    indices = shuffle(indices);

    for (let i = 0; i < amounts.length; i++) {
        const url = genUrl(privs[i], amounts[i], drop.proofs[i]);
        saveQr(indices[i], i < 10, url);
        console.log(i, indices[i]);
        assert(uriDecode(url, drop.root));
        // if (i % 200 == 0) {
        //     console.log(url, uriDecode(url, drop.root));
        // }
    }
}

main();
