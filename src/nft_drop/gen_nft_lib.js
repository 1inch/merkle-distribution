const {AbstractDropSettings, keccak128, uriEncode, saveFile, saveQr} = require("./../gen_qr_lib");
const {default: Wallet} = require("ethereumjs-wallet");
const {assert} = require("console");
const {MerkleTree} = require("merkletreejs");


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
    const recipients = [];
    const orderedEntries = Object.entries(nftMapping);  // Store the order explicitly

    // Create an array of elements and leaves by concatenating each NFT ID with the corresponding account address.
    const leaves = [];
    orderedEntries.forEach(([tokenId, account]) => {
        // Convert NFT ID to a hex string and pad it to 64 characters
        const tokenIdHex = BigInt(tokenId).toString(16).padStart(64, '0');
        // Concatenate the account address with the padded NFT ID
        const element = account + tokenIdHex;

        // Generate the leaf for the Merkle tree
        const leaf = MerkleTree.bufferToHex(keccak128(element));
        leaves.push(leaf);
    });

    // Create a Merkle Tree from the leaves using keccak128 as the hashing function and sort the pairs for consistency.
    const tree = new MerkleTree(leaves, keccak128, { sortPairs: true });

    // Obtain the Merkle root, which is the top node of the tree.
    const root = tree.getHexRoot();

    // Generate the list of recipients with URLs, proofs, and associated data
    orderedEntries.forEach(([tokenId, account], index) => {
        // The proof for this specific leaf
        const leaf = leaves[index];
        const proof = tree.getProof(leaf);

        // Generate the URL using the leaf and proof
        const url = nftGenUrl(leaf, proof, settings.version, settings.prefix);

        const formattedProof = formatProof(proof);

        // Assert to check if the URL can be correctly decoded and verified against the Merkle root
        assert(nftUriDecode(url, root, settings.prefix, settings.version));

        // Create a new Recipient object and add it to the recipients array
        const recipient = new Recipient(url, tokenId, account, formattedProof);
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

    // Extract the leaf (next 16 bytes if using keccak128)
    const lBuf = b.subarray(1, 17);
    let leaf = lBuf.toString('hex');

    // Extract the proof from the remaining bytes
    let pBuf = b.subarray(17);
    const proof = [];
    while (pBuf.length > 0) {
        proof.push({ data: pBuf.subarray(0, 16) });
        pBuf = pBuf.subarray(16);
    }

    // Verify the proof against the Merkle root
    const tree = new MerkleTree([], keccak128, { sortPairs: true });
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


async function main(settings) {
    // console.log('dropSettings', settings);
    const nftMapping = settings.nftMapping;

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
    generateNFTCodes: main,
    createNewNFTDropSettings,
    NFTDropSettings,
    nftUriDecode,
};
