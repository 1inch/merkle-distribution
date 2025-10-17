import { ethers } from "ethers";

// Configurable chunk size fallback sequence (in blocks)
// Starts with largest size and falls back to smaller sizes on failure
// For Base network, smaller chunks work better due to high transaction volume
export const CHUNK_SIZE_FALLBACK_SEQUENCE = [10000, 5000, 2500, 500, 100];

export interface EventQueryResult {
    events: (ethers.EventLog | ethers.Log)[];
    failed: boolean;
    chunk?: { from: number; to: number };
    failedRanges?: string[];
}

/**
 * Create a visual progress bar
 */
function createProgressBar (current: number, total: number, width: number = 20): string {
    const percentage = Math.min(100, Math.floor((current / total) * 100));
    const filled = Math.floor((percentage / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${current}/${total} chunks (${percentage}%)`;
}

/**
 * Query events with retry logic and parallel processing
 */
export async function queryEventsWithRetry (
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
                                const progressBar = createProgressBar(progressTracker.completed, progressTracker.total);
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
                            const progressBar = createProgressBar(progressTracker.completed, progressTracker.total);
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
            const smallerEvents = await queryWithSmallChunks(
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
                const progressBar = createProgressBar(progressTracker.completed, progressTracker.total);
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
        const recoveredEvents = await retryFailedChunks(
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
    async function queryWithSmallChunks (
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
    async function retryFailedChunks (
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