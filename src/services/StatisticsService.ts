import { ethers } from 'ethers';

// Interfaces for statistics data
export interface FundingTransaction {
    from: string;
    amount: string;
    blockNumber: number;
}

export interface ClaimInfo {
    blockNumber: number;
    timestamp: Date;
}

export interface ChunkStatistics {
    chunkSize: number;
    attempts: number;
    successes: number;
    successRate: number;
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
}

interface EventQueryResult {
    events: any[];
    failed: boolean;
    chunk?: any;
    failedRanges?: string[];
}

export class StatisticsService {
    /**
     * Collect on-chain statistics for a deployed drop contract
     */
    static async collectStatistics(
        dropContractAddress: string,
        tokenAddress: string,
        provider: ethers.Provider,
        startBlock: number = 0,
    ): Promise<StatisticsData> {
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

        // Query ALL Transfer events for the token (more efficient than two separate queries)
        const allTransferFilter = tokenContract.filters.Transfer(null, null, null);
        
        let allEvents;
        let chunkStatistics: ChunkStatistics[] | undefined;

        try {
            // Try to query all at once first
            console.log(`   - Querying all Transfer events...`);
            allEvents = await tokenContract.queryFilter(allTransferFilter, startBlock, 'latest');
        } catch {
            // If full range fails, use batched queries
            console.log(`   - Using optimized parallel queries...`);
            const chunks = this.createChunks(startBlock, currentBlock, 50000);
            console.log(`   - Processing ${chunks.length} chunks (max 10 concurrent)...`);
            const result = await this.queryEventsWithRetry(tokenContract, allTransferFilter, chunks, provider);
            allEvents = result.events;
            
            // Convert Map to array of ChunkStatistics
            chunkStatistics = Array.from(result.chunkStats.entries()).map(([chunkSize, stats]) => ({
                chunkSize,
                attempts: stats.attempts,
                successes: stats.successes,
                successRate: stats.attempts > 0 ? (stats.successes / stats.attempts) * 100 : 0
            })).filter(stat => stat.attempts > 0); // Only include chunk sizes that were actually tried
        }

        // Filter events locally (much faster than making two separate RPC queries)
        const outgoingEvents = allEvents.filter(
            (event: any) => event.args && event.args.from && 
            event.args.from.toLowerCase() === dropContractAddress.toLowerCase()
        );
        
        const incomingEvents = allEvents.filter(
            (event: any) => event.args && event.args.to && 
            event.args.to.toLowerCase() === dropContractAddress.toLowerCase()
        );

        console.log(`   - Found ${outgoingEvents.length} claim events and ${incomingEvents.length} funding events`);

        // Aggregate data
        const claimData = this.aggregateClaimData(outgoingEvents, decimals);
        const fundingData = this.aggregateFundingData(incomingEvents, decimals);

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

        // Get timeline
        const timeline = await this.getTimeline(outgoingEvents, provider);

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
        };
    }

    /**
     * Create chunks for block range queries
     */
    private static createChunks(
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
     * Query events with retry logic and parallel processing
     */
    private static async queryEventsWithRetry(
        tokenContract: ethers.Contract,
        filter: any,
        chunks: Array<{ from: number; to: number }>,
        provider: ethers.Provider,
    ): Promise<{ events: any[]; chunkStats: Map<number, { attempts: number; successes: number }> }> {
        const maxConcurrent = 10;
        const events: any[] = [];
        const failedChunks: { chunk: any; failedRanges: string[] }[] = [];
        let completedChunks = 0;
        const totalChunks = chunks.length;
        
        // Track statistics for each chunk size
        const chunkStats = new Map<number, { attempts: number; successes: number }>();
        [50000, 10000, 5000, 1000, 100].forEach(size => {
            chunkStats.set(size, { attempts: 0, successes: 0 });
        });

        for (let i = 0; i < chunks.length; i += maxConcurrent) {
            const batch = chunks.slice(i, Math.min(i + maxConcurrent, chunks.length));

            const batchPromises = batch.map(async (chunk): Promise<EventQueryResult & { successfulChunkSize?: number }> => {
                const retries = 3;
                const ranges = [50000, 10000, 5000, 1000];
                let successfulChunkSize: number | undefined;

                // Try with progressively smaller ranges
                for (const range of ranges) {
                    if (chunk.to - chunk.from + 1 <= range) {
                        for (let attempt = 0; attempt < retries; attempt++) {
                            const stats = chunkStats.get(range)!;
                            stats.attempts++;
                            
                            try {
                                const chunkEvents = await tokenContract.queryFilter(
                                    filter,
                                    chunk.from,
                                    chunk.to,
                                );
                                stats.successes++;
                                successfulChunkSize = range;
                                completedChunks++;
                                process.stdout.write(`\r   - Progress: ${completedChunks}/${totalChunks} chunks completed`);
                                return { events: chunkEvents, failed: false, successfulChunkSize };
                            } catch {
                                if (attempt < retries - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
                                }
                            }
                        }
                    }
                }

                // Fallback to smaller chunks
                const smallerEvents = await this.queryWithSmallChunks(
                    tokenContract,
                    filter,
                    chunk.from,
                    chunk.to,
                    chunkStats,
                );

                completedChunks++;
                process.stdout.write(`\r   - Progress: ${completedChunks}/${totalChunks} chunks completed`);

                return {
                    events: smallerEvents.events,
                    failed: smallerEvents.failedRanges.length > 0,
                    chunk,
                    failedRanges: smallerEvents.failedRanges,
                };
            });

            const batchResults = await Promise.all(batchPromises);

            // Collect events and track failed chunks
            for (const result of batchResults) {
                events.push(...result.events);
                if (result.failed && result.chunk && result.failedRanges) {
                    failedChunks.push({ chunk: result.chunk, failedRanges: result.failedRanges });
                }
            }
        }

        // Final retry for failed chunks
        if (failedChunks.length > 0) {
            const recoveredEvents = await this.retryFailedChunks(
                tokenContract,
                filter,
                failedChunks,
                chunkStats,
            );
            events.push(...recoveredEvents);
        }

        process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear progress line
        return { events, chunkStats };
    }

    /**
     * Query with small chunks as fallback
     */
    private static async queryWithSmallChunks(
        tokenContract: ethers.Contract,
        filter: any,
        fromBlock: number,
        toBlock: number,
        chunkStats: Map<number, { attempts: number; successes: number }>,
    ): Promise<{ events: any[]; failedRanges: string[] }> {
        const smallerEvents = [];
        const failedRanges = [];
        const smallRange = 1000;
        const stats = chunkStats.get(1000)!;

        for (let from = fromBlock; from <= toBlock; from += smallRange) {
            const to = Math.min(from + smallRange - 1, toBlock);
            stats.attempts++;
            try {
                await new Promise(resolve => setTimeout(resolve, 100));
                const small = await tokenContract.queryFilter(filter, from, to);
                smallerEvents.push(...small);
                stats.successes++;
            } catch {
                failedRanges.push(`${from}-${to}`);
            }
        }

        return { events: smallerEvents, failedRanges };
    }

    /**
     * Retry failed chunks with even smaller ranges
     */
    private static async retryFailedChunks(
        tokenContract: ethers.Contract,
        filter: any,
        failedChunks: Array<{ chunk: any; failedRanges: string[] }>,
        chunkStats: Map<number, { attempts: number; successes: number }>,
    ): Promise<any[]> {
        console.log(`\n   - Retrying ${failedChunks.length} failed chunks with smaller ranges...`);
        const events = [];
        let recoveredCount = 0;
        const stats = chunkStats.get(100)!;

        for (const failed of failedChunks) {
            for (const rangeStr of failed.failedRanges) {
                const [fromStr, toStr] = rangeStr.split('-');
                const from = parseInt(fromStr);
                const to = parseInt(toStr);

                // Try with 100 block chunks
                for (let retryFrom = from; retryFrom <= to; retryFrom += 100) {
                    const retryTo = Math.min(retryFrom + 99, to);
                    stats.attempts++;
                    try {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        const retryEvents = await tokenContract.queryFilter(filter, retryFrom, retryTo);
                        events.push(...retryEvents);
                        recoveredCount += retryEvents.length;
                        stats.successes++;
                    } catch {
                        // Final failure - skip this range
                    }
                }
            }
        }

        if (recoveredCount > 0) {
            console.log(`   - Recovered ${recoveredCount} additional events from retry`);
        }

        return events;
    }

    /**
     * Aggregate claim data from outgoing transfer events
     */
    private static aggregateClaimData(
        events: any[],
        decimals: number,
    ): { count: number; totalAmount: string } {
        let totalAmount = BigInt(0);

        for (const event of events) {
            if (event.args && event.args.value) {
                totalAmount += BigInt(event.args.value.toString());
            }
        }

        return {
            count: events.length,
            totalAmount: ethers.formatUnits(totalAmount.toString(), decimals),
        };
    }

    /**
     * Aggregate funding data from incoming transfer events
     */
    private static aggregateFundingData(
        events: any[],
        decimals: number,
    ): { totalAmount: string; topFunders: FundingTransaction[] } {
        let totalAmount = BigInt(0);
        const fundingTransfers: Array<{
            from: string;
            amount: bigint;
            blockNumber: number;
        }> = [];

        for (const event of events) {
            if (event.args && event.args.value) {
                const amount = BigInt(event.args.value.toString());
                totalAmount += amount;

                fundingTransfers.push({
                    from: event.args.from,
                    amount,
                    blockNumber: event.blockNumber || 0,
                });
            }
        }

        // Sort and get top 5 funders
        const topFunders = fundingTransfers
            .sort((a, b) => {
                if (a.amount > b.amount) return -1;
                if (a.amount < b.amount) return 1;
                return 0;
            })
            .slice(0, 5)
            .map(f => ({
                from: f.from,
                amount: ethers.formatUnits(f.amount.toString(), decimals),
                blockNumber: f.blockNumber,
            }));

        return {
            totalAmount: ethers.formatUnits(totalAmount.toString(), decimals),
            topFunders,
        };
    }

    /**
     * Get remaining balance on the contract
     */
    private static async getRemainingBalance(
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
    private static async getTimeline(
        events: any[],
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
     * Format statistics for display
     */
    static formatStatisticsOutput(stats: StatisticsData): string[] {
        const output: string[] = [];

        output.push(`\n📊 Claims Statistics:`);
        output.push(`   - Total Funded: ${Number(stats.totalFunded).toLocaleString()} ${stats.symbol}`);
        output.push(`   - Total Claims: ${stats.totalClaims.toLocaleString()}`);
        output.push(`   - Total Amount Claimed: ${Number(stats.totalClaimed).toLocaleString()} ${stats.symbol} (${stats.claimedPercentage}%)`);
        output.push(`   - Remaining Balance: ${Number(stats.remainingBalance).toLocaleString()} ${stats.symbol} (${stats.remainingPercentage}%)`);

        // Display top funders if any
        if (stats.topFunders.length > 0) {
            output.push(`\n💰 Top Funding Transactions:`);
            stats.topFunders.forEach((funder, i) => {
                const shortAddress = `${funder.from.slice(0, 6)}...${funder.from.slice(-4)}`;
                output.push(`   ${i + 1}. ${Number(funder.amount).toLocaleString()} ${stats.symbol} from ${shortAddress} (Block ${funder.blockNumber})`);
            });
        }

        // Show timeline
        if (stats.timeline.firstClaim || stats.timeline.lastClaim) {
            output.push(`\n📅 Timeline:`);
            if (stats.timeline.firstClaim) {
                output.push(`   - First Claim: Block ${stats.timeline.firstClaim.blockNumber} (${stats.timeline.firstClaim.timestamp.toISOString()})`);
            }
            if (stats.timeline.lastClaim) {
                output.push(`   - Last Claim: Block ${stats.timeline.lastClaim.blockNumber} (${stats.timeline.lastClaim.timestamp.toISOString()})`);
            }
        }

        // Display chunk statistics if available
        if (stats.chunkStatistics && stats.chunkStatistics.length > 0) {
            output.push(`\n📈 Query Performance Statistics:`);
            output.push(`   Chunk Size | Attempts | Success | Rate`);
            output.push(`   -----------|----------|---------|-------`);
            
            // Sort by chunk size descending
            const sortedStats = [...stats.chunkStatistics].sort((a, b) => b.chunkSize - a.chunkSize);
            
            sortedStats.forEach(stat => {
                const chunkSizeStr = stat.chunkSize.toLocaleString().padEnd(10);
                const attemptsStr = stat.attempts.toString().padEnd(8);
                const successStr = stat.successes.toString().padEnd(7);
                const rateStr = `${stat.successRate.toFixed(1)}%`;
                output.push(`   ${chunkSizeStr} | ${attemptsStr} | ${successStr} | ${rateStr}`);
            });
            
            // Find optimal chunk size (highest success rate with reasonable attempts)
            const optimalChunk = sortedStats.reduce((best, current) => {
                // Prefer larger chunks with high success rates
                if (current.successRate >= 90 && current.chunkSize > best.chunkSize) {
                    return current;
                }
                // If no high success rate chunks, pick the one with best rate
                if (current.successRate > best.successRate) {
                    return current;
                }
                return best;
            }, sortedStats[0]);
            
            if (optimalChunk) {
                output.push(`   \n   Optimal chunk size: ${optimalChunk.chunkSize.toLocaleString()} blocks (${optimalChunk.successRate.toFixed(1)}% success rate)`);
            }
        }

        return output;
    }
}
