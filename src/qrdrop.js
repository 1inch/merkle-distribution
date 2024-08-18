#!/usr/bin/env node

const { ethers } = require('hardhat');
const path = require('path');
const { assert } = require('console');
const qrdrop = require('./gen_qr_lib.js');
const archive = require('./zip_lib.js');

const commander = require('commander');
const { exit } = require('process');
const program = new commander.Command();

// Example usage: node ./src/qrdrop.js -gqlczv 33 -a 5,10,20,30,40,50 -n 40,70,80,100,70,40
// Example usage: node ./src/qrdrop.js -gqlv 28 -a 10,20,30,40,50 -n 140,140,210,140,70
// Example usage: node ./src/qrdrop.js -x -u "https://app.1inch.io/#/1/qr?d=IgA..." -r "0x347b0605206ea9851b1172ad9c2a935f"
// Example usage: node ./src/qrdrop.js -c
// scripts
// "qr:create": "node ./src/qrdrop.js -gqlczv",
// "qr:deploy": "hardhat deploy:qr --network",
// "qr:check": "node ./src/qrdrop.js -x",
// scripts examples
// yarn qr:create 44 -a 5,10,20,30,40,50 -n 25,30,40,50,30,25 --chainId 8453
// yarn qr:deploy hardhat --v 35 --r 0xc8f9f70ceaa4d05d893e74c933eed42b --h 9
// yarn qr:check -u "https://app..." -r 0x347b0605206ea9851b1172ad9c2a935f

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
    .option('-c, --cleanup', 'cleanup qr directories before codes generation', false)
    .option('-z, --zip', 'zip qr-codes', false)
    // verification mode
    .option('-x, --validate', 'validation mode', false)
    .option('-u, --url <url>', 'qr url')
    .option('-r, --root <root>', 'merkle root')
    // cleanup mode
    .option('-w, --wipe', 'clean up qr directories', false)
    // general parameters generation and validation
    .option('-b, --chainid <chainid>', 'chain id', '1');

program.parse(process.argv);

const options = program.opts();
const VERSION = Number(options.version);
const flagGenerateCodes = options.gencodes;
const flagSaveQr = options.qrs;
const flagSaveLink = options.links;
const COUNTS = options.numbers === undefined ? [] : options.numbers.split(',').map(x => BigInt(x));
const AMOUNTS = options.amounts === undefined ? [] : options.amounts.split(',').map(x => BigInt(x));
const testCode = options.testcodes.split(',').map(x => BigInt(x));
const flagNoDeploy = options.nodeploy;
const flagCleanup = options.cleanup;
const flagZip = options.zip;
const flagValidateOnly = options.validate;
const validateUrl = options.url;
const validateRoot = options.root;
const flagWipe = options.wipe;
const chainId = Number(options.chainid);

validateArgs();
execute();

async function execute () {
    const settings = qrdrop.createNewDropSettings(flagGenerateCodes, flagSaveQr, flagSaveLink, COUNTS, AMOUNTS, VERSION, chainId, flagNoDeploy);
    if (settings.flagGenerateCodes) {
        if (!flagNoDeploy) {
            qrdrop.validateVersion(settings.version, settings.fileLatest);
        }

        if (flagCleanup) {
            archive.cleanDirs([settings.pathTestQr, settings.pathQr]);
        }

        COUNTS.unshift(testCode[0]);
        AMOUNTS.unshift(testCode[1]);
        AMOUNTS.forEach((element, index) => { AMOUNTS[index] = ethers.parseEther(element.toString()); });

        await qrdrop.generateCodes(settings);

        if (flagZip) {
            const dateString = new Date().toISOString().slice(0, 7);

            const productionQr = path.join(settings.pathZip, `${settings.version}-qr-drop-${dateString}.zip`);
            const testQr = path.join(settings.pathZip, `${settings.version}-qr-drop-test-${dateString}.zip`);

            archive.zipFolders([settings.pathQr, settings.pathTestQr], [productionQr, testQr]);
        }
    }

    if (flagValidateOnly) {
        assert(qrdrop.verifyLink(validateUrl, validateRoot, settings.prefix));
    }

    if (flagWipe || flagZip) {
        archive.cleanDirs([settings.pathTestQr, settings.pathQr]);
    }
}

function validateArgs () {
    // Validate input
    if (Number(flagGenerateCodes) + Number(flagValidateOnly) + Number(flagWipe) !== 1) {
        console.error('please specify mode, either "generate codes" or "validate code" or "cleanup": -g or -x or -c, respectively');
        exit(1);
    }

    // Validate generation mode arguments
    if (flagGenerateCodes) {
        // check version is an integer
        if (isNaN(VERSION)) {
            console.error('option \'-v, --version <version>\' is required to be an integer above zero');
            exit(1);
        }

        if (isNotIntegerAboveZero(chainId)) {
            console.error('option \'-b, --chainid <chainid>\' is required to be an integer above zero');
            exit(1);
        }

        // check counts and amounts have the same length
        if (COUNTS.length !== AMOUNTS.length) {
            console.error('counts and amounts should have the same length');
            exit(1);
        }

        // check there are elements in th array
        if (COUNTS.length === 0 || AMOUNTS.length === 0) {
            console.error('counts and amounts should contain at least one element');
            exit(1);
        }

        // check non-integer elements in the array
        if (COUNTS.some(isNotIntegerAboveZero) || AMOUNTS.some(isNotIntegerAboveZero)) {
            console.error('counts and amounts should contain only integers above zero');
            exit(1);
        }

        if (testCode.some(isNotIntegerAboveZero) || testCode.length !== 2) {
            console.error('test codes should contain exactly two integers above zero.\nan example for 10 test codes with ether(\'1\') amount: -t 10,1');
            exit(1);
        }
    }

    if (flagValidateOnly) {
        if (!validateUrl || !validateRoot) {
            console.error('please specify url and root for validation: -u and -r, respectively');
            exit(1);
        }
    }
}

function isNotIntegerAboveZero (value) {
    return !(value > 0);
}
