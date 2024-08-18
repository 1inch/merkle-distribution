/**
 * NFT Drop Generation and Validation Script
 *
 * This script generates a Merkle tree for NFT drops, which can be passed to the `NFTMerkleDrop.sol` contract.
 * Additionally, it generates URLs and QR codes for each NFT drop and outputs the results under the `/nft_drop` subdirectory.
 * The script is based on `qrdrop.js` but uses a different input format and output structure.
 *
 * ## Generation Example:
 *
 * Command:
 * ```
 * /usr/local/bin/node /Users/Arseniy/PycharmProjects/merkle-distribution/src/nft_drop/nft_drop.js -gf ./input/0.json
 * ```
 * Output:
 * ```
 * Generated NFT drop version 9; root: 0x877f9206c3851f0b52f6db59bf278d09; proofs num: 2
 * Output saved to: ./src/nft_drop/gendata/9-nft-drop.json
 * ```
 *
 * ## Example Using Mapping Passed via Arguments:
 *
 * This example also creates QR codes and ZIP archives:
 *
 * Command:
 * ```
 * /usr/local/bin/node ./src/nft_drop/nft_drop.js -gqlzm 0=0x742d35Cc6634C0532925a3b844Bc454e4438f44e,1=0x53d284357ec70ce289d6d64134dfac8e511c8a3d
 * ```
 * Output:
 * ```
 * Output saved to: ./src/nft_drop/gendata/10-nft-drop.json
 * Created src/nft_drop/gendata/10-nft-drop-2024-08.zip
 * Created src/nft_drop/gendata/10-nft-drop-test-2024-08.zip
 * Directories cleaned: ./src/nft_drop/test_qr,./src/nft_drop/qr
 * ```
 *
 * ## Validation Example:
 *
 * Command:
 * ```
 * /usr/local/bin/node ./src/nft_drop/nft_drop.js -x -u https://app.lostbodystore.io/#/1/qr?d=AadSkmoSppsdyp5WO54eGESWBMNqxOvkvqPVipyiiwD1 -r 0x877f9206c3851f0b52f6db59bf278d09
 * ```
 * Output:
 * ```
 * root : 0x877f9206c3851f0b52f6db59bf278d09
 * proof: 9604c36ac4ebe4bea3d58a9ca28b00f5
 * leaf : a752926a12a69b1dca9e563b9e1e1844
 * version : 1
 * isValid : true
 * ```
 *
 * This documentation provides detailed examples of how to use the script for generating NFT drops and validating them against a Merkle root.
 */

const { program } = require('commander');
const fs = require('fs');
const os = require('os');
const path = require('path');
const archive = require('./../zip_lib.js');
const { createNewNFTDropSettings, generateNFTCodes, NFTDropSettings, nftUriDecode } = require('./gen_nft_lib');
const { ensureDirectoryExistence, getLatestVersion, validateVersion } = require('./../gen_qr_lib');
const { exit } = require('process');
const { assert } = require('console');

function parseCommandLineArgs() {
    program
        // generation mode
        .option('-v, --version', 'deployment instance version', false)
        .option('-g, --gencodes', 'generate NFT drop codes mode', false)
        .option('-q, --qrs', 'generate qr: ', false)
        .option('-l, --links', 'generate links: ', true)
        .option('-m, --mapping <mapping>', 'NFT ID to account mapping (JSON format or as key=value pairs separated by commas)')
        .option('-f, --file <file>', 'filepath to NFT ID to account mapping (JSON format or as key=value pairs separated by commas)')
        .option('-s, --nodeploy', 'test run, ignores version', false)
        .option('-c, --cleanup', 'cleanup directories before codes generation', false)
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
    return program.opts();
}

function initializeSettings(options) {
    let _v = Number(options.version);
    if (!isValidVersion(_v)) {
        _v = getLatestVersion(NFTDropSettings.fileLatest) + 1;
    }

    const VERSION = _v;
    const flagGenerateCodes = options.gencodes ||
        (Number(options.gencodes) + Number(options.validate) + Number(options.wipe) === 0);
    const flagSaveQr = options.qrs;
    const flagSaveLink = options.links;
    const _mappingSource = options.mapping || (options.file && fs.readFileSync(resolveFilePath(options.file), 'utf-8'));
    const nftMapping = parseMapping(_mappingSource);
    const flagNoDeploy = options.nodeploy;
    const flagCleanup = options.cleanup;
    const flagZip = options.zip;
    const flagValidateOnly = options.validate;
    const validateUrl = options.url;
    const validateRoot = options.root;
    const flagWipe = options.wipe;

    return {
        VERSION,
        flagGenerateCodes,
        flagSaveQr,
        flagSaveLink,
        nftMapping,
        flagNoDeploy,
        flagCleanup,
        flagZip,
        flagValidateOnly,
        validateUrl,
        validateRoot,
        flagWipe
    };
}

async function generateNFTDrop({
    flagGenerateCodes = true,
    flagSaveQr = false,
    flagSaveLink = false,
    nftMapping = getDefaultMapping(),
    version = null,
    flagNoDeploy = true,
    flagCleanup = false,
    flagZip = false,
    flagValidateOnly = false,
    validateUrl = null,
    validateRoot = null,
    flagWipe = false,
} = {}) {
    const settings = createNewNFTDropSettings(
        flagGenerateCodes,
        flagSaveQr,
        flagSaveLink,
        nftMapping,
        version,
        flagNoDeploy,
        flagCleanup,
        flagZip,
        flagValidateOnly,
        validateUrl,
        validateRoot,
        flagWipe,
    );

    validateSettings(settings);

    const outputDirs = [settings.pathTestQr, settings.pathQr, settings.pathZip];
    let dropResult = null;

    if (settings.flagGenerateCodes) {
        if (!settings.flagNoDeploy) {
            validateVersion(settings.version, settings.fileLatest);
        }

        if (settings.flagCleanup) {
            archive.cleanDirs(outputDirs);
        }

        /* main */
        dropResult = await generateNFTCodes(settings);

        if (settings.flagZip) {
            const dateString = new Date().toISOString().slice(0, 7);

            const productionQr = path.join(settings.pathZip, `${settings.version}-nft-drop-${dateString}.zip`);
            const testQr = path.join(settings.pathZip, `${settings.version}-nft-drop-test-${dateString}.zip`);

            ensureDirectoryExistence(settings.pathTestQr);

            archive.zipFolders([settings.pathQr, settings.pathTestQr], [productionQr, testQr]);
        }
    }
    if (settings.flagValidateOnly) {
        assert(nftUriDecode(settings.validateUrl, settings.validateRoot, settings.prefix, null, true));
    }

    if (settings.flagWipe || (settings.flagGenerateCodes && settings.flagZip)) {
        archive.cleanDirs(outputDirs);
    }

    return dropResult;
}

function getDefaultMapping() {
    const latestFile = fs.readdirSync(NFTDropSettings.pathZip).sort().pop();
    return parseMapping(fs.readFileSync(path.resolve(NFTDropSettings.pathZip, latestFile), 'utf8'));
}


// Resolve the file path, expanding ~ to the user's home directory
function resolveFilePath(filePath) {
    if (!filePath) return null;

    // Expand ~ to the home directory
    if (filePath.startsWith('~')) {
        filePath = path.join(os.homedir(), filePath.slice(1));
    }

    // Resolve the path to an absolute path
    return path.resolve(filePath);
}

function parseMapping(mapping) {
    /*
    handle formats:
        account -> [tokenIds] (already formatted correctly).
        tokenId -> account (old format).
        Comma-separated string format (either account=tokenId,... or tokenId=account,...).
    and convert them into the desired account -> [tokenIds] structure.
    */
    if (!mapping) {
        return {};
    }

    try {
        const parsed = JSON.parse(mapping);
        const map = {};

        // Check if the mapping is in the correct format (account -> [tokenIds])
        if (Object.values(parsed).every(value => Array.isArray(value))) {
            return parsed; // Already in the correct format
        }

        // Determine if the format is tokenId -> account
        if (typeof Object.values(parsed)[0] === 'string') {
            // Convert from tokenId -> account to account -> [tokenIds]
            Object.entries(parsed).forEach(([tokenId, account]) => {
                if (!map[account]) {
                    map[account] = [];
                }
                map[account].push(tokenId);
            });
        } else {
            // Convert from account -> tokenId format to account -> [tokenIds]
            Object.entries(parsed).forEach(([account, tokenId]) => {
                if (!map[account]) {
                    map[account] = [];
                }
                map[account].push(tokenId);
            });
        }

        return map;
    } catch {
        // Handle comma-separated input
        const map = {};
        mapping.split(',').forEach(pair => {
            const [key, value] = pair.split('=');

            if (!key || !value) {
                // Handle cases where the key or value might be undefined
                throw new Error(`Invalid mapping pair: ${pair}`);
            }

            // Check if the value is a list (enclosed in brackets)
            if (value.startsWith('[') && value.endsWith(']')) {
                // Convert the stringified list into an array
                const tokenIds = JSON.parse(value);
                if (!map[key]) {
                    map[key] = [];
                }
                map[key] = map[key].concat(tokenIds);
            } else if (isNaN(parseInt(key))) {
                // Handle account=tokenId format
                if (!map[key]) {
                    map[key] = [];
                }
                map[key].push(value);
            } else {
                // Handle tokenId=account format
                const tokenId = key;
                const account = value;
                if (!map[account]) {
                    map[account] = [];
                }
                map[account].push(tokenId);
            }
        });
        return map;
    }
}

function isValidVersion(version) {
    return !(isNaN(version) || version <= 0);
}

function validateArgs(options) {
    // Validate input
    if (
        Number(options.flagGenerateCodes) +
            Number(options.flagValidateOnly) +
            Number(options.flagWipe) ===
        0
    ) {
        options.flagGenerateCodes = true;
    }

    if (
        Number(options.flagGenerateCodes) === 1 &&
        (!options.nftMapping ||
            typeof options.nftMapping !== "object" ||
            Object.keys(options.nftMapping).length === 0)
    ) {
        console.error(
            "Invalid NFT ID to account mapping. Provide in JSON format or as key=value pairs."
        );
        process.exit(1);
    }

    if (!isValidVersion(options.VERSION)) {
        console.error(
            `Invalid version ${options.VERSION}. Must be a positive integer.`
        );
        process.exit(1);
    }

    if (isNaN(options.chainId) || options.chainId <= 0) {
        console.error("Invalid chain ID. Must be a positive integer.");
        process.exit(1);
    }

    if (options.flagValidateOnly) {
        if (!options.validateUrl || !options.validateRoot) {
            console.error(
                "please specify url and root for validation: -u and -r, respectively"
            );
            exit(1);
        }
    }
}

// Run the script only if it was called directly from the command line
if (require.main === module) {
    const options = parseCommandLineArgs();
    generateNFTDrop(
        options.flagGenerateCodes,
        options.flagSaveQr,
        options.flagSaveLink,
        options.nftMapping,
        options.VERSION,
        options.flagNoDeploy
    );
}

module.exports = {
    generateNFTDrop,
    parseMapping,
};
