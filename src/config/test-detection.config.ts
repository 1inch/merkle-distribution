import { TestDetectionConfig } from '../services/StatisticsService';

/**
 * Configuration for detecting test vs production transactions
 *
 * Separate thresholds for claims and funding:
 * - Claims: Individual token amounts claimed by users
 * - Funding: Total amounts funded to the contract for distribution
 */
export const testDetectionConfig: TestDetectionConfig = {
    // For CLAIMS (outgoing from contract)
    // Individual claims <= this value will be classified as test
    maxTestClaimAmountInTokens: 1,
    
    // Individual claims >= this value will be classified as production
    minProductionClaimAmountInTokens: 10,
    
    // For FUNDING (incoming to contract)
    // Funding transactions <= this value will be classified as test
    maxTestFundingAmountInTokens: 50,
    
    // Funding transactions >= this value will be classified as production
    minProductionFundingAmountInTokens: 100,
};

/**
 * You can also define network-specific configurations if needed
 */
export const networkSpecificConfigs: Record<string, TestDetectionConfig> = {
    // Example for Base network - might have different thresholds
    base: {
        maxTestClaimAmountInTokens: 1,
        minProductionClaimAmountInTokens: 10,
        maxTestFundingAmountInTokens: 50,
        minProductionFundingAmountInTokens: 100,
    },
    // Example for Mainnet
    mainnet: {
        maxTestClaimAmountInTokens: 1,
        minProductionClaimAmountInTokens: 10,
        maxTestFundingAmountInTokens: 50,
        minProductionFundingAmountInTokens: 100,
    },
    // Add more networks as needed
};

/**
 * Get the appropriate test detection config for a network
 */
export function getTestDetectionConfig (networkName?: string): TestDetectionConfig {
    if (networkName && networkSpecificConfigs[networkName]) {
        return networkSpecificConfigs[networkName];
    }
    return testDetectionConfig;
}
