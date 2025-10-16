import { ethers } from 'ethers';

// Configurable chunk size fallback sequence (in blocks)
// Starts with largest size and falls back to smaller sizes on failure
// For Base network, smaller chunks work better due to high transaction volume
const CHUNK_SIZE_FALLBACK_SEQUENCE = [10000, 5000, 2500, 500, 100];

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
}

interface EventQueryResult {
    events: (ethers.EventLog | ethers.Log)[];
    failed: boolean;
    chunk?: { from: number; to: number };
    failedRanges?: string[];
}

export class StatisticsService {
    /**
     * Collect on-chain statistics for a deployed drop contract
     */
    static async collectStatistics (
        dropContractAddress: string,
        tokenAddress: string,
        provider: ethers.Provider,
        startBlock: number = 0,
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
                this.queryEventsWithRetry(tokenContract, outgoingFilter, chunks, progressTracker),
                this.queryEventsWithRetry(tokenContract, incomingFilter, chunks, progressTracker),
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

        console.log(`   - Found ${claimEvents.length} claim events, ${rescueEvents.length} rescue events, and ${incomingEvents.length} funding events`);

        // Aggregate data
        const claimData = this.aggregateClaimData(claimEvents, decimals);
        const fundingData = this.aggregateFundingData(incomingEvents, decimals);
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
     * Create a visual progress bar
     */
    private static createProgressBar (current: number, total: number, width: number = 20): string {
        const percentage = Math.min(100, Math.floor((current / total) * 100));
        const filled = Math.floor((percentage / 100) * width);
        const empty = width - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return `[${bar}] ${current}/${total} chunks (${percentage}%)`;
    }

    /**
     * Query events with retry logic and parallel processing
     */
    private static async queryEventsWithRetry (
        tokenContract: ethers.Contract,
        filter: ethers.ContractEventName,
        chunks: Array<{ from: number; to: number }>,
        progressTracker?: { completed: number; total: number },
    ): Promise<{ events: (ethers.EventLog | ethers.Log)[]; chunkStats: Map<number, {
        chunks: number;
        firstTrySuccesses: number;
        attempts: number;
        successes: number;
    }> }> {
        const maxConcurrent = 5; // Reduced to avoid overwhelming the RPC
        const events: (ethers.EventLog | ethers.Log)[] = [];
        const failedChunks: { chunk: { from: number; to: number }; failedRanges: string[] }[] = [];
        let completedChunks = 0;
        const totalChunks = chunks.length;
        
        // Track statistics for each chunk size
        const chunkStats = new Map<number, {
            chunks: number;
            firstTrySuccesses: number;
            attempts: number;
            successes: number
        }>();
        CHUNK_SIZE_FALLBACK_SEQUENCE.forEach(size => {
            chunkStats.set(size, {
                chunks: 0,
                firstTrySuccesses: 0,
                attempts: 0,
                successes: 0,
            });
        });

        for (let i = 0; i < chunks.length; i += maxConcurrent) {
            const batch = chunks.slice(i, Math.min(i + maxConcurrent, chunks.length));

            const batchPromises = batch.map(async (chunk): Promise<EventQueryResult & { successfulChunkSize?: number }> => {
                const retries = 3;
                const originalChunkSize = chunk.to - chunk.from + 1;

                // First, try with the original chunk size
                for (const targetSize of CHUNK_SIZE_FALLBACK_SEQUENCE) {
                    // For the first size that's >= original chunk size, try the whole chunk
                    if (targetSize >= originalChunkSize) {
                        const stats = chunkStats.get(targetSize)!;
                        
                        // Track this as a new chunk attempt
                        stats.chunks++;
                        // let succeeded = false;
                        
                        for (let attempt = 0; attempt < retries; attempt++) {
                            stats.attempts++;
                            
                            try {
                                const events = await tokenContract.queryFilter(filter, chunk.from, chunk.to);
                                stats.successes++;
                                
                                // Track first-try success only once per chunk
                                if (attempt === 0) {
                                    stats.firstTrySuccesses++;
                                }
                                // succeeded = true;
                                completedChunks++;
                                
                                // Update shared progress if available
                                if (progressTracker) {
                                    progressTracker.completed++;
                                    const progressBar = this.createProgressBar(progressTracker.completed, progressTracker.total);
                                    process.stdout.write(`\r   - ${progressBar}`);
                                } else {
                                    process.stdout.write(`\r   - Progress: ${completedChunks}/${totalChunks} chunks completed (size: ${originalChunkSize})`);
                                }
                                
                                return { events, failed: false, successfulChunkSize: targetSize };
                            } catch {
                                if (attempt < retries - 1) {
                                    await new Promise(resolve => global.setTimeout(resolve, 200 * (attempt + 1)));
                                }
                            }
                        }
                    } else {
                        // For smaller sizes, split the chunk
                        const subChunkEvents: (ethers.EventLog | ethers.Log)[] = [];
                        let allSucceeded = true;
                        
                        for (let from = chunk.from; from <= chunk.to; from += targetSize) {
                            const to = Math.min(from + targetSize - 1, chunk.to);
                            const stats = chunkStats.get(targetSize)!;
                            
                            // Track this as a new sub-chunk
                            stats.chunks++;
                            let succeeded = false;
                            
                            for (let attempt = 0; attempt < retries; attempt++) {
                                stats.attempts++;
                                
                                try {
                                    const events = await tokenContract.queryFilter(filter, from, to);
                                    subChunkEvents.push(...events);
                                    stats.successes++;
                                    
                                    // Track first-try success
                                    if (attempt === 0) {
                                        stats.firstTrySuccesses++;
                                    }
                                    succeeded = true;
                                    break;
                                } catch {
                                    if (attempt < retries - 1) {
                                        await new Promise(resolve => global.setTimeout(resolve, 200 * (attempt + 1)));
                                    }
                                }
                            }
                            
                            if (!succeeded) {
                                allSucceeded = false;
                                break; // Move to next smaller size
                            }
                        }
                        
                        if (allSucceeded) {
                            // Successfully queried all sub-chunks with this size
                            completedChunks++;
                            
                            // Update shared progress if available
                            if (progressTracker) {
                                progressTracker.completed++;
                                const progressBar = this.createProgressBar(progressTracker.completed, progressTracker.total);
                                process.stdout.write(`\r   - ${progressBar}`);
                            } else {
                                process.stdout.write(`\r   - Progress: ${completedChunks}/${totalChunks} chunks completed (size: ${targetSize})`);
                            }
                            
                            return { events: subChunkEvents, failed: false, successfulChunkSize: targetSize };
                        }
                    }
                }

                // Fallback to smaller chunks
                console.log(`\n   - Chunk ${chunk.from}-${chunk.to} falling back to smallest size (${CHUNK_SIZE_FALLBACK_SEQUENCE[CHUNK_SIZE_FALLBACK_SEQUENCE.length - 1]} blocks)...`);
                const smallerEvents = await this.queryWithSmallChunks(
                    tokenContract,
                    filter,
                    chunk.from,
                    chunk.to,
                    chunkStats,
                );

                completedChunks++;
                
                // Update shared progress if available
                if (progressTracker) {
                    progressTracker.completed++;
                    const progressBar = this.createProgressBar(progressTracker.completed, progressTracker.total);
                    process.stdout.write(`\r   - ${progressBar}`);
                } else {
                    process.stdout.write(`\r   - Progress: ${completedChunks}/${totalChunks} chunks completed`);
                }

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
    private static async queryWithSmallChunks (
        tokenContract: ethers.Contract,
        filter: ethers.ContractEventName,
        fromBlock: number,
        toBlock: number,
        chunkStats: Map<number, { attempts: number; successes: number }>,
    ): Promise<{ events: (ethers.EventLog | ethers.Log)[]; failedRanges: string[] }> {
        const smallerEvents: (ethers.EventLog | ethers.Log)[] = [];
        const failedRanges: string[] = [];
        
        // Use the smallest chunk size from the fallback sequence for final attempts
        const smallestChunkSize = CHUNK_SIZE_FALLBACK_SEQUENCE[CHUNK_SIZE_FALLBACK_SEQUENCE.length - 1];
        const stats = chunkStats.get(smallestChunkSize);
        
        if (!stats) {
            // If the smallest size isn't in stats, just return empty
            return { events: smallerEvents, failedRanges: [`${fromBlock}-${toBlock}`] };
        }

        for (let from = fromBlock; from <= toBlock; from += smallestChunkSize) {
            const to = Math.min(from + smallestChunkSize - 1, toBlock);
            stats.attempts++;
            try {
                await new Promise(resolve => global.setTimeout(resolve, 100));
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
    private static async retryFailedChunks (
        tokenContract: ethers.Contract,
        filter: ethers.ContractEventName,
        failedChunks: Array<{ chunk: { from: number; to: number }; failedRanges: string[] }>,
        chunkStats: Map<number, { attempts: number; successes: number }>,
    ): Promise<(ethers.EventLog | ethers.Log)[]> {
        console.log(`\n   - Retrying ${failedChunks.length} failed chunks with smaller ranges...`);
        const events: (ethers.EventLog | ethers.Log)[] = [];
        let recoveredCount = 0;
        
        // Use the smallest chunk size from the fallback sequence
        const smallestChunkSize = CHUNK_SIZE_FALLBACK_SEQUENCE[CHUNK_SIZE_FALLBACK_SEQUENCE.length - 1];
        const stats = chunkStats.get(smallestChunkSize);
        
        if (!stats) {
            console.log(`   - Warning: No statistics tracking for chunk size ${smallestChunkSize}`);
            return events;
        }

        for (const failed of failedChunks) {
            for (const rangeStr of failed.failedRanges) {
                const [fromStr, toStr] = rangeStr.split('-');
                const from = parseInt(fromStr);
                const to = parseInt(toStr);

                // Try with the smallest chunk size
                for (let retryFrom = from; retryFrom <= to; retryFrom += smallestChunkSize) {
                    const retryTo = Math.min(retryFrom + smallestChunkSize - 1, to);
                    stats.attempts++;
                    try {
                        await new Promise(resolve => global.setTimeout(resolve, 500));
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
    private static aggregateClaimData (
        events: (ethers.EventLog | ethers.Log)[],
        decimals: number,
    ): { count: number; totalAmount: string } {
        let totalAmount = BigInt(0);

        for (const event of events) {
            if ('args' in event && event.args && event.args.value) {
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
    private static aggregateFundingData (
        events: (ethers.EventLog | ethers.Log)[],
        decimals: number,
    ): { totalAmount: string; topFunders: FundingTransaction[] } {
        let totalAmount = BigInt(0);
        const fundingTransfers: Array<{
            from: string;
            amount: bigint;
            blockNumber: number;
        }> = [];

        for (const event of events) {
            if ('args' in event && event.args && event.args.value) {
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
     * Format statistics for display
     */
    static formatStatisticsOutput (stats: StatisticsData): string[] {
        const output: string[] = [];

        output.push('\n📊 Claims Statistics:');
        output.push(`   - Total Funded: ${Number(stats.totalFunded).toLocaleString()} ${stats.symbol}`);
        output.push(`   - Total Claims: ${stats.totalClaims.toLocaleString()}`);
        output.push(`   - Total Amount Claimed: ${Number(stats.totalClaimed).toLocaleString()} ${stats.symbol} (${stats.claimedPercentage}%)`);
        output.push(`   - Remaining Balance: ${Number(stats.remainingBalance).toLocaleString()} ${stats.symbol} (${stats.remainingPercentage}%)`);

        // Display rescue transactions if any
        if (stats.rescueTransactions.length > 0) {
            output.push('\n🚨 Rescue Transactions:');
            output.push(`   - Total Rescued: ${Number(stats.rescuedAmount).toLocaleString()} ${stats.symbol}`);
            stats.rescueTransactions.forEach((rescue, i) => {
                const timestampStr = rescue.timestamp ? ` at ${rescue.timestamp.toISOString()}` : '';
                output.push(`   ${i + 1}. ${Number(rescue.amount).toLocaleString()} ${stats.symbol} (Block ${rescue.blockNumber}${timestampStr})`);
            });
        }

        // Display top funders if any
        if (stats.topFunders.length > 0) {
            output.push('\n💰 Top Funding Transactions:');
            stats.topFunders.forEach((funder, i) => {
                const shortAddress = `${funder.from.slice(0, 6)}...${funder.from.slice(-4)}`;
                output.push(`   ${i + 1}. ${Number(funder.amount).toLocaleString()} ${stats.symbol} from ${shortAddress} (Block ${funder.blockNumber})`);
            });
        }

        // Show timeline
        if (stats.timeline.firstClaim || stats.timeline.lastClaim) {
            output.push('\n📅 Timeline:');
            if (stats.timeline.firstClaim) {
                output.push(`   - First Claim: Block ${stats.timeline.firstClaim.blockNumber} (${stats.timeline.firstClaim.timestamp.toISOString()})`);
            }
            if (stats.timeline.lastClaim) {
                output.push(`   - Last Claim: Block ${stats.timeline.lastClaim.blockNumber} (${stats.timeline.lastClaim.timestamp.toISOString()})`);
            }
        }

        // Display chunk statistics if available with enhanced rates
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
