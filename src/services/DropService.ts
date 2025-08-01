import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
    DropSettings,
    GeneratedLink,
    LinkFileContent,
    GenerateLinksResult,
} from '../types';
import { config, formatBaseUrl } from '../config';
import { generatePrivateKeys, getAddressFromPrivateKey } from '../lib/wallet';
import { createMerkleDrop, calculateMerkleHeight } from '../lib/merkle';
import { generateClaimUrl, shuffle } from '../lib/encoding';
import { generateQrCodes, ensureDirectoryExists } from '../lib/qr';
import { zipFolders, cleanDirs } from '../lib/zip';

export class DropService {
    /**
   * Create drop settings
   */
    static createDropSettings (
        flagSaveQr: boolean,
        flagSaveLink: boolean,
        codeCounts: bigint[],
        codeAmounts: bigint[],
        testCount: number,
        version: number,
        flagNoDeploy: boolean,
        chainId: number,
    ): DropSettings {
        return {
            flagSaveQr,
            flagSaveLink,
            flagNoDeploy,
            codeCounts,
            codeAmounts,
            testCount,
            version,
            chainId,
            fileLinks: path.join(config.paths.generatedData, `${version}-qr-links.json`),
            testLinks: path.join(config.paths.generatedData, `${version}-qr-links-test.json`),
            prefix: formatBaseUrl(chainId),
            encPrefix: config.urls.encodedPrefix,
            fileLatest: config.paths.latestVersion,
            pathQr: config.paths.qrCodes,
            pathTestQr: config.paths.testQrCodes,
            pathZip: config.paths.generatedData,
        };
    }

    /**
   * Generate merkle drop codes
   */
    static async generateCodes (settings: DropSettings): Promise<GenerateLinksResult> {
    // Calculate total codes and amounts
        const totalCodes = settings.codeCounts.reduce((sum, count) => sum + count, 0n);
        const amounts: bigint[] = [];
    
        for (let i = 0; i < settings.codeCounts.length; i++) {
            const count = Number(settings.codeCounts[i]);
            for (let j = 0; j < count; j++) {
                amounts.push(settings.codeAmounts[i]);
            }
        }

        console.log('Total codes:', totalCodes.toString());

        // Generate private keys and addresses
        const privateKeys = await generatePrivateKeys(Number(totalCodes));
        const addresses = privateKeys.map(pk => getAddressFromPrivateKey(pk));

        // Create merkle drop
        const merkleDrop = createMerkleDrop(addresses, amounts);
        const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
    
        console.log(`Merkle root: ${merkleDrop.root}`);
        console.log(`Total amount: ${ethers.formatEther(totalAmount)} tokens`);

        // Generate shuffled indices for QR codes
        const indices = shuffle(Array.from({ length: amounts.length }, (_, i) => i));

        // Generate URLs
        const urls: string[] = [];
        for (let i = 0; i < amounts.length; i++) {
            const url = generateClaimUrl(
                privateKeys[i],
                amounts[i],
                merkleDrop.proofs[i],
                settings.version,
                settings.prefix,
            );
            urls.push(url);
        }

        // Save QR codes if requested
        if (settings.flagSaveQr) {
            ensureDirectoryExists(settings.pathQr);
            ensureDirectoryExists(settings.pathTestQr);
            generateQrCodes(urls, indices, settings.testCount, settings.pathQr, settings.pathTestQr);
        }

        // Save links to JSON if requested
        if (settings.flagSaveLink) {
            await this.saveLinksToFiles(urls, amounts, indices, settings, merkleDrop.root);
        }

        // Update version file if not in test mode
        if (!settings.flagNoDeploy) {
            fs.writeFileSync(settings.fileLatest, settings.version.toString());
        }

        // Calculate merkle tree height
        const height = calculateMerkleHeight(amounts.length);

        return {
            merkleRoot: merkleDrop.root,
            height,
            urls,
        };
    }

    /**
   * Save generated links to JSON files
   */
    private static async saveLinksToFiles (
        urls: string[],
        amounts: bigint[],
        indices: number[],
        settings: DropSettings,
        merkleRoot: string,
    ): Promise<void> {
        const testLinks: GeneratedLink[] = [];
        const productionLinks: GeneratedLink[] = [];

        for (let i = 0; i < urls.length; i++) {
            const link: GeneratedLink = {
                url: urls[i],
                encUrl: settings.encPrefix ? settings.encPrefix + encodeURIComponent(urls[i]) : undefined,
                amount: amounts[i].toString(),
                index: indices[i],
            };

            if (i < settings.testCount) {
                testLinks.push(link);
            } else {
                productionLinks.push(link);
            }
        }

        // Save test links
        if (testLinks.length > 0) {
            const testContent: LinkFileContent = {
                count: testLinks.length,
                root: merkleRoot,
                amount: testLinks.reduce((sum, link) => sum + BigInt(link.amount), 0n).toString(),
                version: settings.version,
                codes: testLinks,
            };
      
            ensureDirectoryExists(path.dirname(settings.testLinks));
            fs.writeFileSync(settings.testLinks, JSON.stringify(testContent, null, 2));
        }

        // Save production links
        if (productionLinks.length > 0) {
            const prodContent: LinkFileContent = {
                count: productionLinks.length,
                root: merkleRoot,
                amount: productionLinks.reduce((sum, link) => sum + BigInt(link.amount), 0n).toString(),
                version: settings.version,
                codes: productionLinks,
            };
      
            ensureDirectoryExists(path.dirname(settings.fileLinks));
            fs.writeFileSync(settings.fileLinks, JSON.stringify(prodContent, null, 2));
        }
    }

    /**
   * Generate links for Hardhat task
   */
    static async generateLinks (
        amounts: string,
        counts: string,
        version: string,
        chainId: number,
        debugMode: boolean,
    ): Promise<GenerateLinksResult> {
        try {
            // Parse amounts and counts
            const splittedAmounts = amounts.split(',').map(x => BigInt(x));
            const splittedCounts = counts.split(',').map(x => BigInt(x));
      
            // Add test codes
            splittedCounts.unshift(BigInt(config.defaults.testCodeCount));
            splittedAmounts.unshift(BigInt(config.defaults.testCodeAmount));
      
            // Convert to wei
            const amountsInWei = splittedAmounts.map(amount =>
                ethers.parseEther(amount.toString()),
            );

            // Create settings
            const settings = this.createDropSettings(
                false,
                true,
                splittedCounts,
                amountsInWei,
                config.defaults.testCodeCount,
                Number(version),
                debugMode,
                chainId,
            );

            // Validate version
            if (!this.validateVersion(settings.version, settings.fileLatest)) {
                throw new Error(`Version should be greater than ${this.getLatestVersion(settings.fileLatest)}`);
            }

            // Generate codes
            return await this.generateCodes(settings);
        } catch (error) {
            console.error('Error generating links:', error);
            throw error;
        }
    }

    /**
   * Create zip archives of QR codes
   */
    static createZipArchives (settings: DropSettings, dateString: string): void {
        const productionZip = path.join(settings.pathZip, `${settings.version}-qr-drop-${dateString}.zip`);
        const testZip = path.join(settings.pathZip, `${settings.version}-qr-drop-test-${dateString}.zip`);
    
        zipFolders([settings.pathQr, settings.pathTestQr], [productionZip, testZip]);
    }

    /**
   * Clean QR directories
   */
    static cleanQrDirectories (settings: DropSettings): void {
        cleanDirs([settings.pathTestQr, settings.pathQr]);
    }

    /**
   * Validate version number
   */
    static validateVersion (version: number, latestFile: string): boolean {
        const latestVersion = this.getLatestVersion(latestFile);
    
        if (version < 0) {
            return false;
        }

        if (version <= latestVersion) {
            console.error(`Version should be greater than ${latestVersion}`);
            return false;
        }

        return true;
    }

    /**
   * Get latest version from file
   */
    static getLatestVersion (latestFile: string): number {
        if (!fs.existsSync(latestFile)) {
            return 0;
        }

        const content = fs.readFileSync(latestFile, 'utf-8');
        const latestVersion = Number(content);
    
        if (isNaN(latestVersion) || latestVersion < 0) {
            console.warn('WARNING! Version file is corrupted');
            return -1;
        }

        return latestVersion;
    }
}
