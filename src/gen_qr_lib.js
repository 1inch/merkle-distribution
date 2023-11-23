const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const Wallet = require('ethereumjs-wallet').default;
const { promisify } = require('util');
const randomBytesAsync = promisify(require('crypto').randomBytes);
const qr = require('qr-image');

const fs = require('fs');
const path = require('path');
const { assert } = require('console');

class DropSettings {
    fileLatest = './src/.latest';
    pathQr = './src/qr';
    pathTestQr = './src/test_qr';
    pathZip = './src/gendata';

    constructor (flagSaveQr, flagSaveLink, codeCounts, codeAmounts, version, chainId, flagNoVersionUpdate = false) {
        this.flagSaveQr = flagSaveQr;
        this.flagSaveLink = flagSaveLink;
        this.flagNoDeploy = flagNoVersionUpdate;
        this.codeCounts = codeCounts;
        this.codeAmounts = codeAmounts;
        this.version = version;
        this.chainId = chainId;
        this.fileLinks = `./src/gendata/${version}-qr-links.json`;
        this.prefix = `https://app.1inch.io/#/${chainId}/qr?`;
    }
}

function keccak128 (input) {
    return keccak256(input).slice(0, 16);
}

function makeDrop (wallets, amounts) {
    const elements = wallets.map((w, i) => w + BigInt(amounts[i]).toString(16).padStart(64, '0'));
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

function saveQr (i, url, dir) {
    // console.log(url);
    const code = qr.imageSync(url, { type: 'png' });
    const qrfile = path.join(dir, `${i}.png`);
    fs.writeFileSync(qrfile, code);
}

function verifyProof (wallet, amount, proof, root, displayResults) {
    const tree = new MerkleTree([], keccak128, { sortPairs: true });
    const element = wallet + BigInt(amount).toString(16).padStart(64, '0');
    const node = MerkleTree.bufferToHex(keccak128(element));
    if (displayResults) {
        console.log('root : ' + root);
        console.log('proof: 0x' + Buffer.concat(proof).toString('hex'));
        console.log('leaf : ' + node);
    }
    return tree.verify(proof, node, root);
}

function uriDecode (s, root, PREFIX, displayResults) {
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
    const amount = BigInt('0x' + aBuf.toString('hex'));

    return verifyProof(wallet, amount, proof, root, displayResults);
}

function genUrl (priv, amount, proof, version, prefix) {
    const vBuf = Buffer.from([version]);
    const kBuf = Buffer.from(priv.substring(32), 'hex');
    const aBuf = Buffer.from(amount.toString(16).padStart(24, '0'), 'hex');
    const pBuf = Buffer.concat(proof.map(p => p.data));

    const baseArgs = uriEncode(Buffer.concat([vBuf, kBuf, aBuf, pBuf]));
    return prefix + 'd=' + baseArgs;
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

async function main (settings) {
    // console.log('dropSettings', settings);
    const COUNTS = settings.codeCounts;
    const AMOUNTS = settings.codeAmounts;

    const privs = await genPrivs(Number(COUNTS.reduce((s, a) => s + a, 0n)));
    const accounts = privs.map(p => Wallet.fromPrivateKey(Buffer.from(p, 'hex')).getAddressString());
    let amounts = [];
    for (let i = 0; i < COUNTS.length; i++) {
        amounts = amounts.concat(Array(Number(COUNTS[i])).fill(AMOUNTS[i]));
    }
    console.log('total:', amounts.length);
    const drop = makeDrop(accounts, amounts);

    console.log(`root: ${drop.root}`, amounts.reduce((acc, v) => acc + v, 0n).toString());

    let indices = [];
    for (let i = 0; i < amounts.length; i++) {
        indices.push(i);
    }
    indices = shuffle(indices);

    const urls = [];

    for (let i = 0; i < amounts.length; i++) {
        const url = genUrl(privs[i], amounts[i], drop.proofs[i], settings.version, settings.prefix);
        urls.push(url);
        if (settings.flagSaveQr) {
            saveQr(indices[i], url, i < 10 ? settings.pathTestQr : settings.pathQr);
        }
        assert(uriDecode(url, drop.root, settings.prefix, false));
    }

    if (settings.flagSaveLink) {
        fs.writeFileSync(settings.fileLinks, JSON.stringify(urls, null, 1));
    }

    if (!settings.flagNoDeploy) {
        fs.writeFileSync(settings.fileLatest, settings.version.toString());
    }
}

function verifyLink (url, root, prefix) {
    return uriDecode(url, root, prefix, true);
}

function createNewDropSettings (flagSaveQr, flagSaveLink, codeCounts, codeAmounts, version, flagNoDeploy, chainId) {
    const settings = new DropSettings(flagSaveQr, flagSaveLink, codeCounts, codeAmounts, version, flagNoDeploy, chainId);
    return settings;
}

module.exports = {
    generateCodes: main,
    verifyLink,
    createNewDropSettings,
};
