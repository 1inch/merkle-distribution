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

export interface ChunkRange {
    from: number;
    to: number;
}

export interface QueryConfig {
    maxConcurrent?: number;
    retries?: number;
    baseDelay?: number;
}

/**
 * Statistics tracker for chunk processing
 */
class ChunkStatsTracker {
    private stats = new Map<number, {
        chunks: number;
        firstTrySuccesses: number;
        attempts: number;
        successes: number;
    }>();

    constructor() {
        CHUNK_SIZE_FALLBACK_SEQUENCE.forEach(size => {
            this.stats.set(size, {
                chunks: 0,
                firstTrySuccesses: 0,
                attempts: 0,
                successes: 0,
            });
        });
    }

    recordChunk(chunkSize: number): void {
        const stat = this.stats.get(chunkSize);
        if (stat) stat.chunks++;
    }

    recordAttempt(chunkSize: number, success: boolean, isFirstTry: boolean): void {
        const stat = this.stats.get(chunkSize);
        if (stat) {
            stat.attempts++;
            if (success) {
                stat.successes++;
                if (isFirstTry) stat.firstTrySuccesses++;
            }
        }
    }

    getStats(): Map<number, any> {
        return this.stats;
    }
}

/**
 * Progress reporter for visual feedback
 */
class ProgressReporter {
    private completedChunks = 0;
    private totalChunks: number;
    private sharedTracker?: { completed: number; total: number };

    constructor(totalChunks: number, sharedTracker?: { completed: number; total: number }) {
        this.totalChunks = totalChunks;
        this.sharedTracker = sharedTracker;
    }

    update(chunkSize?: number): void {
        this.completedChunks++;
        
        if (this.sharedTracker) {
            this.sharedTracker.completed++;
            const progressBar = this.createProgressBar(
                this.sharedTracker.completed,
                this.sharedTracker.total
            );
            process.stdout.write(`\r   - ${progressBar}`);
        } else {
            const message = chunkSize 
                ? `Progress: ${this.completedChunks}/${this.totalChunks} chunks completed (size: ${chunkSize})`
                : `Progress: ${this.completedChunks}/${this.totalChunks} chunks completed`;
            process.stdout.write(`\r   - ${message}`);
        }
    }

    clear(): void {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }

    private createProgressBar(current: number, total: number, width: number = 20): string {
        const percentage = Math.min(100, Math.floor((current / total) * 100));
        const filled = Math.floor((percentage / 100) * width);
        const empty = width - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return `[${bar}] ${current}/${total} chunks (${percentage}%)`;
    }
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    baseDelay: number = 200
): Promise<T | null> {
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt < retries - 1) {
                await new Promise(resolve => 
                    global.setTimeout(resolve, baseDelay * (attempt + 1))
                );
            }
        }
    }
    return null;
}

/**
 * Query a single chunk with retry logic
 */
async function queryChunkWithRetry(
    contract: ethers.Contract,
    filter: ethers.ContractEventName,
    from: number,
    to: number,
    retries: number = 3,
    baseDelay: number = 200
): Promise<(ethers.EventLog | ethers.Log)[] | null> {
    const result = await retryWithBackoff(
        () => contract.queryFilter(filter, from, to),
        retries,
        baseDelay
    );
    return result;
}

/**
 * Process a chunk with size fallback strategy
 */
async function processChunkWithFallback(
    contract: ethers.Contract,
    filter: ethers.ContractEventName,
    chunk: ChunkRange,
    statsTracker: ChunkStatsTracker,
    config: QueryConfig = {}
): Promise<EventQueryResult> {
    const { retries = 3, baseDelay = 200 } = config;
    const originalChunkSize = chunk.to - chunk.from + 1;

    // Try each chunk size in the fallback sequence
    for (const targetSize of CHUNK_SIZE_FALLBACK_SEQUENCE) {
        if (targetSize >= originalChunkSize) {
            // Try the whole chunk with this size
            statsTracker.recordChunk(targetSize);
            
            for (let attempt = 0; attempt < retries; attempt++) {
                const isFirstTry = attempt === 0;
                const events = await queryChunkWithRetry(
                    contract, filter, chunk.from, chunk.to, 1, baseDelay * (attempt + 1)
                );
                
                if (events) {
                    statsTracker.recordAttempt(targetSize, true, isFirstTry);
                    return { events, failed: false };
                }
                statsTracker.recordAttempt(targetSize, false, isFirstTry);
            }
        } else {
            // Split into smaller sub-chunks
            const result = await processWithSubChunks(
                contract, filter, chunk, targetSize, statsTracker, config
            );
            if (result) return result;
        }
    }

    // Final fallback to smallest size
    console.log(`\n   - Chunk ${chunk.from}-${chunk.to} falling back to smallest size...`);
    return await processWithSmallestChunks(contract, filter, chunk, statsTracker);
}

/**
 * Process a chunk by splitting it into smaller sub-chunks
 */
async function processWithSubChunks(
    contract: ethers.Contract,
    filter: ethers.ContractEventName,
    chunk: ChunkRange,
    targetSize: number,
    statsTracker: ChunkStatsTracker,
    config: QueryConfig
): Promise<EventQueryResult | null> {
    const subChunkEvents: (ethers.EventLog | ethers.Log)[] = [];
    const { retries = 3, baseDelay = 200 } = config;

    for (let from = chunk.from; from <= chunk.to; from += targetSize) {
        const to = Math.min(from + targetSize - 1, chunk.to);
        statsTracker.recordChunk(targetSize);
        
        let succeeded = false;
        for (let attempt = 0; attempt < retries; attempt++) {
            const events = await queryChunkWithRetry(
                contract, filter, from, to, 1, baseDelay * (attempt + 1)
            );
            
            if (events) {
                subChunkEvents.push(...events);
                statsTracker.recordAttempt(targetSize, true, attempt === 0);
                succeeded = true;
                break;
            }
            statsTracker.recordAttempt(targetSize, false, attempt === 0);
        }
        
        if (!succeeded) return null; // Move to next smaller size
    }

    return { events: subChunkEvents, failed: false };
}

/**
 * Process with the smallest chunk size as final fallback
 */
async function processWithSmallestChunks(
    contract: ethers.Contract,
    filter: ethers.ContractEventName,
    chunk: ChunkRange,
    statsTracker: ChunkStatsTracker
): Promise<EventQueryResult> {
    const events: (ethers.EventLog | ethers.Log)[] = [];
    const failedRanges: string[] = [];
    const smallestSize = CHUNK_SIZE_FALLBACK_SEQUENCE[CHUNK_SIZE_FALLBACK_SEQUENCE.length - 1];

    for (let from = chunk.from; from <= chunk.to; from += smallestSize) {
        const to = Math.min(from + smallestSize - 1, chunk.to);
        statsTracker.recordChunk(smallestSize);
        
        const result = await queryChunkWithRetry(contract, filter, from, to, 1, 100);
        if (result) {
            events.push(...result);
            statsTracker.recordAttempt(smallestSize, true, true);
        } else {
            failedRanges.push(`${from}-${to}`);
            statsTracker.recordAttempt(smallestSize, false, true);
        }
    }

    return { 
        events, 
        failed: failedRanges.length > 0,
        chunk,
        failedRanges
    };
}

/**
 * Process chunks in parallel batches
 */
async function processChunksInBatches(
    contract: ethers.Contract,
    filter: ethers.ContractEventName,
    chunks: ChunkRange[],
    statsTracker: ChunkStatsTracker,
    progressReporter: ProgressReporter,
    config: QueryConfig
): Promise<{
    events: (ethers.EventLog | ethers.Log)[];
    failedChunks: Array<{ chunk: ChunkRange; failedRanges: string[] }>;
}> {
    const { maxConcurrent = 5 } = config;
    const events: (ethers.EventLog | ethers.Log)[] = [];
    const failedChunks: Array<{ chunk: ChunkRange; failedRanges: string[] }> = [];

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
        const batch = chunks.slice(i, Math.min(i + maxConcurrent, chunks.length));
        
        const batchPromises = batch.map(async (chunk) => {
            const result = await processChunkWithFallback(
                contract, filter, chunk, statsTracker, config
            );
            
            progressReporter.update(chunk.to - chunk.from + 1);
            return result;
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            events.push(...result.events);
            if (result.failed && result.chunk && result.failedRanges) {
                failedChunks.push({ 
                    chunk: result.chunk, 
                    failedRanges: result.failedRanges 
                });
            }
        }
    }

    return { events, failedChunks };
}

/**
 * Retry failed chunks with recovery strategy
 */
async function retryFailedChunks(
    contract: ethers.Contract,
    filter: ethers.ContractEventName,
    failedChunks: Array<{ chunk: ChunkRange; failedRanges: string[] }>,
    statsTracker: ChunkStatsTracker
): Promise<(ethers.EventLog | ethers.Log)[]> {
    if (failedChunks.length === 0) return [];
    
    console.log(`\n   - Retrying ${failedChunks.length} failed chunks...`);
    const events: (ethers.EventLog | ethers.Log)[] = [];
    const smallestSize = CHUNK_SIZE_FALLBACK_SEQUENCE[CHUNK_SIZE_FALLBACK_SEQUENCE.length - 1];
    let recoveredCount = 0;

    for (const { failedRanges } of failedChunks) {
        for (const rangeStr of failedRanges) {
            const [fromStr, toStr] = rangeStr.split('-');
            const from = parseInt(fromStr);
            const to = parseInt(toStr);

            for (let retryFrom = from; retryFrom <= to; retryFrom += smallestSize) {
                const retryTo = Math.min(retryFrom + smallestSize - 1, to);
                
                const result = await queryChunkWithRetry(
                    contract, filter, retryFrom, retryTo, 1, 500
                );
                
                if (result) {
                    events.push(...result);
                    recoveredCount += result.length;
                    statsTracker.recordAttempt(smallestSize, true, false);
                } else {
                    statsTracker.recordAttempt(smallestSize, false, false);
                }
            }
        }
    }

    if (recoveredCount > 0) {
        console.log(`   - Recovered ${recoveredCount} additional events`);
    }

    return events;
}

/**
 * Main function to query events with retry logic and parallel processing
 */
export async function queryEventsWithRetry(
    tokenContract: ethers.Contract,
    filter: ethers.ContractEventName,
    chunks: ChunkRange[],
    progressTracker?: { completed: number; total: number },
): Promise<{
    events: (ethers.EventLog | ethers.Log)[];
    chunkStats: Map<number, any>;
}> {
    const config: QueryConfig = {
        maxConcurrent: 5,
        retries: 3,
        baseDelay: 100
    };

    const statsTracker = new ChunkStatsTracker();
    const progressReporter = new ProgressReporter(chunks.length, progressTracker);

    // Process chunks in batches
    const { events, failedChunks } = await processChunksInBatches(
        tokenContract,
        filter,
        chunks,
        statsTracker,
        progressReporter,
        config
    );

    // Retry failed chunks
    const recoveredEvents = await retryFailedChunks(
        tokenContract,
        filter,
        failedChunks,
        statsTracker
    );
    events.push(...recoveredEvents);

    // Clear progress line
    progressReporter.clear();

    return { 
        events, 
        chunkStats: statsTracker.getStats() 
    };
}
