import { ethers } from 'ethers';
import { CHUNK_SIZE_FALLBACK_SEQUENCE, queryEventsWithRetry } from '../lib/events-query';

// Interfaces for statistics data
export interface FundingTransaction {
    from: string;
    amount: string;
    blockNumber: number;
    isTest?: boolean;
}

export interface ClaimInfo {
    blockNumber: number;
    timestamp: Date;
}

export interface ClaimTransaction {
    to: string;
    amount: string;
    blockNumber: number;
    isTest?: boolean;
}

export interface ChunkStatistics {
    chunkSize: number;
    chunks: number;           // Total unique chunks attempted
    firstTrySuccesses: number; // Chunks that succeeded on first attempt
    totalSuccesses: number;    // Chunks that eventually succeeded
    firstTryRate: number;      // Success rate on first attempt
    totalRate: number;         // Success rate after all retries
}

export interface RescueTransaction {
    amount: string;
    blockNumber: number;
    timestamp?: Date;
}

export interface StatisticsData {
    totalFunded: string;
    totalClaims: number;
    totalClaimed: string;
    remainingBalance: string;
    claimedPercentage: string;
    remainingPercentage: string;
    topFunders: FundingTransaction[];
    timeline: {
        firstClaim?: ClaimInfo;
        lastClaim?: ClaimInfo;
    };
    symbol: string;
    decimals: number;
    chunkStatistics?: ChunkStatistics[];
    rescuedAmount: string;
    rescueTransactions: RescueTransaction[];
    // Test vs Production breakdown
    testStatistics?: {
        totalFunded: string;
        totalClaims: number;
        totalClaimed: string;
        claimedPercentage: string;
        topFunders: FundingTransaction[];
    };
    productionStatistics?: {
        totalFunded: string;
        totalClaims: number;
        totalClaimed: string;
        claimedPercentage: string;
        topFunders: FundingTransaction[];
    };
}

// Configuration for a drop contract
export interface DropConfig {
    version: string;
    contractAddress: string;
    tokenAddress: string;
    deploymentBlock: number;
}

// Multi-drop statistics result
export interface MultiDropStatistics {
    [contractAddress: string]: StatisticsData & {
        version: string;
    };
}

// Configuration for test detection
export interface TestDetectionConfig {
    // For CLAIMS (outgoing from contract)
    maxTestClaimAmountInTokens: number; // Maximum claim amount to be considered test
    minProductionClaimAmountInTokens: number; // Minimum claim amount for production
    
    // For FUNDING (incoming to contract)
    maxTestFundingAmountInTokens: number; // Maximum funding amount to be considered test
    minProductionFundingAmountInTokens: number; // Minimum funding amount for production
}

export class StatisticsService {
    // Default configuration for test detection
    private static readonly DEFAULT_TEST_CONFIG: TestDetectionConfig = {
        maxTestClaimAmountInTokens: 10,
        minProductionClaimAmountInTokens: 50,
        maxTestFundingAmountInTokens: 100,
        minProductionFundingAmountInTokens: 500,
    };

    /**
     * Determine if a CLAIM transaction is a test based on amount
     */
    private static isTestClaim (
        amountInTokens: number,
        config: TestDetectionConfig = this.DEFAULT_TEST_CONFIG,
    ): boolean {
        // Claims with small amounts are likely test
        if (amountInTokens <= config.maxTestClaimAmountInTokens) {
            return true;
        }
        // Claims with larger amounts are likely production
        if (amountInTokens >= config.minProductionClaimAmountInTokens) {
            return false;
        }
        // In-between amounts: default to production
        return false;
    }

    /**
     * Determine if a FUNDING transaction is a test based on amount
     */
    private static isTestFunding (
        amountInTokens: number,
        config: TestDetectionConfig = this.DEFAULT_TEST_CONFIG,
    ): boolean {
        // Funding with smaller amounts are likely test
        if (amountInTokens <= config.maxTestFundingAmountInTokens) {
            return true;
        }
        // Funding with larger amounts are likely production
        if (amountInTokens >= config.minProductionFundingAmountInTokens) {
            return false;
        }
        // In-between amounts: default to production
        return false;
    }

    /**
     * Collect on-chain statistics for a deployed drop contract
     */
    static async collectStatistics (
        dropContractAddress: string,
        tokenAddress: string,
        provider: ethers.Provider,
        startBlock: number = 0,
        testConfig?: TestDetectionConfig,
    ): Promise<StatisticsData> {
        // Connect to drop contract to get owner
        const dropContractABI = [
            'function owner() external view returns (address)',
        ];
        const dropContract = new ethers.Contract(dropContractAddress, dropContractABI, provider);
        
        // Get contract owner address
        let contractOwner: string | null = null;
        try {
            contractOwner = await dropContract.owner();
        } catch {
            // Contract might not have an owner function (older versions)
        }

        // Connect to token contract
        const tokenABI = [
            'event Transfer(address indexed from, address indexed to, uint256 value)',
            'function decimals() external view returns (uint8)',
            'function symbol() external view returns (string)',
            'function balanceOf(address) external view returns (uint256)',
        ];
        const tokenContract = new ethers.Contract(tokenAddress, tokenABI, provider);

        // Get token details
        let decimals = 18;
        let symbol = 'tokens';
        try {
            decimals = await tokenContract.decimals();
            symbol = await tokenContract.symbol();
        } catch {
            // Use defaults if token details can't be fetched
        }

        // Get current block
        const currentBlock = await provider.getBlockNumber();

        // Create filtered queries for transfers TO and FROM the drop contract
        const outgoingFilter = tokenContract.filters.Transfer(dropContractAddress, null, null); // Claims (FROM drop)
        const incomingFilter = tokenContract.filters.Transfer(null, dropContractAddress, null); // Funding (TO drop)
        
        let outgoingEvents: (ethers.EventLog | ethers.Log)[] = [];
        let incomingEvents: (ethers.EventLog | ethers.Log)[] = [];
        let chunkStatistics: ChunkStatistics[] | undefined;

        console.log('   - Querying Transfer events for drop contract...');
        
        try {
            // Try to query both filters in parallel
            console.log('   - Attempting direct queries...');
            const [outgoing, incoming] = await Promise.all([
                tokenContract.queryFilter(outgoingFilter, startBlock, 'latest'),
                tokenContract.queryFilter(incomingFilter, startBlock, 'latest'),
            ]);
            outgoingEvents = outgoing;
            incomingEvents = incoming;
        } catch {
            // If direct queries fail, use batched queries with chunking
            console.log('   - Using chunked parallel queries...');
            const chunks = this.createChunks(startBlock, currentBlock, CHUNK_SIZE_FALLBACK_SEQUENCE[0]);
            const totalChunks = chunks.length * 2; // Two filters, so double the chunks
            console.log(`   - Processing ${totalChunks} chunks total (${chunks.length} per filter)...`);
            
            // Shared progress tracker for both queries
            const progressTracker = { completed: 0, total: totalChunks };
            
            // Query both filters in parallel with chunking
            const [outgoingResult, incomingResult] = await Promise.all([
                queryEventsWithRetry(tokenContract, outgoingFilter, chunks, progressTracker),
                queryEventsWithRetry(tokenContract, incomingFilter, chunks, progressTracker),
            ]);
            
            outgoingEvents = outgoingResult.events;
            incomingEvents = incomingResult.events;
            
            // Combine chunk statistics from both queries
            const combinedStats = new Map<number, {
                chunks: number;
                firstTrySuccesses: number;
                attempts: number;
                successes: number;
            }>();
            
            // Merge statistics from both queries
            for (const [size, stats] of outgoingResult.chunkStats.entries()) {
                combinedStats.set(size, { ...stats });
            }
            
            for (const [size, stats] of incomingResult.chunkStats.entries()) {
                const existing = combinedStats.get(size);
                if (existing) {
                    existing.chunks += stats.chunks;
                    existing.firstTrySuccesses += stats.firstTrySuccesses;
                    existing.attempts += stats.attempts;
                    existing.successes += stats.successes;
                } else {
                    combinedStats.set(size, { ...stats });
                }
            }
            
            // Convert Map to array of ChunkStatistics with calculated rates
            chunkStatistics = Array.from(combinedStats.entries()).map(([chunkSize, stats]) => ({
                chunkSize,
                chunks: stats.chunks,
                firstTrySuccesses: stats.firstTrySuccesses,
                totalSuccesses: stats.successes, // Actual successes at this chunk size
                firstTryRate: stats.chunks > 0 ? (stats.firstTrySuccesses / stats.chunks) * 100 : 0,
                totalRate: stats.chunks > 0 ? (stats.successes / stats.chunks) * 100 : 0,
            })).filter(stat => stat.chunks > 0);
        }

        // Separate claim events from rescue events
        const claimEvents: (ethers.EventLog | ethers.Log)[] = [];
        const rescueEvents: (ethers.EventLog | ethers.Log)[] = [];
        
        for (const event of outgoingEvents) {
            if ('args' in event && event.args && contractOwner) {
                // Check if the recipient is the contract owner (rescue transaction)
                if (event.args.to && event.args.to.toLowerCase() === contractOwner.toLowerCase()) {
                    rescueEvents.push(event);
                } else {
                    claimEvents.push(event);
                }
            } else {
                // If we can't determine the owner, treat all as claims
                claimEvents.push(event);
            }
        }

        console.log(`\n   - Found ${claimEvents.length} claim events, ${rescueEvents.length} rescue events, and ${incomingEvents.length} funding events`);

        // Aggregate data with test/production classification
        const config = testConfig || this.DEFAULT_TEST_CONFIG;
        const claimData = this.aggregateClaimDataWithClassification(claimEvents, decimals, config);
        const fundingData = this.aggregateFundingDataWithClassification(incomingEvents, decimals, config);
        const rescueData = await this.aggregateRescueData(rescueEvents, decimals, provider);

        // Get remaining balance
        const remainingBalance = await this.getRemainingBalance(
            tokenContract,
            dropContractAddress,
            decimals,
        );

        // Calculate percentages
        const claimedPercentage = Number(fundingData.totalAmount) > 0
            ? ((Number(claimData.totalAmount) / Number(fundingData.totalAmount)) * 100).toFixed(1)
            : '0.0';
        const remainingPercentage = Number(fundingData.totalAmount) > 0
            ? ((Number(remainingBalance) / Number(fundingData.totalAmount)) * 100).toFixed(1)
            : '0.0';

        // Get timeline (only from actual claim events, not rescues)
        const timeline = await this.getTimeline(claimEvents, provider);

        // Prepare test and production statistics if there's a mix
        let testStatistics;
        let productionStatistics;

        if (claimData.testCount > 0 || fundingData.testCount > 0) {
            // Calculate test statistics
            const testClaimedPercentage = Number(fundingData.testAmount) > 0
                ? ((Number(claimData.testAmount) / Number(fundingData.testAmount)) * 100).toFixed(1)
                : '0.0';

            testStatistics = {
                totalFunded: fundingData.testAmount,
                totalClaims: claimData.testCount,
                totalClaimed: claimData.testAmount,
                claimedPercentage: testClaimedPercentage,
                topFunders: fundingData.testTopFunders,
            };

            // Calculate production statistics
            const prodClaimedPercentage = Number(fundingData.productionAmount) > 0
                ? ((Number(claimData.productionAmount) / Number(fundingData.productionAmount)) * 100).toFixed(1)
                : '0.0';

            productionStatistics = {
                totalFunded: fundingData.productionAmount,
                totalClaims: claimData.productionCount,
                totalClaimed: claimData.productionAmount,
                claimedPercentage: prodClaimedPercentage,
                topFunders: fundingData.productionTopFunders,
            };
        }

        return {
            totalFunded: fundingData.totalAmount,
            totalClaims: claimData.count,
            totalClaimed: claimData.totalAmount,
            remainingBalance,
            claimedPercentage,
            remainingPercentage,
            topFunders: fundingData.topFunders,
            timeline,
            symbol,
            decimals,
            chunkStatistics,
            rescuedAmount: rescueData.totalAmount,
            rescueTransactions: rescueData.transactions,
            testStatistics,
            productionStatistics,
        };
    }

    /**
     * Create chunks for block range queries
     */
    private static createChunks (
        startBlock: number,
        endBlock: number,
        chunkSize: number,
    ): Array<{ from: number; to: number }> {
        const chunks = [];
        for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += chunkSize) {
            const toBlock = Math.min(fromBlock + chunkSize - 1, endBlock);
            chunks.push({ from: fromBlock, to: toBlock });
        }
        return chunks;
    }

    /**
     * Aggregate claim data from outgoing transfer events with test/production classification
     */
    private static aggregateClaimDataWithClassification (
        events: (ethers.EventLog | ethers.Log)[],
        decimals: number,
        config: TestDetectionConfig,
    ): {
        count: number;
        totalAmount: string;
        testCount: number;
        testAmount: string;
        productionCount: number;
        productionAmount: string;
    } {
        let totalAmount = BigInt(0);
        let testAmount = BigInt(0);
        let productionAmount = BigInt(0);
        let testCount = 0;
        let productionCount = 0;

        for (const event of events) {
            if ('args' in event && event.args && event.args.value) {
                const amount = BigInt(event.args.value.toString());
                totalAmount += amount;

                // Classify as test or production based on CLAIM thresholds
                const amountInTokens = Number(ethers.formatUnits(amount.toString(), decimals));
                if (this.isTestClaim(amountInTokens, config)) {
                    testAmount += amount;
                    testCount++;
                } else {
                    productionAmount += amount;
                    productionCount++;
                }
            }
        }

        return {
            count: events.length,
            totalAmount: ethers.formatUnits(totalAmount.toString(), decimals),
            testCount,
            testAmount: ethers.formatUnits(testAmount.toString(), decimals),
            productionCount,
            productionAmount: ethers.formatUnits(productionAmount.toString(), decimals),
        };
    }

    /**
     * Aggregate funding data from incoming transfer events with test/production classification
     */
    private static aggregateFundingDataWithClassification (
        events: (ethers.EventLog | ethers.Log)[],
        decimals: number,
        config: TestDetectionConfig,
    ): {
        totalAmount: string;
        topFunders: FundingTransaction[];
        testCount: number;
        testAmount: string;
        testTopFunders: FundingTransaction[];
        productionCount: number;
        productionAmount: string;
        productionTopFunders: FundingTransaction[];
    } {
        let totalAmount = BigInt(0);
        let testAmount = BigInt(0);
        let productionAmount = BigInt(0);
        let testCount = 0;
        let productionCount = 0;

        const allFundingTransfers: Array<{
            from: string;
            amount: bigint;
            blockNumber: number;
            isTest: boolean;
        }> = [];

        for (const event of events) {
            if ('args' in event && event.args && event.args.value) {
                const amount = BigInt(event.args.value.toString());
                totalAmount += amount;

                // Classify as test or production based on FUNDING thresholds
                const amountInTokens = Number(ethers.formatUnits(amount.toString(), decimals));
                const isTest = this.isTestFunding(amountInTokens, config);

                if (isTest) {
                    testAmount += amount;
                    testCount++;
                } else {
                    productionAmount += amount;
                    productionCount++;
                }

                allFundingTransfers.push({
                    from: event.args.from,
                    amount,
                    blockNumber: event.blockNumber || 0,
                    isTest,
                });
            }
        }

        // Sort all funders
        allFundingTransfers.sort((a, b) => {
            if (a.amount > b.amount) return -1;
            if (a.amount < b.amount) return 1;
            return 0;
        });

        // Get top 5 overall funders
        const topFunders = allFundingTransfers
            .slice(0, 5)
            .map(f => ({
                from: f.from,
                amount: ethers.formatUnits(f.amount.toString(), decimals),
                blockNumber: f.blockNumber,
                isTest: f.isTest,
            }));

        // Get top test funders
        const testFunders = allFundingTransfers.filter(f => f.isTest);
        const testTopFunders = testFunders
            .slice(0, 5)
            .map(f => ({
                from: f.from,
                amount: ethers.formatUnits(f.amount.toString(), decimals),
                blockNumber: f.blockNumber,
                isTest: true,
            }));

        // Get top production funders
        const productionFunders = allFundingTransfers.filter(f => !f.isTest);
        const productionTopFunders = productionFunders
            .slice(0, 5)
            .map(f => ({
                from: f.from,
                amount: ethers.formatUnits(f.amount.toString(), decimals),
                blockNumber: f.blockNumber,
                isTest: false,
            }));

        return {
            totalAmount: ethers.formatUnits(totalAmount.toString(), decimals),
            topFunders,
            testCount,
            testAmount: ethers.formatUnits(testAmount.toString(), decimals),
            testTopFunders,
            productionCount,
            productionAmount: ethers.formatUnits(productionAmount.toString(), decimals),
            productionTopFunders,
        };
    }

    /**
     * Aggregate rescue data from rescue transfer events
     */
    private static async aggregateRescueData (
        events: (ethers.EventLog | ethers.Log)[],
        decimals: number,
        provider: ethers.Provider,
    ): Promise<{ totalAmount: string; transactions: RescueTransaction[] }> {
        let totalAmount = BigInt(0);
        const transactions: RescueTransaction[] = [];

        for (const event of events) {
            if ('args' in event && event.args && event.args.value) {
                const amount = BigInt(event.args.value.toString());
                totalAmount += amount;

                const rescueTx: RescueTransaction = {
                    amount: ethers.formatUnits(amount.toString(), decimals),
                    blockNumber: event.blockNumber || 0,
                };

                // Try to get timestamp
                if (event.blockNumber) {
                    try {
                        const block = await provider.getBlock(event.blockNumber);
                        if (block && block.timestamp) {
                            rescueTx.timestamp = new Date(block.timestamp * 1000);
                        }
                    } catch {
                        // Skip timestamp if block info can't be fetched
                    }
                }

                transactions.push(rescueTx);
            }
        }

        return {
            totalAmount: ethers.formatUnits(totalAmount.toString(), decimals),
            transactions,
        };
    }

    /**
     * Get remaining balance on the contract
     */
    private static async getRemainingBalance (
        tokenContract: ethers.Contract,
        contractAddress: string,
        decimals: number,
    ): Promise<string> {
        try {
            const balance = await tokenContract.balanceOf(contractAddress);
            return ethers.formatUnits(balance.toString(), decimals);
        } catch {
            return '0';
        }
    }

    /**
     * Get timeline information from claim events
     */
    private static async getTimeline (
        events: (ethers.EventLog | ethers.Log)[],
        provider: ethers.Provider,
    ): Promise<{ firstClaim?: ClaimInfo; lastClaim?: ClaimInfo }> {
        const timeline: { firstClaim?: ClaimInfo; lastClaim?: ClaimInfo } = {};

        if (events.length > 0) {
            const firstEvent = events[0];
            const lastEvent = events[events.length - 1];

            if (firstEvent.blockNumber) {
                try {
                    const block = await provider.getBlock(firstEvent.blockNumber);
                    if (block && block.timestamp) {
                        timeline.firstClaim = {
                            blockNumber: firstEvent.blockNumber,
                            timestamp: new Date(block.timestamp * 1000),
                        };
                    }
                } catch {
                    // Skip if block info can't be fetched
                }
            }

            if (lastEvent.blockNumber && events.length > 1) {
                try {
                    const block = await provider.getBlock(lastEvent.blockNumber);
                    if (block && block.timestamp) {
                        timeline.lastClaim = {
                            blockNumber: lastEvent.blockNumber,
                            timestamp: new Date(block.timestamp * 1000),
                        };
                    }
                } catch {
                    // Skip if block info can't be fetched
                }
            }
        }

        return timeline;
    }

    /**
     * Collect on-chain statistics for multiple deployed drop contracts
     */
    static async collectStatisticsForMultipleDrops (
        dropConfigs: DropConfig[],
        provider: ethers.Provider,
        testConfig?: TestDetectionConfig,
    ): Promise<MultiDropStatistics> {
        if (dropConfigs.length === 0) {
            throw new Error('No drop configurations provided');
        }

        // Find the minimum deployment block across all drops
        const startBlock = Math.min(...dropConfigs.map(d => d.deploymentBlock || 0));
        
        // Get current block
        const currentBlock = await provider.getBlockNumber();
        
        // Assume all drops use the same token (typical case)
        // If different tokens are used, we'd need to handle that separately
        const tokenAddress = dropConfigs[0].tokenAddress;
        
        // Connect to token contract
        const tokenABI = [
            'event Transfer(address indexed from, address indexed to, uint256 value)',
            'function decimals() external view returns (uint8)',
            'function symbol() external view returns (string)',
            'function balanceOf(address) external view returns (uint256)',
        ];
        const tokenContract = new ethers.Contract(tokenAddress, tokenABI, provider);

        // Get token details
        let decimals = 18;
        let symbol = 'tokens';
        try {
            decimals = await tokenContract.decimals();
            symbol = await tokenContract.symbol();
        } catch {
            // Use defaults if token details can't be fetched
        }

        // Create a map of contract addresses for quick lookup
        const contractAddressMap = new Map<string, DropConfig>();
        for (const config of dropConfigs) {
            contractAddressMap.set(config.contractAddress.toLowerCase(), config);
        }

        console.log(`   - Querying Transfer events for ${dropConfigs.length} drop contracts...`);
        console.log(`   - Scanning from block ${startBlock} to ${currentBlock}`);
        
        // Query all transfer events in the range
        const transferFilter = tokenContract.filters.Transfer();
        let allEvents: (ethers.EventLog | ethers.Log)[] = [];
        let chunkStatistics: ChunkStatistics[] | undefined;
        
        try {
            // Try direct query first
            console.log('   - Attempting direct query for all transfers...');
            allEvents = await tokenContract.queryFilter(transferFilter, startBlock, 'latest');
        } catch {
            // If direct query fails, use chunked query
            console.log('   - Using chunked queries...');
            const chunks = this.createChunks(startBlock, currentBlock, CHUNK_SIZE_FALLBACK_SEQUENCE[0]);
            console.log(`   - Processing ${chunks.length} chunks...`);
            
            const progressTracker = { completed: 0, total: chunks.length };
            const result = await queryEventsWithRetry(tokenContract, transferFilter, chunks, progressTracker);
            
            allEvents = result.events;
            
            // Convert chunk statistics
            chunkStatistics = Array.from(result.chunkStats.entries()).map(([chunkSize, stats]) => ({
                chunkSize,
                chunks: stats.chunks,
                firstTrySuccesses: stats.firstTrySuccesses,
                totalSuccesses: stats.successes,
                firstTryRate: stats.chunks > 0 ? (stats.firstTrySuccesses / stats.chunks) * 100 : 0,
                totalRate: stats.chunks > 0 ? (stats.successes / stats.chunks) * 100 : 0,
            })).filter(stat => stat.chunks > 0);
        }

        console.log(`\n   - Found ${allEvents.length} total transfer events`);

        // Initialize statistics for each drop
        const multiStats: MultiDropStatistics = {};
        const dropEventData: Map<string, {
            outgoingEvents: (ethers.EventLog | ethers.Log)[];
            incomingEvents: (ethers.EventLog | ethers.Log)[];
            contractOwner: string | null;
        }> = new Map();

        // Get contract owners for each drop
        const dropContractABI = ['function owner() external view returns (address)'];
        for (const config of dropConfigs) {
            let contractOwner: string | null = null;
            try {
                const dropContract = new ethers.Contract(config.contractAddress, dropContractABI, provider);
                contractOwner = await dropContract.owner();
            } catch {
                // Contract might not have an owner function
            }
            
            dropEventData.set(config.contractAddress.toLowerCase(), {
                outgoingEvents: [],
                incomingEvents: [],
                contractOwner,
            });
        }

        // Distribute events to appropriate drops
        for (const event of allEvents) {
            if ('args' in event && event.args) {
                const from = event.args.from?.toLowerCase();
                const to = event.args.to?.toLowerCase();
                
                // Check if this is an outgoing transfer from any drop contract
                if (from && dropEventData.has(from)) {
                    dropEventData.get(from)!.outgoingEvents.push(event);
                }
                
                // Check if this is an incoming transfer to any drop contract
                if (to && dropEventData.has(to)) {
                    dropEventData.get(to)!.incomingEvents.push(event);
                }
            }
        }

        // Process statistics for each drop
        const config = testConfig || this.DEFAULT_TEST_CONFIG;
        
        for (const [contractAddress, eventData] of dropEventData.entries()) {
            const dropConfig = contractAddressMap.get(contractAddress)!;
            
            // Separate claim events from rescue events
            const claimEvents: (ethers.EventLog | ethers.Log)[] = [];
            const rescueEvents: (ethers.EventLog | ethers.Log)[] = [];
            
            for (const event of eventData.outgoingEvents) {
                if ('args' in event && event.args && eventData.contractOwner) {
                    if (event.args.to && event.args.to.toLowerCase() === eventData.contractOwner.toLowerCase()) {
                        rescueEvents.push(event);
                    } else {
                        claimEvents.push(event);
                    }
                } else {
                    claimEvents.push(event);
                }
            }

            console.log(`   - Drop v${dropConfig.version}: ${claimEvents.length} claims, ${rescueEvents.length} rescues, ${eventData.incomingEvents.length} funding events`);

            // Aggregate data
            const claimData = this.aggregateClaimDataWithClassification(claimEvents, decimals, config);
            const fundingData = this.aggregateFundingDataWithClassification(eventData.incomingEvents, decimals, config);
            const rescueData = await this.aggregateRescueData(rescueEvents, decimals, provider);

            // Get remaining balance
            const remainingBalance = await this.getRemainingBalance(
                tokenContract,
                dropConfig.contractAddress,
                decimals,
            );

            // Calculate percentages
            const claimedPercentage = Number(fundingData.totalAmount) > 0
                ? ((Number(claimData.totalAmount) / Number(fundingData.totalAmount)) * 100).toFixed(1)
                : '0.0';
            const remainingPercentage = Number(fundingData.totalAmount) > 0
                ? ((Number(remainingBalance) / Number(fundingData.totalAmount)) * 100).toFixed(1)
                : '0.0';

            // Get timeline
            const timeline = await this.getTimeline(claimEvents, provider);

            // Prepare test and production statistics if there's a mix
            let testStatistics;
            let productionStatistics;

            if (claimData.testCount > 0 || fundingData.testCount > 0) {
                const testClaimedPercentage = Number(fundingData.testAmount) > 0
                    ? ((Number(claimData.testAmount) / Number(fundingData.testAmount)) * 100).toFixed(1)
                    : '0.0';

                testStatistics = {
                    totalFunded: fundingData.testAmount,
                    totalClaims: claimData.testCount,
                    totalClaimed: claimData.testAmount,
                    claimedPercentage: testClaimedPercentage,
                    topFunders: fundingData.testTopFunders,
                };

                const prodClaimedPercentage = Number(fundingData.productionAmount) > 0
                    ? ((Number(claimData.productionAmount) / Number(fundingData.productionAmount)) * 100).toFixed(1)
                    : '0.0';

                productionStatistics = {
                    totalFunded: fundingData.productionAmount,
                    totalClaims: claimData.productionCount,
                    totalClaimed: claimData.productionAmount,
                    claimedPercentage: prodClaimedPercentage,
                    topFunders: fundingData.productionTopFunders,
                };
            }

            multiStats[dropConfig.contractAddress] = {
                version: dropConfig.version,
                totalFunded: fundingData.totalAmount,
                totalClaims: claimData.count,
                totalClaimed: claimData.totalAmount,
                remainingBalance,
                claimedPercentage,
                remainingPercentage,
                topFunders: fundingData.topFunders,
                timeline,
                symbol,
                decimals,
                chunkStatistics: chunkStatistics, // Include for all drops
                rescuedAmount: rescueData.totalAmount,
                rescueTransactions: rescueData.transactions,
                testStatistics,
                productionStatistics,
            };
        }

        return multiStats;
    }

    /**
     * Format multi-drop statistics for display
     */
    static formatMultiDropStatisticsOutput (multiStats: MultiDropStatistics): void {
        const drops = Object.values(multiStats);
        
        if (drops.length === 0) {
            console.log('\n📊 No statistics to display');
            return;
        }

        // If only one drop, use the original formatting
        if (drops.length === 1) {
            const stats = drops[0];
            const output = this.formatStatisticsOutput(stats);
            output.forEach(line => console.log(line));
            return;
        }

        // Multiple drops - show comparison table (production data only)
        console.log('\n📊 Multi-Drop Statistics Comparison (Production):');
        console.log('');
        
        // Helper function to format numbers with commas
        const fmt = (num: string | number) => Number(num).toLocaleString();
        
        // Create comparison table with new columns
        console.log('   ┌─────────┬──────────────┬────────┬──────────────┬──────────────┬─────────┐');
        console.log('   │ Version │ Funded       │ Claims │ Amount       │ Remaining    │ Claimed │');
        console.log('   ├─────────┼──────────────┼────────┼──────────────┼──────────────┼─────────┤');
        
        let totalFunded = 0;
        let totalClaims = 0;
        let totalClaimed = 0;
        let totalRemaining = 0;
        
        for (const stats of drops) {
            // Use production statistics if available, otherwise use total statistics
            const funded = stats.productionStatistics ? Number(stats.productionStatistics.totalFunded) : Number(stats.totalFunded);
            const claims = stats.productionStatistics ? stats.productionStatistics.totalClaims : stats.totalClaims;
            const claimed = stats.productionStatistics ? Number(stats.productionStatistics.totalClaimed) : Number(stats.totalClaimed);
            const claimedPct = stats.productionStatistics ? stats.productionStatistics.claimedPercentage : stats.claimedPercentage;
            
            // Calculate remaining for production data
            const remaining = funded - claimed;
            
            const version = `v${stats.version}`.padEnd(7);
            const fundedStr = fmt(funded).padEnd(12);
            const claimsStr = claims.toLocaleString().padEnd(6);
            const claimedStr = fmt(claimed).padEnd(12);
            const remainingStr = fmt(remaining).padEnd(12);
            const claimedPctStr = `${claimedPct}%`.padEnd(7);
            
            console.log(`   │ ${version} │ ${fundedStr} │ ${claimsStr} │ ${claimedStr} │ ${remainingStr} │ ${claimedPctStr} │`);
            
            totalFunded += funded;
            totalClaims += claims;
            totalClaimed += claimed;
            totalRemaining += remaining;
        }
        
        // Add totals row
        console.log('   ├─────────┼──────────────┼────────┼──────────────┼──────────────┼─────────┤');
        
        const totalClaimedPct = totalFunded > 0 ? ((totalClaimed / totalFunded) * 100).toFixed(1) : '0.0';
        
        const totalRow = 'TOTAL'.padEnd(7);
        const totalFundedStr = fmt(totalFunded.toFixed(0)).padEnd(12);
        const totalClaimsStr = totalClaims.toLocaleString().padEnd(6);
        const totalClaimedStr = fmt(totalClaimed.toFixed(0)).padEnd(12);
        const totalRemainingStr = fmt(totalRemaining.toFixed(0)).padEnd(12);
        const totalClaimedPctStr = `${totalClaimedPct}%`.padEnd(7);
        
        console.log(`   │ ${totalRow} │ ${totalFundedStr} │ ${totalClaimsStr} │ ${totalClaimedStr} │ ${totalRemainingStr} │ ${totalClaimedPctStr} │`);
        console.log('   └─────────┴──────────────┴────────┴──────────────┴──────────────┴─────────┘');
        
        // Show individual drop details with full sections like single drop
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        for (const stats of drops) {
            console.log(`\n📍 Drop Version ${stats.version}:`);
            console.log('─'.repeat(50));
            
            // Use the existing formatStatisticsOutput method but exclude query performance stats
            const formattedOutput = this.formatStatisticsOutput(stats);
            
            // Output each line but skip the Query Performance Statistics section
            let skipSection = false;
            formattedOutput.forEach(line => {
                // Start skipping when we hit Query Performance Statistics
                if (line.includes('📈 Query Performance Statistics:')) {
                    skipSection = true;
                    return;
                }
                // Stop skipping after the optimal chunk size line
                if (skipSection && line.includes('Optimal chunk size:')) {
                    return; // Skip this line too and stop skipping after
                }
                // Reset skip flag after the section
                if (skipSection && line.trim() === '') {
                    skipSection = false;
                    return;
                }
                
                // Output the line if not in skip section
                if (!skipSection) {
                    console.log(line);
                }
            });
        }
        
        // Show query performance statistics if available
        // Use the first drop's statistics as they all share the same query
        const firstDrop = drops[0];
        if (firstDrop.chunkStatistics && firstDrop.chunkStatistics.length > 0) {
            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('\n📈 Query Performance Statistics:');
            console.log('   Chunk Size | Chunks | 1st Try | Total | 1st Rate | Total Rate');
            console.log('   -----------|--------|---------|-------|----------|------------');
            
            const sortedStats = [...firstDrop.chunkStatistics].sort((a, b) => b.chunkSize - a.chunkSize);
            
            sortedStats.forEach(stat => {
                const chunkSizeStr = stat.chunkSize.toLocaleString().padEnd(10);
                const chunksStr = stat.chunks.toString().padEnd(6);
                const firstTryStr = stat.firstTrySuccesses.toString().padEnd(7);
                const totalStr = stat.totalSuccesses.toString().padEnd(5);
                const firstRateStr = `${stat.firstTryRate.toFixed(1)}%`.padEnd(8);
                const totalRateStr = `${stat.totalRate.toFixed(1)}%`;
                console.log(`   ${chunkSizeStr} | ${chunksStr} | ${firstTryStr} | ${totalStr} | ${firstRateStr} | ${totalRateStr}`);
            });
            
            // Find optimal chunk size
            const optimalChunk = sortedStats.reduce((best, current) => {
                // Prefer larger chunks with high first-try rates
                if (current.firstTryRate >= 90 && current.chunkSize > best.chunkSize) {
                    return current;
                }
                // If no high first-try rate chunks, pick the one with best rate
                if (current.firstTryRate > best.firstTryRate) {
                    return current;
                }
                return best;
            }, sortedStats[0]);
            
            if (optimalChunk) {
                console.log(`   \n   Optimal chunk size: ${optimalChunk.chunkSize.toLocaleString()} blocks (${optimalChunk.firstTryRate.toFixed(1)}% first-try success rate)`);
            }
        }
    }

    /**
     * Format statistics for display
     */
    static formatStatisticsOutput (stats: StatisticsData): string[] {
        const output: string[] = [];

        // 1. STATISTICS TABLE (if test/production breakdown exists)
        if (stats.testStatistics && stats.productionStatistics) {
            output.push('\n📊 Statistics Breakdown:');
            output.push('');
            
            // Helper function to format numbers with commas
            const fmt = (num: string | number) => Number(num).toLocaleString();
            
            // Calculate column widths for better alignment
            const testFunded = fmt(stats.testStatistics.totalFunded);
            const prodFunded = fmt(stats.productionStatistics.totalFunded);
            const totalFunded = fmt(stats.totalFunded);
            
            const testClaims = stats.testStatistics.totalClaims.toLocaleString();
            const prodClaims = stats.productionStatistics.totalClaims.toLocaleString();
            const totalClaims = stats.totalClaims.toLocaleString();
            
            const testClaimed = `${fmt(stats.testStatistics.totalClaimed)} (${stats.testStatistics.claimedPercentage}%)`;
            const prodClaimed = `${fmt(stats.productionStatistics.totalClaimed)} (${stats.productionStatistics.claimedPercentage}%)`;
            const totalClaimed = `${fmt(stats.totalClaimed)} (${stats.claimedPercentage}%)`;
            
            // Create the table
            output.push('   ┌────────────────┬─────────────────┬─────────────────┬─────────────────┐');
            output.push('   │ Parameter      │ Test 🧪         │ Production 🚀   │ Total           │');
            output.push('   ├────────────────┼─────────────────┼─────────────────┼─────────────────┤');
            output.push(`   │ Funded         │ ${testFunded.padEnd(15)} │ ${prodFunded.padEnd(15)} │ ${totalFunded.padEnd(15)} │`);
            output.push(`   │ Claims         │ ${testClaims.padEnd(15)} │ ${prodClaims.padEnd(15)} │ ${totalClaims.padEnd(15)} │`);
            output.push(`   │ Amount Claimed │ ${testClaimed.padEnd(15)} │ ${prodClaimed.padEnd(15)} │ ${totalClaimed.padEnd(15)} │`);
            output.push('   └────────────────┴─────────────────┴─────────────────┴─────────────────┘');

            // Add remaining balance info
            output.push('');
            output.push(`   Remaining Balance: ${fmt(stats.remainingBalance)} ${stats.symbol} (${stats.remainingPercentage}%)`);
            
        } else {
            // Original format without test/production breakdown
            output.push('\n📊 Claims Statistics:');
            output.push(`   - Total Funded: ${Number(stats.totalFunded).toLocaleString()} ${stats.symbol}`);
            output.push(`   - Total Claims: ${stats.totalClaims.toLocaleString()}`);
            output.push(`   - Total Amount Claimed: ${Number(stats.totalClaimed).toLocaleString()} ${stats.symbol} (${stats.claimedPercentage}%)`);
            output.push(`   - Remaining Balance: ${Number(stats.remainingBalance).toLocaleString()} ${stats.symbol} (${stats.remainingPercentage}%)`);
        }

        // 2. TOP FUNDING TRANSACTIONS (with test indicators)
        if (stats.topFunders.length > 0) {
            output.push('\n💰 Top Funding Transactions:');
            stats.topFunders.forEach((funder, i) => {
                const shortAddress = `${funder.from.slice(0, 6)}...${funder.from.slice(-4)}`;
                const testIndicator = funder.isTest ? ' 🧪' : '';
                output.push(`   ${i + 1}. ${Number(funder.amount).toLocaleString()} ${stats.symbol} from ${shortAddress} (Block ${funder.blockNumber})${testIndicator}`);
            });
        }

        // 3. RESCUE TRANSACTIONS
        if (stats.rescueTransactions.length > 0) {
            output.push('\n🚨 Rescue Transactions:');
            output.push(`   - Total Rescued: ${Number(stats.rescuedAmount).toLocaleString()} ${stats.symbol}`);
            stats.rescueTransactions.forEach((rescue, i) => {
                const timestampStr = rescue.timestamp ? ` at ${rescue.timestamp.toISOString()}` : '';
                output.push(`   ${i + 1}. ${Number(rescue.amount).toLocaleString()} ${stats.symbol} (Block ${rescue.blockNumber}${timestampStr})`);
            });
        }

        // 4. TIMELINE
        if (stats.timeline.firstClaim || stats.timeline.lastClaim) {
            output.push('\n📅 Timeline:');
            if (stats.timeline.firstClaim) {
                output.push(`   - First Claim: Block ${stats.timeline.firstClaim.blockNumber} (${stats.timeline.firstClaim.timestamp.toISOString()})`);
            }
            if (stats.timeline.lastClaim) {
                output.push(`   - Last Claim: Block ${stats.timeline.lastClaim.blockNumber} (${stats.timeline.lastClaim.timestamp.toISOString()})`);
            }
        }

        // 5. QUERY PERFORMANCE STATISTICS
        if (stats.chunkStatistics && stats.chunkStatistics.length > 0) {
            output.push('\n📈 Query Performance Statistics:');
            output.push('   Chunk Size | Chunks | 1st Try | Total | 1st Rate | Total Rate');
            output.push('   -----------|--------|---------|-------|----------|------------');
            
            // Sort by chunk size descending
            const sortedStats = [...stats.chunkStatistics].sort((a, b) => b.chunkSize - a.chunkSize);
            
            sortedStats.forEach(stat => {
                const chunkSizeStr = stat.chunkSize.toLocaleString().padEnd(10);
                const chunksStr = stat.chunks.toString().padEnd(6);
                const firstTryStr = stat.firstTrySuccesses.toString().padEnd(7);
                const totalStr = stat.totalSuccesses.toString().padEnd(5);
                const firstRateStr = `${stat.firstTryRate.toFixed(1)}%`.padEnd(8);
                const totalRateStr = `${stat.totalRate.toFixed(1)}%`;
                output.push(`   ${chunkSizeStr} | ${chunksStr} | ${firstTryStr} | ${totalStr} | ${firstRateStr} | ${totalRateStr}`);
            });
            
            // Find optimal chunk size (highest first-try rate with reasonable chunks)
            const optimalChunk = sortedStats.reduce((best, current) => {
                // Prefer larger chunks with high first-try rates
                if (current.firstTryRate >= 90 && current.chunkSize > best.chunkSize) {
                    return current;
                }
                // If no high first-try rate chunks, pick the one with best rate
                if (current.firstTryRate > best.firstTryRate) {
                    return current;
                }
                return best;
            }, sortedStats[0]);
            
            if (optimalChunk) {
                output.push(`   \n   Optimal chunk size: ${optimalChunk.chunkSize.toLocaleString()} blocks (${optimalChunk.firstTryRate.toFixed(1)}% first-try success rate)`);
            }
        }

        return output;
    }
}
