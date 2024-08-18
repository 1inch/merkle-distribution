const { AbstractDropSettings, uriEncode, saveFile, saveQr } = require('./../gen_qr_lib');
const { assert } = require('console');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

class NFTDropSettings extends AbstractDropSettings {
    static get root () {
        return './src/nft_drop';
    }

    constructor (flagGenerateCodes, flagSaveQr, flagSaveLink, nftMapping, version, chainId = 1, flagNoVersionUpdate = false,
        flagCleanup = false,
        flagZip = false,
        flagValidateOnly = false,
        validateUrl = null,
        validateRoot = null,
        flagWipe = false,
    ) {
        super(flagGenerateCodes, flagSaveQr, flagSaveLink, Object.keys(nftMapping), Object.values(nftMapping), version, chainId, flagNoVersionUpdate);
        this.nftMapping = nftMapping;
        // TODO move to config
        this.fileLinks = `${this.constructor.pathZip}/${version}-ntf-drop.json`;
        this.prefix = `https://app.lostbodystore.io/#/${chainId}/qr?`;

        this.flagCleanup = flagCleanup;
        this.flagZip = flagZip;
        this.flagValidateOnly = flagValidateOnly;
        this.validateUrl = validateUrl;
        this.validateRoot = validateRoot;
        this.flagWipe = flagWipe;
    }
}

function createNewNFTDropSettings (...args) {
    return new NFTDropSettings(...args);
}

class Recipient {
    constructor (url, tokenId, account, proof) {
        this.url = url; // The drop URL
        this.tokenId = tokenId; // The NFT ID
        this.account = account; // The associated Ethereum account
        this.proof = proof; // The leaf proof from the Merkle tree in hex
    }
}

class DropResult {
    constructor (root, version, totalRecipients, recipients) {
        this.root = root;
        this.version = version;
        this.totalRecipients = totalRecipients;
        this.recipients = recipients;
    }
}

function formatProof (proof) {
    return proof.map(p => {
        return {
            position: p.position,
            data: '0x' + p.data.toString('hex'),
        };
    });
}

function makeNFTDrop (nftMapping, settings) {
    const orderedEntries = Object.entries(nftMapping); // Store the order explicitly

    const leaves = [];
    orderedEntries.forEach(([account, tokenIds]) => {
        tokenIds.sort(); // Sort tokenIds for consistency

        // Concatenate the account and token IDs similarly to abi.encodePacked
        const element = Buffer.concat([
            Buffer.from(account.slice(2), 'hex'),
            Buffer.from(tokenIds.map(tokenId => BigInt(tokenId).toString(16).padStart(64, '0')).join(''), 'hex'),
        ]);

        // Generate the leaf for the Merkle tree using keccak256
        const leaf = MerkleTree.bufferToHex(keccak256(element));
        leaves.push(leaf);
    });

    // Create a Merkle Tree from the leaves using keccak256 as the hashing function and sort the pairs for consistency.
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

    // Obtain the Merkle root, which is the top node of the tree.
    const root = tree.getHexRoot();

    const recipients = [];

    // Generate the list of recipients with URLs, proofs, and associated data
    orderedEntries.forEach(([account, tokenIds], index) => {
        // The proof for this specific leaf
        const leaf = leaves[index];
        const proof = tree.getProof(leaf);

        // Generate the URL using the leaf and proof
        const url = nftGenUrl(leaf, proof, settings.version, settings.prefix);

        const formattedProof = formatProof(proof);

        // Assert to check if the URL can be correctly decoded and verified against the Merkle root
        assert(nftUriDecode(url, root, settings.prefix, settings.version));

        // Create a new Recipient object and add it to the recipients array
        const recipient = new Recipient(url, tokenIds, account, formattedProof);
        recipients.push(recipient);
    });

    // Return the Merkle root and the list of recipients
    return { root, recipients };
}

function nftGenUrl (leaf, proof, version, prefix) {
    const vBuf = Buffer.from([version]);
    const lBuf = Buffer.from(leaf.slice(2), 'hex');
    const pBuf = Buffer.concat(proof.map(p => p.data));
    return prefix + 'd=' + uriEncode(Buffer.concat([vBuf, lBuf, pBuf]));
}

function nftUriDecode (s, root, prefix, expectedVersion = null, displayResults = false) {
    // Decode the base64-encoded string from the URL
    const b = Buffer.from(s.substring(prefix.length + 2).replace(/-/g, '+').replace(/_/g, '/').replace(/!/g, '='), 'base64');

    // Extract the version (first byte)
    const version = b.subarray(0, 1).readUInt8(0);

    // Compare the extracted version with the expected version
    if (expectedVersion !== null && version !== expectedVersion) {
        throw new Error(`Version mismatch: expected ${expectedVersion}, but got ${version}`);
    }

    // Extract the leaf (next 32 bytes if using keccak256)
    const lBuf = b.subarray(1, 33); // 32 bytes for keccak256
    const leaf = lBuf.toString('hex');

    // Extract the proof from the remaining bytes (each proof element is 32 bytes)
    let pBuf = b.subarray(33);
    const proof = [];
    while (pBuf.length > 0) {
        proof.push({ data: pBuf.subarray(0, 32) }); // 32 bytes per proof element
        pBuf = pBuf.subarray(32);
    }

    // Verify the proof against the Merkle root
    const tree = new MerkleTree([], keccak256, { sortPairs: true });
    const isValid = tree.verify(proof, Buffer.from(leaf, 'hex'), root);

    if (displayResults) {
        console.log('root : ' + root);
        console.log('proof: ' + Buffer.concat(proof.map(p => p.data)).toString('hex'));
        console.log('leaf : ' + leaf);
        console.log('version : ' + version);
        console.log('isValid : ' + isValid);
    }

    return isValid;
}

async function generateNFTCodes (settings) {
    const nftMapping = settings.nftMapping;

    /* main */
    const drop = makeNFTDrop(nftMapping, settings);

    console.log(`Generated NFT drop version ${settings.version}; root: ${drop.root}; proofs num: ${drop.recipients.length}`);

    const recipients = drop.recipients;

    // Optionally save the QR code if required
    if (settings.flagSaveQr) {
        recipients.forEach(recipient => {
            saveQr(recipient.tokenId, recipient.url, settings.pathQr);
        });
    }

    const result = new DropResult(
        drop.root,
        settings.version,
        drop.recipients.length,
        recipients,
    );

    // Optionally (but by default): store metadata
    if (settings.flagSaveLink) {
        saveFile(settings.fileLinks, JSON.stringify(result, null, 1));
        console.log(`Output saved to: ${settings.fileLinks}`);
    }

    if (!settings.flagNoDeploy) {
        saveFile(settings.fileLatest, settings.version.toString());
    }

    return result;
}

const fs = require('fs');
const path = require('path');
const os = require('os');

function getDefaultMapping () {
    const inputDir = path.resolve('./input');
    const latestInput = fs.readdirSync(inputDir).sort().pop();
    return parseMapping(fs.readFileSync(path.resolve(inputDir, latestInput), 'utf8'));
}

function resolveFilePath (filePath) {
    if (!filePath) return null;
    if (filePath.startsWith('~')) {
        filePath = path.join(os.homedir(), filePath.slice(1));
    }
    return path.resolve(filePath);
}

function parseMapping (mapping) {
    if (!mapping) {
        return null;
    }

    try {
        const parsed = JSON.parse(mapping);
        const map = {};

        if (Object.values(parsed).every(value => Array.isArray(value))) {
            return parsed;
        }

        if (typeof Object.values(parsed)[0] === 'string') {
            Object.entries(parsed).forEach(([tokenId, account]) => {
                if (!map[account]) {
                    map[account] = [];
                }
                map[account].push(tokenId);
            });
        } else {
            Object.entries(parsed).forEach(([account, tokenId]) => {
                if (!map[account]) {
                    map[account] = [];
                }
                map[account].push(tokenId);
            });
        }

        return map;
    } catch {
        const map = {};
        mapping.split(',').forEach(pair => {
            const [key, value] = pair.split('=');

            if (!key || !value) {
                throw new Error(`Invalid mapping pair: ${pair}`);
            }

            if (value.startsWith('[') && value.endsWith(']')) {
                const tokenIds = JSON.parse(value);
                if (!map[key]) {
                    map[key] = [];
                }
                map[key] = map[key].concat(tokenIds);
            } else if (isNaN(parseInt(key))) {
                if (!map[key]) {
                    map[key] = [];
                }
                map[key].push(value);
            } else {
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

function isValidVersion (version) {
    return !(isNaN(version) || version <= 0);
}

// Export the new settings
module.exports = {
    generateNFTCodes,
    createNewNFTDropSettings,
    NFTDropSettings,
    nftUriDecode,
    DropResult,
    getDefaultMapping,
    resolveFilePath,
    parseMapping,
    isValidVersion,
};
