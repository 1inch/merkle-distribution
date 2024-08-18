
# NFT Drop Generation and Validation Script

This script generates a Merkle tree for NFT drops, which can be passed to the `NFTMerkleDrop.sol` contract. It also generates URLs and QR codes for each NFT drop and outputs the results under the `/nft_drop` subdirectory. The script is based on `qrdrop.js` but uses a different input format and output structure.

## Usage

### Generation Mode

Generate NFT drop codes, QR codes, and optionally zip the results.

#### Example 1: Using a JSON File as Input

```bash
yarn nft_drop -gf ./input/0.json
```

**Output:**

```
Generated NFT drop version 9; root: 0x877f9206c3851f0b52f6db59bf278d09; proofs num: 2
Output saved to: ./src/nft_drop/gendata/9-nft-drop.json
```

#### Example 2: Using Mapping Passed via Arguments

This example also creates QR codes and ZIP archives:

```bash
yarn nft_drop -gqlzm 0=0x742d35Cc6634C0532925a3b844Bc454e4438f44e,1=0x53d284357ec70ce289d6d64134dfac8e511c8a3d
```

**Output:**

```
Output saved to: ./src/nft_drop/gendata/10-nft-drop.json
Created src/nft_drop/gendata/10-nft-drop-2024-08.zip
Created src/nft_drop/gendata/10-nft-drop-test-2024-08.zip
Directories cleaned: ./src/nft_drop/test_qr,./src/nft_drop/qr
```

### Validation Mode

Validate the generated QR code against the Merkle root.

#### Example:

```bash
yarn nft_drop -x -u "https://app.lostbodystore.io/#/1/qr?d=AadSkmoSppsdyp5WO54eGESWBMNqxOvkvqPVipyiiwD1" -r 0x877f9206c3851f0b52f6db59bf278d09
```

**Output:**

```
root : 0x877f9206c3851f0b52f6db59bf278d09
proof: 9604c36ac4ebe4bea3d58a9ca28b00f5
leaf : a752926a12a69b1dca9e563b9e1e1844
version : 1
isValid : true
```

## Options

- **`-v, --version`**: Deployment instance version (optional, default: `false`).
- **`-g, --gencodes`**: Generate NFT drop codes mode (default: `false`).
- **`-q, --qrs`**: Generate QR codes (default: `false`).
- **`-l, --links`**: Generate links (default: `true`).
- **`-m, --mapping <mapping>`**: NFT ID to account mapping (JSON format or as key=value pairs separated by commas).
- **`-f, --file <file>`**: Filepath to NFT ID to account mapping (JSON format or as key=value pairs separated by commas).
- **`-s, --nodeploy`**: Test run, ignores version (default: `false`).
- **`-c, --cleanup`**: Cleanup directories before codes generation (default: `false`).
- **`-z, --zip`**: Zip QR codes (default: `false`).
- **`-x, --validate`**: Validation mode (default: `false`).
- **`-u, --url <url>`**: QR URL to validate.
- **`-r, --root <root>`**: Merkle root to validate against.
- **`-w, --wipe`**: Clean up QR directories (default: `false`).
- **`-b, --chainid <chainid>`**: Chain ID to use (default: `1`).

## How to Run

1. **Install Dependencies:**
   Ensure that all required dependencies are installed.

   ```bash
   yarn install
   ```

2. **Generate an NFT Drop:**
   Use the `-g` flag with either `-m` for mapping or `-f` for a file to generate the drop.

3. **Validate a Generated QR Code:**
   Use the `-x` flag along with `-u` for the URL and `-r` for the root to validate the generated QR code.

## License

This project is licensed under the MIT License.
