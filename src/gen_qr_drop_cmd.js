#!/usr/bin/env node

const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { toBN } = require('../test/helpers/utils');
const Wallet = require('ethereumjs-wallet').default;
const { promisify } = require('util');
const randomBytesAsync = promisify(require('crypto').randomBytes);
const { ether, BN } = require('@openzeppelin/test-helpers');
const qr = require('qr-image');
const fs = require('fs');
const path = require('path');
const { assert } = require('console');

const commander = require('commander');
const { exit } = require('process');
const program = new commander.Command();

// Example usage: node ./src/gen_qr_drop_cmd.js -gqlv 28 -a 10,20,30,40,50 -n 140,140,210,140,70
// Example usage: node ./src/gen_qr_drop_cmd.js -x -u "https://app.1inch.io/#/1/qr?d=IgA..." -r "0x347b0605206ea9851b1172ad9c2a935f"
// Example usage: node ./src/gen_qr_drop_cmd.js -c
program
    // generation mode
    .option('-v, --version <version>', 'deployment instance version', false)
    .option('-g, --gencodes', 'generate codes mode', false)
    .option('-q, --qrs', 'generate qr: ', false)
    .option('-l, --links', 'generate links: ', false)
    .option('-n, --numbers <numbers>', 'codes to generate')
    .option('-a, --amounts <amounts>', 'amounts to generate')
    .option('-t, --testcodes <codes>', 'test codes', '10,1')
    .option('-s, --nodeploy', 'test run, ignores version', false)
    // verification mode
    .option('-x, --validate', 'validation mode', false)
    .option('-u, --url <url>', 'qr url')
    .option('-r, --root <root>', 'merkle root')
    // cleanup mode
    .option('-c, --cleanup', 'clean up qr directories', false)
    // general parameters generation and validation
    .option('-b, --chainid <chainid>', 'chain id', '1');

program.parse(process.argv);

const options = program.opts();
const VERSION = Number(options.version);
const flagGenerateCodes = options.gencodes;
const flagSaveQr = options.qrs;
const flagSaveLink = options.links;
const COUNTS = options.numbers === undefined ? [] : options.numbers.split(',').map(x => Number(x));
const AMOUNTS = options.amounts === undefined ? [] : options.amounts.split(',').map(x => Number(x));
const testCode = options.testcodes.split(',').map(x => Number(x));
const flagNoDeploy = options.nodeploy;
const flagValidateOnly = options.validate;
const validateUrl = options.url;
const validateRoot = options.root;
const flagCleanup = options.cleanup;
const chainId = Number(options.chainid);

validateArgs();

// 1 - chainId for mainnet
const PREFIX = `https://app.1inch.io/#/${chainId}/qr?`;
const latestFile = './src/.latest';
const linksFile = './src/gendata/' + VERSION.toString() + '-qr-links.json';

if (flagGenerateCodes) {
    COUNTS.unshift(testCode[0]);
    AMOUNTS.unshift(testCode[1]);
    AMOUNTS.forEach((element, index) => { AMOUNTS[index] = ether(element.toString()); });

    main();
}

if (flagValidateOnly) {
   assert(uriDecode(validateUrl, validateRoot));
}

if (flagCleanup) {
    cleanDir('./src/qr');
    cleanDir('./src/test_qr');
}

function validateArgs(){
    //Validate input
    if (Number(flagGenerateCodes) + Number(flagValidateOnly) + Number(flagCleanup) != 1) {
        console.error('please specify mode, either "generate codes" or "validate code" or "cleanup": -g or -x or -c, respectively');
        exit(1);
    }

    // Validate generation mode arguments
    if (flagGenerateCodes){
        // check version is an integer
        if (isNaN(VERSION)){
            console.error("option '-v, --version <version>' is required to be an integer above zero");
            exit(1);
        }

        if (isNotIntegerAboveZero(chainId)){
            console.error("option '-b, --chainid <chainid>' is required to be an integer above zero");
            exit(1);
        }

        // check counts and amounts have the same length
        if (COUNTS.length != AMOUNTS.length){
            console.error('counts and amounts should have the same length');
            exit(1);
        }

        //check there are elements in th array 
        if (COUNTS.length == 0 || AMOUNTS.length == 0){
            console.error('counts and amounts should contain at least one element');
            exit(1);
        }

        //check non-integer elements in the array
        if (COUNTS.some(isNotIntegerAboveZero) || AMOUNTS.some(isNotIntegerAboveZero)){
            console.error('counts and amounts should contain only integers above zero');
            exit(1);
        }

        if (testCode.some(isNotIntegerAboveZero) || testCode.length != 2){
            console.error("test codes should contain exactly two integers above zero.\nan example for 10 test codes with ether('1') amount: -t 10,1");
            exit(1);
        }
    }

    if (flagValidateOnly){
        if (validateUrl == '' || validateRoot == ''){
            console.error('please specify url and root for validation: -u and -r, respectively');
            exit(1);
        }
    }
}

function isNotIntegerAboveZero(value){
    return !(Number.isInteger(value) && value > 0);
}

function getLatestVersion(){
    if (!fs.existsSync(latestFile)){
        return 0;
    }

    const latestVersion = Number(fs.readFileSync(latestFile));
    if (isNaN(latestVersion) || latestVersion < 0){
        console.log('WARNING! version file is corrupted');
        exit(1);
    }

    return latestVersion;
}

function keccak128 (input) {
    return keccak256(input).slice(0, 16);
}

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

function cleanDir (directoryPath) {
    // Check if the directory exists and it's a directory.
    if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
        throw new Error(`Not a valid directory: ${directoryPath}`);
    }

    const files = fs.readdirSync(directoryPath);
    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        fs.unlinkSync(filePath);
    }

    console.log(`Directory cleaned ${directoryPath}`);
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
    if (flagValidateOnly) {
        console.log('root : ' + root);
        console.log('proof: 0x' + Buffer.concat(proof).toString('hex'));
        console.log('leaf : ' + node);
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
    const latestVersion = getLatestVersion();
    cleanDir('./src/qr');
    cleanDir('./src/test_qr');

    // eslint-disable-next-line no-throw-literal
    if (Number(latestVersion) >= VERSION && !flagNoDeploy) throw `WARNING! New version (${VERSION}) should be more than latest version (${latestVersion})`;

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

    const urls = [];

    for (let i = 0; i < amounts.length; i++) {
        const url = genUrl(privs[i], amounts[i], drop.proofs[i]);
        urls.push(url);
        if (flagSaveQr) {
            saveQr(indices[i], i < 10, url);
        }
        assert(uriDecode(url, drop.root));
    }

    if (flagSaveLink) {
        fs.writeFileSync(linksFile, JSON.stringify(urls, null, 1));
    }

    fs.writeFileSync(latestFile, VERSION.toString());
}