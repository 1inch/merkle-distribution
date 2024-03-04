<div align="center">
    <img src="https://github.com/1inch/farming/blob/master/.github/1inch_github_w.svg#gh-light-mode-only">
    <img src="https://github.com/1inch/farming/blob/master/.github/1inch_github_b.svg#gh-dark-mode-only">
</div>

# Merkle Distribution
[![Build Status](https://github.com/1inch/merkle-distribution/actions/workflows/test.yml/badge.svg)](https://github.com/1inch/merkle-distribution/actions)
[![Coverage Status](https://codecov.io/gh/1inch/merkle-distribution/branch/master/graph/badge.svg?token=4AY5FRY8HN)](https://codecov.io/gh/1inch/merkle-distribution)

Set of smart contracts for gas efficient merkle tree drops. 

## Sequential cumulative Merkle Tree drops

Each next Merkle Tree root replaces previous one and should contain cumulative balances of all the participants. Cumulative claimed amount is used as invalidation for every participant.

## Signature-based drop

Each entry of the drop contains private key which is used to sign the address of the receiver. This is done to safely distribute the drop and prevent MEV stealing.

## How to create qr-codes and deploy the contract
### Generation
To generate QR-codes for the drop, use the following command:
```bash
yarn qr:create <version> -a <token amounts> -n <qr-code numbers> 
```
|Parameter|Description|
|---|---|
|version|Version of the drop. Used to identify the drop on the front-end side|
|token amounts|Comma-delimited list of amounts of tokens for each QR-code|
|qr-code numbers|Comma-delimited list of number of QR-codes to generate. The position corresponds to the position of amount|

Example:
To generate qr codes for the drop
|Amounts|Number of codes|
|---|---|
|5 INCH|100 qr-codes|
|10 INCH|50 qr-codes|
|20 INCH|20 qr-codes|

use the following command:

```bash
yarn qr:create 1 -a 5,10,20 -n 100,50,20
```

### Deployment
To deploy the contract, use the following command:

```bash
yarn qr:deploy hardhat --v <version> --r <merkle root> --h <merkle tree height>
```
|Parameter|Description|
|---|---|
|version|Version of the drop. Used to make deployment output JSON unique|
|merkle root|The root of the merkle tree. Should be taken from the previous step.|
|merkle tree height|The height of the merkle tree. Power of height |

Example:
For the drop generated in the previous example, use the following command:

```bash
yarn qr:deploy hardhat --v 36 --r 0x0ee0c05c1942ba534867e4676ddd0cc2 --h 8
```
where
|Parameter|Value|
|---|---|
|version|36|
|merkle root|0x0ee0c05c1942ba534867e4676ddd0cc2|
|merkle tree height|8|