import { Contract } from 'ethers';
import { VerificationService } from '../../services/VerificationService';

/**
 * Verify multiple links with progress visualization
 * @param contract - The contract instance with verify method
 * @param urls - Array of URLs to verify
 * @param merkleRoot - The merkle root for verification
 * @param chainId - The chain ID
 * @returns The count of valid links
 */
export async function verifyLinksWithProgress (
    contract: Contract,
    urls: string[],
    merkleRoot: string,
    chainId: number,
): Promise<number> {
    console.log('🔍 Verifying all links...');
    process.stdout.write('[');
    
    let validCount = 0;
    for (const url of urls) {
        try {
            const merkleNode = verifyLink(url, merkleRoot, chainId);
            const response = await contract.verify(merkleNode.proof, merkleNode.leaf);
            const isValid = response[0];
            
            if (isValid) {
                process.stdout.write('\x1b[32m■\x1b[0m');
                validCount++;
            } else {
                process.stdout.write('\x1b[31m■\x1b[0m');
            }
        } catch {
            process.stdout.write('\x1b[31m■\x1b[0m');
        }
    }
    
    process.stdout.write(']\n\n');
    console.log(`✅ Verification complete: ${validCount}/${urls.length} links valid`);
    
    if (validCount < urls.length) {
        console.log(`⚠️  Warning: ${urls.length - validCount} links failed verification`);
    }
    
    return validCount;
}

/**
 * Verify a claim link
 */
export function verifyLink (
    url: string,
    root: string,
    chainId: number,
): { root: string; proof: Buffer; leaf: string; isValid: boolean } {
    const result = VerificationService.parseLink(url, root, chainId);
  
    if (!result.isValid) {
        throw new Error('Invalid link');
    }
  
    return {
        root: result.root,
        proof: result.proof,
        leaf: result.leaf,
        isValid: result.isValid,
    };
}
