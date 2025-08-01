export const testWallets = [
    {
        privateKey: '0000000000000000000000000000000000000000000000000000000000000001',
        address: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf',
    },
    {
        privateKey: '0000000000000000000000000000000000000000000000000000000000000002',
        address: '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF',
    },
    {
        privateKey: '0000000000000000000000000000000000000000000000000000000000000003',
        address: '0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69',
    },
];

export const testAmounts = [
    BigInt('1000000000000000000'), // 1 ether
    BigInt('2000000000000000000'), // 2 ether
    BigInt('3000000000000000000'),  // 3 ether
];

export const testMerkleRoot = '0x1234567890abcdef1234567890abcdef';

export const testUrls = [
    'https://app.1inch.io/#/1/qr?d=IgABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj9A',
    'https://app.1inch.io/#/1/qr?d=IgEBAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4fICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj9A',
];

export const mockConfig = {
    chains: {
        mainnet: { id: 1, tokenAddress: '0x111111111117dC0aa78b770fA6A738034120C302' },
        hardhat: { id: 31337, tokenAddress: '0x111111111117dC0aa78b770fA6A738034120C302' },
    },
    paths: {
        latestVersion: './test/.latest',
        qrCodes: './test/qr',
        testQrCodes: './test/test_qr',
        generatedData: './test/gendata',
    },
    urls: {
        baseUrl: 'https://app.1inch.io/#/{chainId}/qr?',
        encodedPrefix: 'https://wallet.1inch.io/app/w3browser?link=',
    },
    defaults: {
        testCodeCount: 2,
        testCodeAmount: '1',
    },
};
