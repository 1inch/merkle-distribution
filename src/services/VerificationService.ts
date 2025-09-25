import { VerificationResult } from '../types';
import { parseClaimUrl } from '../lib/encoding';
import { formatBaseUrl } from '../config';

export class VerificationService {
    /**
   * Verify a claim link
   */
    static verifyLink (
        url: string,
        root: string,
        chainId: number,
        displayResults: boolean = true,
    ): VerificationResult {
        const prefix = formatBaseUrl(chainId);
        const result = parseClaimUrl(url, root, prefix, displayResults);
    
        if (!result.isValid) {
            console.error('❌ Invalid proof');
        } else {
            console.log('✅ Valid proof');
        }
    
        return result;
    }

    /**
   * Parse a claim link without verification (for testing)
   */
    static parseLink (
        url: string,
        root: string,
        chainId: number,
    ): VerificationResult {
        const prefix = formatBaseUrl(chainId);
        return parseClaimUrl(url, root, prefix, false);
    }
}
