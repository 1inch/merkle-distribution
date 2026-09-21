import * as path from 'path';
import { Config } from '../types';

// Get paths based on environment (test mode or normal mode)
function getPaths () {
    const tempDir = process.env.TEMP_DIR;
    
    if (tempDir) {
        // Test mode - use temporary directory
        return {
            latestVersion: path.join(tempDir, 'src', '.latest'),
            qrCodes: path.join(tempDir, 'drops', 'qr'),
            testQrCodes: path.join(tempDir, 'drops', 'test_qr'),
            generatedData: path.join(tempDir, 'drops', 'gendata'),
        };
    } else {
        // Normal mode - use default paths
        return {
            latestVersion: './src/.latest',
            qrCodes: './drops/qr',
            testQrCodes: './drops/test_qr',
            generatedData: './drops/gendata',
        };
    }
}

export const config: Config = {
    chains: {
        mainnet: {
            id: 1,
            tokenAddress: '0x111111111117dC0aa78b770fA6A738034120C302',
        },
        base: {
            id: 8453,
            tokenAddress: '0xc5fecC3a29Fb57B5024eEc8a2239d4621e111CBE',
        },
        hardhat: {
            id: 31337,
            tokenAddress: '0x111111111117dC0aa78b770fA6A738034120C302',
        },
        bsc: {
            id: 56,
            tokenAddress: '0x111111111117dC0aa78b770fA6A738034120C302',
        },
        sepolia: {
            id: 11155111,
            tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        },
    },
    paths: getPaths(),
    urls: {
        // baseUrl: 'https://app.1inch.io/#/{chainId}/qr?',
        baseUrl: 'https://1inch.network/qr?',
        encodedPrefix: 'https://wallet.1inch.io/app/w3browser?link=',
    },
    defaults: {
        testCodeCount: 10,
        testCodeAmount: '1',
    },
};

/**
 * Get chain configuration by chain ID
 */
export function getChainConfig (chainId: number): { name: string; config: Config['chains'][string] } | undefined {
    const entry = Object.entries(config.chains).find(([_, chain]) => chain.id === chainId);
    return entry ? { name: entry[0], config: entry[1] } : undefined;
}

/**
 * Get token address for a specific chain
 */
export function getTokenAddress (chainId: number): string | undefined {
    const chainConfig = getChainConfig(chainId);
    return chainConfig?.config.tokenAddress;
}

/**
 * Format the base URL with chain ID
 */
export function formatBaseUrl (chainId: number): string {
    return config.urls.baseUrl.replace('{chainId}', chainId.toString());
}
