/*
 generate merkle tree, to pass to INFTMerkleDrop.sol as well as urls and qr codes
 uses qrdrop.js as a base but receive another input format vlow and generates output under /nft_drop subdir
  input:
    {
        nft_id -> account
    }

Example:
    /usr/local/bin/node ./src/nft_drop/nft_drop.js -gqlzm 0=0x742d35Cc6634C0532925a3b844Bc454e4438f44e,1=0x53d284357ec70ce289d6d64134dfac8e511c8a3d
Output:
    root: 0x877f9206c3851f0b52f6db59bf278d09 leaves num: 2
    Created src/nft_drop/gendata/1-nft-drop-2024-08.zip
    Created src/nft_drop/gendata/1-nft-drop-test-2024-08.zip

*/

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const archive = require('./../zip_lib.js');
const { createNewNFTDropSettings, generateNFTCodes, NFTDropSettings} = require('./gen_nft_lib');
const { ensureDirectoryExistence, getLatestVersion, validateVersion } = require('./../gen_qr_lib');

program
    // generation mode
    .option('-v, --version', 'deployment instance version', false)
    .option('-g, --gencodes', 'generate NFT drop codes mode', false)
    .option('-q, --qrs', 'generate qr: ', false)
    .option('-l, --links', 'generate links: ', false)
    .option('-m, --mapping <mapping>', 'NFT ID to account mapping (JSON format or as key=value pairs separated by commas)')
    .option('-s, --nodeploy', 'test run, ignores version', false)
    .option('-c, --cleanup', 'cleanup directories before codes generation', false)
    .option('-z, --zip', 'zip generated codes', false)
    .option('-b, --chainid <chainid>', 'chain id', '1');

program.parse(process.argv);

const options = program.opts();
let _v = Number(options.version);
if (!isValidVersion(_v)) {
    _v = getLatestVersion(NFTDropSettings.fileLatest) + 1;
}
const VERSION = _v;

const flagGenerateCodes = options.gencodes;
const flagSaveQr = options.qrs;
const flagSaveLink = options.links;
const nftMapping = parseMapping(options.mapping);
const flagNoDeploy = options.nodeploy;
const flagCleanup = options.cleanup;
const flagZip = options.zip;
const chainId = Number(options.chainid);

validateArgs();
execute();

async function execute() {
    if (flagGenerateCodes) {
        const settings = createNewNFTDropSettings(flagSaveQr, flagSaveLink, nftMapping, VERSION, chainId, flagNoDeploy);

        if (!flagNoDeploy) {
            validateVersion(settings.version, settings.fileLatest);
        }

        if (flagCleanup) {
            archive.cleanDirs([settings.pathTestQr, settings.pathQr]);
        }

        await generateNFTCodes(settings);

        if (flagZip) {
            const dateString = new Date().toISOString().slice(0, 7);

            const productionQr = path.join(settings.pathZip, `${settings.version}-nft-drop-${dateString}.zip`);
            const testQr = path.join(settings.pathZip, `${settings.version}-nft-drop-test-${dateString}.zip`);

            ensureDirectoryExistence(settings.pathTestQr);

            archive.zipFolders([settings.pathQr, settings.pathTestQr], [productionQr, testQr]);
        }
    }
}

function parseMapping(mapping) {
    try {
        return JSON.parse(mapping);
    } catch {
        const map = {};
        mapping.split(',').forEach(pair => {
            const [key, value] = pair.split('=');
            map[key] = value;
        });
        return map;
    }
}

function isValidVersion(version) {
    return !(isNaN(version) || version <= 0);
}

function validateArgs() {
    if (Number(flagGenerateCodes) !== 1) {
        console.error('Please specify mode: "generate codes" (-g)');
        process.exit(1);
    }

    if (!nftMapping || typeof nftMapping !== 'object' || Object.keys(nftMapping).length === 0) {
        console.error('Invalid NFT ID to account mapping. Provide in JSON format or as key=value pairs.');
        process.exit(1);
    }

    if (!isValidVersion(VERSION)) {
        console.error(`Invalid version ${VERSION}. Must be a positive integer.`);
        process.exit(1);
    }

    if (isNaN(chainId) || chainId <= 0) {
        console.error('Invalid chain ID. Must be a positive integer.');
        process.exit(1);
    }
}


module.exports = {
    execute
};
