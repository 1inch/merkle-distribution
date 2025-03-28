// const ethers = require('ethers');
const qrdrop = require('./gen_qr_lib.js');
const fs = require('fs');
const { assert } = require('console');

async function generateLinks (amounts, counts, version, chainId, debugMode) {
    try {
        const splittedAmounts = amounts.split(',').map(x => BigInt(x));
        const splittedCounts = counts.split(',').map(x => BigInt(x));
        splittedCounts.unshift(BigInt(10));
        splittedAmounts.unshift(BigInt(1));
        splittedAmounts.forEach((element, index) => { splittedAmounts[index] = ethers.parseEther(element.toString()); });

        const settings = qrdrop.createNewDropSettings(false, true, splittedCounts, splittedAmounts, 10, version, debugMode, chainId);

        if (!validateVersion(settings.version, settings.fileLatest)) {
            throw new Error('Version should be greater than ' + getLatestVersion(settings.fileLatest).toString());
        }

        const total = splittedCounts.reduce((acc, v) => acc + v, 0n);
        const height = Math.ceil(Math.log2(Number(total)));
        
        const { merkleRoot, urls } = await qrdrop.generateCodes(settings);

        return { merkleRoot, height, urls };
    } catch (error) {
        console.log('DEBUG: error:', error);
    }
}

function verifyLink (url, root, chainId) {
    const settings = qrdrop.createNewDropSettings(false, false, null, null, null, null, true, chainId);
    const result = qrdrop.parseLink(url, root, settings.prefix);
    assert(result.isValid);
    return result;
}

function validateVersion (version, latestFile) {
    const latestVersion = getLatestVersion(latestFile);
    if (version < 0) {
        return false;
    }

    if (version <= latestVersion) {
        console.error('version should be greater than ' + latestVersion.toString());
        return false;
    }

    return true;
}

function getLatestVersion (latestFile) {
    if (!fs.existsSync(latestFile)) {
        return 0;
    }

    const latestVersion = Number(fs.readFileSync(latestFile));
    if (isNaN(latestVersion) || latestVersion < 0) {
        console.log('WARNING! version file is corrupted');
        return -1;
    }

    return latestVersion;
}

module.exports = {
    generateLinks,
    verifyLink,
};
