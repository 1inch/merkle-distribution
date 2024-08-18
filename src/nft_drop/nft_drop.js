/**
 * NFT Drop Generation and Validation Script
 *
 * This script generates a Merkle tree for NFT drops, which can be passed to the `NFTMerkleDrop.sol` contract.
 * Additionally, it generates URLs and QR codes for each NFT drop and outputs the results under the `/nft_drop` subdirectory.
 * The script is based on `qrdrop.js` but uses a different input format and output structure.
 *
 * Detailed usage examples are provided within this documentation.
 */
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const archive = require('./../zip_lib.js');
const {
    createNewNFTDropSettings,
    generateNFTCodes,
    NFTDropSettings,
    nftUriDecode,
    getDefaultMapping,
    resolveFilePath,
    parseMapping,
    isValidVersion,
} = require('./gen_nft_lib');
const { ensureDirectoryExistence, getLatestVersion, validateVersion } = require('./../gen_qr_lib');
const { exit } = require('process');
const { assert } = require('console');

// Parse Command Line Arguments
function parseCommandLineArgs () {
    program
        .option('-g, --gencodes', 'generate NFT drop codes mode', false)
        .option('-q, --qrs', 'generate QR codes', false)
        .option('-l, --links', 'generate links', true)
        .option('-m, --mapping <mapping>', 'NFT ID to account mapping (JSON format or as key=value pairs separated by commas)')
        .option('-f, --file <file>', 'filepath to NFT ID to account mapping (JSON format or as key=value pairs separated by commas)')
        .option('-v, --version', 'deployment instance version', false)
        .option('-b, --chainid <chainid>', 'chain ID', '1')
        .option('-s, --nodeploy', 'test run, ignores version', false)
        .option('-c, --cleanup', 'cleanup directories before codes generation', false)
        .option('-z, --zip', 'zip QR codes', false)
        .option('-x, --validate', 'validation mode', false)
        .option('-u, --url <url>', 'QR URL')
        .option('-r, --root <root>', 'merkle root')
        .option('-w, --wipe', 'clean up QR directories', false);

    program.parse(process.argv);
    return program.opts();
}

// Fill Parameters with Defaults
function fillParameters ({
    flagGenerateCodes = true,
    flagSaveQr = false,
    flagSaveLink = false,
    nftMapping = null,
    version = null,
    chainId = 1,
    flagNoDeploy = false,
    flagCleanup = false,
    flagZip = false,
    flagValidateOnly = false,
    validateUrl = null,
    validateRoot = null,
    flagWipe = false,
} = {}) {
    // Ensure version is valid, or set it to the latest + 1
    if (!isValidVersion(version)) {
        version = getLatestVersion(NFTDropSettings.fileLatest) + 1;
    }

    // Ensure that at least one of the generation modes is active
    if (
        Number(flagGenerateCodes) +
        Number(flagValidateOnly) +
        Number(flagWipe) === 0
    ) {
        flagGenerateCodes = true;
    }

    // Handle the mapping logic
    if (nftMapping == null) {
        nftMapping = getDefaultMapping();
    }

    return {
        flagGenerateCodes,
        flagSaveQr,
        flagSaveLink,
        nftMapping,
        version,
        chainId,
        flagNoDeploy,
        flagCleanup,
        flagZip,
        flagValidateOnly,
        validateUrl,
        validateRoot,
        flagWipe,
    };
}

// Validate Parameters
function validateParameters (params) {
    if (!isValidVersion(params.version)) {
        console.error(`Invalid version ${params.version}. Must be a positive integer.`);
        process.exit(1);
    }

    if (!params.nftMapping || typeof params.nftMapping !== 'object' || Object.keys(params.nftMapping).length === 0) {
        console.error('Invalid NFT ID to account mapping. Provide in JSON format or as key=value pairs.');
        process.exit(1);
    }

    if (params.flagValidateOnly) {
        if (!params.validateUrl || !params.validateRoot) {
            console.error('Please specify URL and root for validation: -u and -r, respectively.');
            exit(1);
        }
    }

    if (isNaN(params.chainId) || params.chainId <= 0) {
        console.error('Invalid chain ID. Must be a positive integer.');
        process.exit(1);
    }
}

// Generate NFT Drop
async function manageNFTDrop ({
    flagGenerateCodes,
    flagSaveQr,
    flagSaveLink,
    nftMapping,
    version,
    chainId,
    flagNoDeploy,
    flagCleanup,
    flagZip,
    flagValidateOnly,
    validateUrl,
    validateRoot,
    flagWipe,
} = {}) {
    // Initialize and fill Parameters with Defaults
    const params = fillParameters({
        flagGenerateCodes,
        flagSaveQr,
        flagSaveLink,
        nftMapping,
        version,
        chainId,
        flagNoDeploy,
        flagCleanup,
        flagZip,
        flagValidateOnly,
        validateUrl,
        validateRoot,
        flagWipe,
    });

    // Validate Parameters
    validateParameters(params);

    // Create Settings by spreading filledParams directly into createNewNFTDropSettings
    const settings = createNewNFTDropSettings(...Object.values(params));

    // Output Directories
    const outputDirs = [settings.pathTestQr, settings.pathQr, settings.pathZip];
    let dropResult = null;

    if (settings.flagGenerateCodes) {
        if (!settings.flagNoDeploy) {
            validateVersion(settings.version, settings.fileLatest);
        }

        if (settings.flagCleanup) {
            archive.cleanDirs(outputDirs);
        }

        // Main Code Generation
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

// CLI Entry Point
// CLI Entry Point
if (require.main === module) {
    const options = parseCommandLineArgs();

    // Cast options to parameters
    const params = {
        flagGenerateCodes: options.gencodes,
        flagSaveQr: options.qrs,
        flagSaveLink: options.links,
        nftMapping: (() => {
            const _mappingSource = options.mapping || (options.file && fs.readFileSync(resolveFilePath(options.file), 'utf-8'));
            return parseMapping(_mappingSource);
        })(),
        version: options.version,
        chainId: options.chainid,
        flagNoDeploy: options.nodeploy,
        flagCleanup: options.cleanup,
        flagZip: options.zip,
        flagValidateOnly: options.validate,
        validateUrl: options.url,
        validateRoot: options.root,
        flagWipe: options.wipe,
    };

    // Generate the NFT Drop with the parameters
    manageNFTDrop(params);
}

module.exports = {
    manageNFTDrop,
};
