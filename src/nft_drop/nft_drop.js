/*
 generate merkle tree, to pass to INFTMerkleDrop.sol as well as urls and qr codes
 uses qrdrop.js as a base but receive another input format vlow and generates output under /nft_drop subdir
  input:
    {
        nft_id -> account
    }

Example:
    src/nft_drop/nft_drop.js -gsqlzv 45 -m node nft_drop.js -gsqlzv 45 -m 0=0x742d35Cc6634C0532925a3b844Bc454e4438f44e,1=0x53d284357ec70ce289d6d64134dfac8e511c8a3d
*/

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const archive = require('./../zip_lib.js');
const { createNewNFTDropSettings, generateNFTCodes } = require('./gen_nft_lib');
const { ensureDirectoryExistence } = require('./../gen_qr_lib');

program
    // generation mode
    .option('-v, --version <version>', 'deployment instance version', false)
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
const VERSION = Number(options.version);
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

function validateArgs() {
    if (Number(flagGenerateCodes) !== 1) {
        console.error('Please specify mode: "generate codes" (-g)');
        process.exit(1);
    }

    if (!nftMapping || typeof nftMapping !== 'object' || Object.keys(nftMapping).length === 0) {
        console.error('Invalid NFT ID to account mapping. Provide in JSON format or as key=value pairs.');
        process.exit(1);
    }

    if (isNaN(VERSION) || VERSION <= 0) {
        console.error('Invalid version. Must be a positive integer.');
        process.exit(1);
    }

    if (isNaN(chainId) || chainId <= 0) {
        console.error('Invalid chain ID. Must be a positive integer.');
        process.exit(1);
    }
}

function getLatestVersion(latestFile) {
    if (!fs.existsSync(latestFile)) {
        return 0;
    }

    const latestVersion = Number(fs.readFileSync(latestFile));
    if (isNaN(latestVersion) || latestVersion < 0) {
        console.log('WARNING! Version file is corrupted');
        process.exit(1);
    }

    return latestVersion;
}

module.exports = {
    execute
};
