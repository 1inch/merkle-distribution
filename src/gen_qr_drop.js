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

// Generation options
const flagSaveQr = true         // true - generate QR-codes, false - don't
const flagSaveLink = true       // true - generate links list, false - don't

//10 - 1, 20 - 30, 30 - 40, 20 - 50
const AMOUNTS = [ether('1'), ether('20'), ether('30'), ether('40'), ether('50')];
const COUNTS = [10, 20, 30, 30, 20];

const VERSION = 22;

// Validation options
const flagValidateOnly = true  // true - validate link, false - generate qr/links
const validateUrl = '';// qr url
const validateRoot = '';// merkle root

// 1 - chainId for mainnet
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
    if (flagValidateOnly){
        console.log('proof: 0x' + Buffer.concat(proof).toString('hex'));
        console.log('root :' + root);
        console.log('leaf :' + node);
    }
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
    const vBuf = Buffer.from([VERSION]);
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
    const latestFile = './src/.latest';
    const latestVersion = fs.readFileSync(latestFile);
    const linksFile = './src/qr/links.json';
    // eslint-disable-next-line no-throw-literal
    if (Number(latestVersion) >= VERSION) throw 'WARNING! Latest version and current version doens\'t match';

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

    let urls = [];

    for (let i = 0; i < amounts.length; i++) {
        const url = genUrl(privs[i], amounts[i], drop.proofs[i]);
        urls.push(url);
        if (flagSaveQr){
            saveQr(indices[i], i < 10, url);
        }
        assert(uriDecode(url, drop.root));
    }

    if (flagSaveLink){
        fs.writeFileSync(linksFile, JSON.stringify(urls, null, 1));
    }

    fs.writeFileSync(latestFile, VERSION.toString());
}

if (!flagValidateOnly){
    main();
}
else{
    assert(uriDecode(validateUrl, validateRoot));    
}