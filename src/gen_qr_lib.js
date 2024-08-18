const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const Wallet = require('ethereumjs-wallet').default;
const { promisify } = require('util');
const randomBytesAsync = promisify(require('crypto').randomBytes);
const qr = require('qr-image');

const fs = require('fs');
const path = require('path');
const { assert } = require('console');
const { exit } = require('process');

class AbstractDropSettings {
    constructor (flagGenerateCodes, flagSaveQr, flagSaveLink, codeCounts, codeAmounts, version, chainId = 1, flagNoVersionUpdate = false) {
        if (new.target === AbstractDropSettings) {
            throw new Error('Cannot instantiate an abstract class.');
        }

        this.flagGenerateCodes = flagGenerateCodes;
        this.flagSaveQr = flagSaveQr;
        this.flagSaveLink = flagSaveLink;
        this.flagNoDeploy = flagNoVersionUpdate;
        this.codeCounts = codeCounts;
        this.codeAmounts = codeAmounts;
        this.chainId = chainId;

        // Class-specific
        this.fileLatest = this.constructor.fileLatest;
        this.root = this.constructor.root;
        this.pathQr = this.constructor.pathQr;
        this.pathTestQr = this.constructor.pathTestQr;
        this.pathZip = this.constructor.pathZip;

        // Instance-specific
        this.fileLinks = `${this.constructor.pathZip}/${version}-qr-links.json`;
        this.prefix = `https://app.1inch.io/#/${chainId}/qr?`;

        if (version == null) {
            version = getLatestVersion(this.fileLatest) + 1;
            console.log(`Auto-incremented version ${version} chosen for the new generation`);
        }
        this.version = version;
    }

    // Static getter for the root path (should be overridden by subclasses)
    static get root () {
        throw new Error('Subclasses must define a root path.');
    }

    // Static getter for fileLatest
    static get fileLatest () {
        return `${this.root}/.latest`;
    }
    // Instance getter for fileLatest

    // Static getter for pathQr
    static get pathQr () {
        return `${this.root}/qr`;
    }

    // Static getter for pathTestQr
    static get pathTestQr () {
        return `${this.root}/test_qr`;
    }

    // Static getter for pathZip
    static get pathZip () {
        return `${this.root}/gendata`;
    }
}

class DropSettings extends AbstractDropSettings {
    static get root () {
        return './src';
    }
}

function keccak128 (input) {
    return keccak256(input).slice(0, 16);
}

function ensureDirectoryExistence (dir) {
    // Ensure the directory exists, create it recursively if not
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function saveFile (filePath, fileContent) {
    const dir = path.dirname(filePath);
    ensureDirectoryExistence(dir);
    fs.writeFileSync(filePath, fileContent);
}

function makeDrop (wallets, amounts) {
    // Create an array of elements by concatenating each wallet address with the corresponding amount
    // in hexadecimal format, padded to 64 characters.
    const elements = wallets.map((w, i) => w + BigInt(amounts[i]).toString(16).padStart(64, '0'));

    // Generate a Merkle Tree leaf by hashing each element with keccak128 and converting it to a hexadecimal string.
    const leaves = elements.map(keccak128).map(x => MerkleTree.bufferToHex(x));

    // Create a Merkle Tree from the leaves using keccak128 as the hashing function and sort the pairs for consistency.
    const tree = new MerkleTree(leaves, keccak128, { sortPairs: true });

    // Obtain the Merkle root, which is the top node of the tree.
    const root = tree.getHexRoot();

    // Generate a proof for each leaf in the Merkle Tree. A proof is used to verify that a leaf is part of the tree.
    const proofs = leaves.map(tree.getProof, tree);

    // Return an object containing the elements, leaves, Merkle root, and proofs.
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
    saveFile(qrfile, code);
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

    const totalCodes = Number(COUNTS.reduce((s, a) => s + a, 0n));
    const privs = await genPrivs(totalCodes);
    const accounts = privs.map(p => Wallet.fromPrivateKey(Buffer.from(p, 'hex')).getAddressString());
    let amounts = [];
    for (let i = 0; i < COUNTS.length; i++) {
        amounts = amounts.concat(Array(Number(COUNTS[i])).fill(AMOUNTS[i]));
    }
    console.log('total:', amounts.length);
    const drop = makeDrop(accounts, amounts);
    const totalAmount = amounts.reduce((acc, v) => acc + v, 0n);
    console.log(`root: ${drop.root} ${totalAmount}`);

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
        const info = [];
        for (let i = 0; i < amounts.length; i++) {
            info.push({
                url: urls[i],
                amount: amounts[i].toString(),
                index: indices[i],
            });
        }

        const fileContent = {
            count: amounts.length,
            root: drop.root,
            amount: totalAmount.toString(),
            version: settings.version,
            codes: info,
        };

        saveFile(settings.fileLinks, JSON.stringify(fileContent, null, 1));
    }

    if (!settings.flagNoDeploy) {
        saveFile(settings.fileLatest, settings.version.toString());
    }
}

function verifyLink (url, root, prefix) {
    return uriDecode(url, root, prefix, true);
}

function createNewDropSettings (flagGenerateCodes, flagSaveQr, flagSaveLink, codeCounts, codeAmounts, version, chainId, flagNoDeploy) {
    return new DropSettings(flagGenerateCodes, flagSaveQr, flagSaveLink, codeCounts, codeAmounts, version, chainId, flagNoDeploy);
}

function validateVersion (version, latestFile) {
    const latestVersion = getLatestVersion(latestFile);
    if (version <= latestVersion) {
        console.error('version should be greater than ' + latestVersion.toString());
        exit(1);
    }
}

function getLatestVersion (latestFile) {
    if (!fs.existsSync(latestFile)) {
        saveFile(latestFile, '0');
        return 0;
    }

    const latestVersion = Number(fs.readFileSync(latestFile));
    if (isNaN(latestVersion) || latestVersion < 0) {
        console.log('WARNING! version file is corrupted');
        exit(1);
    }

    return latestVersion;
}

module.exports = {
    generateCodes: main,
    verifyLink,
    createNewDropSettings,
    AbstractDropSettings,
    DropSettings,
    keccak128,
    uriEncode,
    saveFile,
    saveQr,
    ensureDirectoryExistence,
    validateVersion,
    getLatestVersion,
};
