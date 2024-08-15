const {AbstractDropSettings, keccak128, uriEncode, saveFile, saveQr} = require("./../gen_qr_lib");
const {default: Wallet} = require("ethereumjs-wallet");
const {assert} = require("console");
const {MerkleTree} = require("merkletreejs");
const keccak256 = require('keccak256');


class NFTDropSettings extends AbstractDropSettings {
    static get root() {
        return './src/nft_drop';
    }

    constructor(flagSaveQr, flagSaveLink, nftMapping, version, chainId = 1, flagNoVersionUpdate = false) {
        super(flagSaveQr, flagSaveLink, Object.keys(nftMapping), Object.values(nftMapping), version, chainId, flagNoVersionUpdate);
        this.nftMapping = nftMapping;
        // TODO move to config
        this.fileLinks = `${this.constructor.pathZip}/${version}-ntf-drop.json`;
        this.prefix = `https://app.lostbodystore.io/#/${chainId}/qr?`;
    }
}

function createNewNFTDropSettings(flagSaveQr, flagSaveLink, nftMapping, version, chainId, flagNoDeploy) {
    return new NFTDropSettings(flagSaveQr, flagSaveLink, nftMapping, version, chainId, flagNoDeploy);
}

class Recipient {
    constructor(url, tokenId, account, proof) {
        this.url = url;           // The drop URL
        this.tokenId = tokenId;   // The NFT ID
        this.account = account;   // The associated Ethereum account
        this.proof = proof;       // The leaf proof from the Merkle tree in hex
    }
}
function formatProof(proof) {
    return proof.map(p => {
        return {
            position: p.position,
            data: '0x' + p.data.toString('hex')
        };
    });
}

function makeNFTDrop(nftMapping, settings) {
    const orderedEntries = Object.entries(nftMapping);  // Store the order explicitly

    const leaves = [];
    orderedEntries.forEach(([account, tokenIds]) => {
        tokenIds.sort(); // Sort tokenIds for consistency

        // Concatenate the account and token IDs similarly to abi.encodePacked
        const element = Buffer.concat([
            Buffer.from(account.slice(2), 'hex'),
            Buffer.from(tokenIds.map(tokenId => BigInt(tokenId).toString(16).padStart(64, '0')).join(''), 'hex')
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
    let lBuf = Buffer.from(leaf.slice(2), 'hex');
    const pBuf = Buffer.concat(proof.map(p => p.data));
    return prefix + 'd=' + uriEncode(Buffer.concat([vBuf, lBuf, pBuf]));
}

function nftUriDecode(s, root, prefix, expectedVersion = null, displayResults = false) {
    // Decode the base64-encoded string from the URL
    const b = Buffer.from(s.substring(prefix.length + 2).replace(/-/g, '+').replace(/_/g, '/').replace(/!/g, '='), 'base64');

    // Extract the version (first byte)
    const version = b.subarray(0, 1).readUInt8(0);

    // Compare the extracted version with the expected version
    if (expectedVersion !== null && version !== expectedVersion) {
        throw new Error(`Version mismatch: expected ${expectedVersion}, but got ${version}`);
    }

    // Extract the leaf (next 32 bytes if using keccak256)
    const lBuf = b.subarray(1, 33);  // 32 bytes for keccak256
    let leaf = lBuf.toString('hex');

    // Extract the proof from the remaining bytes (each proof element is 32 bytes)
    let pBuf = b.subarray(33);
    const proof = [];
    while (pBuf.length > 0) {
        proof.push({ data: pBuf.subarray(0, 32) });  // 32 bytes per proof element
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


async function generateNFTCodes(settings) {
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

    // Optionally (but by default): store metadata
    if (settings.flagSaveLink) {
        const fileContent = {
            root: drop.root,
            version: settings.version,
            totalRecipients: drop.recipients.length,
            recipients: recipients,
        };

        saveFile(settings.fileLinks, JSON.stringify(fileContent, null, 1));
        console.log(`Output saved to: ${settings.fileLinks}`);
    }

    if (!settings.flagNoDeploy) {
        saveFile(settings.fileLatest, settings.version.toString());
    }
}

// Export the new settings
module.exports = {
    generateNFTCodes,
    createNewNFTDropSettings,
    NFTDropSettings,
    nftUriDecode,
};
