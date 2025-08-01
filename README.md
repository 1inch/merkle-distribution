<div align="center">
    <img src="https://github.com/1inch/farming/blob/master/.github/1inch_github_w.svg#gh-light-mode-only">
    <img src="https://github.com/1inch/farming/blob/master/.github/1inch_github_b.svg#gh-dark-mode-only">
</div>

# Merkle Distribution

[![Build Status](https://github.com/1inch/merkle-distribution/actions/workflows/test.yml/badge.svg)](https://github.com/1inch/merkle-distribution/actions)
[![Coverage Status](https://codecov.io/gh/1inch/merkle-distribution/branch/master/graph/badge.svg?token=4AY5FRY8HN)](https://codecov.io/gh/1inch/merkle-distribution)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive set of smart contracts and tools for gas-efficient merkle tree token distributions. This project provides multiple distribution mechanisms including cumulative merkle drops and signature-based QR code distributions.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Contract Types](#contract-types)
- [Usage](#usage)
  - [QR Code Generation](#qr-code-generation)
  - [Contract Deployment](#contract-deployment)
  - [Link Verification](#link-verification)
  - [Complete Drop Workflow](#complete-drop-workflow)
- [Development](#development)
- [Testing](#testing)
- [Security](#security)
- [License](#license)

## Overview

The Merkle Distribution project provides efficient mechanisms for distributing tokens to multiple recipients using merkle trees. It supports two main distribution types:

1. **Cumulative Merkle Drops**: Sequential drops where each new merkle root contains cumulative balances
2. **Signature-Based Drops**: MEV-resistant distributions using private key signatures for claim verification

## Features

- 🌳 **Gas-efficient merkle tree implementation** - Optimized for minimal gas consumption
- 🔐 **MEV-resistant signature-based claims** - Prevents front-running attacks
- 📱 **QR code generation** - Easy distribution via QR codes
- 🔗 **Claim link generation** - Direct URLs for claiming tokens
- ✅ **Comprehensive verification tools** - Validate claims before and after deployment
- 📦 **Batch processing** - Handle thousands of recipients efficiently
- 🚀 **Multi-chain support** - Deploy on Ethereum, BSC, Base, and other EVM chains

## Installation

```bash
# Clone the repository
git clone https://github.com/1inch/merkle-distribution.git
cd merkle-distribution

# Install dependencies
yarn install

# Compile contracts
yarn build
```

## Contract Types

### 1. Cumulative Merkle Drop

Each new merkle tree root replaces the previous one and contains cumulative balances of all participants. This allows for multiple distribution rounds while preventing double-claiming.

**Key features:**
- Updateable merkle root
- Cumulative balance tracking
- Owner-controlled root updates

### 2. Signature-Based Merkle Drop (SignatureMerkleDrop128)

Uses private key signatures to secure claim links, preventing MEV bots from stealing transactions. Each claim requires a valid signature from the corresponding private key in the merkle tree.

**Key features:**
- 128-bit merkle tree optimization
- Private key signature verification
- MEV-resistant claiming mechanism
- Fixed tree depth for gas optimization

## Usage

### QR Code Generation

Generate QR codes for token distribution:

```bash
yarn qr:create <version> -a <amounts> -n <quantities>
```

**Parameters:**
- `version`: Drop version identifier
- `-a, --amounts`: Comma-separated token amounts (in tokens, not wei)
- `-n, --numbers`: Comma-separated quantities for each amount tier

**Example:**
```bash
# Generate:
# - 100 QR codes with 5 tokens each
# - 50 QR codes with 10 tokens each  
# - 20 QR codes with 20 tokens each
yarn qr:create 1 -a 5,10,20 -n 100,50,20
```

**Additional options:**
- `-t, --testcodes`: Test codes in format "count,amount" (default: "10,1")
- `-c, --cleanup`: Clean directories before generation
- `-z, --zip`: Create zip archives of generated QR codes
- `-b, --chainid`: Target chain ID (default: 1)

### Contract Deployment

Deploy a merkle drop contract with a pre-computed merkle root:

```bash
yarn hardhat deploy:qr --network <network> --v <version> --r <root> --h <height>
```

**Parameters:**
- `--v`: Deployment version number
- `--r`: Merkle root (hex string)
- `--h`: Merkle tree height

**Example:**
```bash
# Deploy on mainnet
yarn hardhat deploy:qr --network mainnet --v 35 --r 0xc8f9f70ceaa4d05d893e74c933eed42b --h 9

# Deploy on Base network
yarn hardhat deploy:qr --network base --v 42 --r 0xabcdef1234567890 --h 10
```

### Link Verification

Verify a claim link against a merkle root:

```bash
yarn lk:check -x -u <url> -r <root> [-b <chainid>]
```

**Example:**
```bash
yarn lk:check -x -u "https://drop.1inch.io/#/r1/..." -r 0xabcdef... -b 1
```

### Complete Drop Workflow

Execute a complete merkle drop deployment (generation + deployment + verification):

```bash
yarn hardhat drop --network <network> --v <version> --a <amounts> --n <counts> [--debug]
```

This command will:
1. Generate claim links with specified amounts
2. Create merkle tree from generated data
3. Deploy the merkle drop contract
4. Verify all generated links

**Example:**
```bash
# Deploy on Base with 3 tiers
yarn hardhat drop --network base --v 53 --a 100,250,500 --n 50,30,20

# Test without deployment
yarn hardhat drop --network hardhat --v 54 --a 10,20 --n 5,5 --debug
```

## Development

### Project Structure

```
merkle-distribution/
├── contracts/           # Solidity smart contracts
│   ├── CumulativeMerkleDrop.sol
│   ├── SignatureMerkleDrop128.sol
│   └── interfaces/
├── src/                 # TypeScript source code
│   ├── cli/            # CLI tools
│   ├── services/       # Core services
│   ├── tasks/          # Hardhat tasks
│   └── types/          # TypeScript types
├── test/               # Test files
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── e2e/            # End-to-end tests
└── deploy/             # Deployment scripts
```

### Building

```bash
# Compile contracts
yarn build

# Watch mode for development
yarn build:watch

# Clean build artifacts
yarn clean
```

### Linting

```bash
# Run all linters
yarn lint

# Fix linting issues
yarn lint:fix

# Individual linters
yarn lint:sol    # Solidity
yarn lint:js     # JavaScript
yarn lint:ts     # TypeScript
```

## Testing

### Run Tests

```bash
# Run all tests
yarn test

# Run specific test suites
yarn test:unit          # Unit tests only
yarn test:integration   # Integration tests only
yarn test:e2e          # End-to-end tests only

# Run with coverage
yarn coverage
yarn test:coverage      # NYC coverage for TypeScript tests
```

### Test Categories

- **Unit Tests**: Test individual components and functions
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test complete workflows including deployment

## Security

### Best Practices

1. **Always verify merkle roots** before deployment
2. **Test on testnets first** before mainnet deployment
3. **Use signature-based drops** for public distributions to prevent MEV
4. **Audit generated claim links** before distribution
5. **Monitor contract events** for claim activity

### Audits

This codebase should be audited before production use. Key areas to review:
- Merkle proof verification logic
- Signature validation in SignatureMerkleDrop128
- Access control in CumulativeMerkleDrop
- Integer overflow/underflow protections

## Networks

Supported networks (configured in hardhat.config.ts):
- Ethereum Mainnet
- BSC (Binance Smart Chain)
- Base
- Local Hardhat Network

## Gas Optimization

The contracts are optimized for gas efficiency:
- SignatureMerkleDrop128 uses 128-bit arithmetic where possible
- Fixed tree depth reduces proof verification costs
- Bitmap tracking for claimed indices
- Optimized compiler settings (1M runs)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Acknowledgments

- Built by [1inch Network](https://1inch.io)
- Uses OpenZeppelin contracts for security
- Merkle tree implementation based on merkletreejs

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/1inch/merkle-distribution/issues).
