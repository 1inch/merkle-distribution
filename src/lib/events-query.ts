import { ethers } from 'ethers';

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

    constructor () {
        CHUNK_SIZE_FALLBACK_SEQUENCE.forEach(size => {
            this.stats.set(size, {
                chunks: 0,
                firstTrySuccesses: 0,
                attempts: 0,
                successes: 0,
            });
        });
    }

    recordChunk (chunkSize: number): void {
        const stat = this.stats.get(chunkSize);
        if (stat) stat.chunks++;
    }

    recordAttempt (chunkSize: number, success: boolean, isFirstTry: boolean): void {
        const stat = this.stats.get(chunkSize);
        if (stat) {
            stat.attempts++;
            if (success) {
                stat.successes++;
                if (isFirstTry) stat.firstTrySuccesses++;
            }
        }
    }

    getStats (): Map<number, any> {
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
    private currentMessage: string = '';
    private isRecursive: boolean = false;

    constructor (totalChunks: number, sharedTracker?: { completed: number; total: number }) {
        this.totalChunks = totalChunks;
        this.sharedTracker = sharedTracker;
    }

    reset (totalChunks: number, message?: string, isRecursive: boolean = false): void {
        this.completedChunks = 0;
        this.totalChunks = totalChunks;
        this.isRecursive = isRecursive;
        if (message) {
            this.currentMessage = message;
        }
    }

    update (chunkSize?: number, incrementShared: boolean = true): void {
        this.completedChunks++;
        
        // Only update shared tracker for original chunks (not recursive)
        if (this.sharedTracker && incrementShared && !this.isRecursive) {
            this.sharedTracker.completed++;
            const progressBar = this.createProgressBar(
                this.sharedTracker.completed,
                this.sharedTracker.total,
            );
            process.stdout.write(`\r   - ${progressBar}`);
        } else if (!this.sharedTracker) {
            const prefix = this.currentMessage ? `${this.currentMessage}: ` : 'Progress: ';
            const message = chunkSize
                ? `${prefix}${this.completedChunks}/${this.totalChunks} chunks completed (size: ${chunkSize})`
                : `${prefix}${this.completedChunks}/${this.totalChunks} chunks completed`;
            process.stdout.write(`\r   - ${message}`);
        }
    }

    updateAllChunksComplete (chunkCount: number): void {
        // Special method for when optimistic query succeeds
        if (this.sharedTracker) {
            this.sharedTracker.completed += chunkCount;
            const progressBar = this.createProgressBar(
                this.sharedTracker.completed,
                this.sharedTracker.total,
            );
            process.stdout.write(`\r   - ${progressBar}`);
        }
    }

    clear (): void {
        process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }

    private createProgressBar (current: number, total: number, width: number = 20): string {
        const percentage = Math.min(100, Math.floor((current / total) * 100));
        const filled = Math.floor((percentage / 100) * width);
        const empty = width - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return `[${bar}] ${current}/${total} chunks (${percentage}%)`;
    }
}

/**
 * Query a single chunk range with basic retry
 */
async function queryChunkRange (
    contract: ethers.Contract,
    filter: ethers.ContractEventName,
    from: number,
    to: number,
): Promise<{ events: (ethers.EventLog | ethers.Log)[]; success: boolean }> {
    try {
        const events = await contract.queryFilter(filter, from, to);
        return { events, success: true };
    } catch {
        return { events: [], success: false };
    }
}

/**
 * Split a chunk into smaller chunks
 */
function splitChunkIntoSmaller (chunk: ChunkRange, targetSize: number): ChunkRange[] {
    const chunks: ChunkRange[] = [];
    for (let from = chunk.from; from <= chunk.to; from += targetSize) {
        const to = Math.min(from + targetSize - 1, chunk.to);
        chunks.push({ from, to });
    }
    return chunks;
}

/**
 * Process chunks in parallel with batching
 */
async function processChunksParallel (
    contract: ethers.Contract,
    filter: ethers.ContractEventName,
    chunks: ChunkRange[],
    progressReporter: ProgressReporter,
    maxConcurrent: number = 5,
    updateSharedProgress: boolean = true,
): Promise<{
    succeeded: { chunk: ChunkRange; events: (ethers.EventLog | ethers.Log)[] }[];
    failed: ChunkRange[];
}> {
    const succeeded: { chunk: ChunkRange; events: (ethers.EventLog | ethers.Log)[] }[] = [];
    const failed: ChunkRange[] = [];

    for (let i = 0; i < chunks.length; i += maxConcurrent) {
        const batch = chunks.slice(i, Math.min(i + maxConcurrent, chunks.length));
        
        const batchPromises = batch.map(async (chunk) => {
            const result = await queryChunkRange(contract, filter, chunk.from, chunk.to);
            progressReporter.update(chunk.to - chunk.from + 1, updateSharedProgress);
            return { chunk, ...result };
        });

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            if (result.success) {
                succeeded.push({ chunk: result.chunk, events: result.events });
            } else {
                failed.push(result.chunk);
            }
        }
    }

    return { succeeded, failed };
}

/**
 * Main recursive query function with optimistic approach
 */
async function queryEventsRecursive (
    contract: ethers.Contract,
    filter: ethers.ContractEventName,
    allChunks: ChunkRange[],
    currentSizeIndex: number,
    statsTracker: ChunkStatsTracker,
    progressReporter: ProgressReporter,
    config: QueryConfig,
    depth: number = 0,
): Promise<(ethers.EventLog | ethers.Log)[]> {
    const { retries = 3, maxConcurrent = 5 } = config;
    const events: (ethers.EventLog | ethers.Log)[] = [];
    
    // Get current chunk size
    const currentSize = CHUNK_SIZE_FALLBACK_SEQUENCE[currentSizeIndex];
    if (!currentSize) return events;

    // Optimistic approach: try to get the whole range at once (only at depth 0)
    if (depth === 0 && allChunks.length > 0) {
        const firstChunk = allChunks[0];
        const lastChunk = allChunks[allChunks.length - 1];
        
        const fullRangeResult = await queryChunkRange(
            contract,
            filter,
            firstChunk.from,
            lastChunk.to,
        );
        
        if (fullRangeResult.success) {
            // Update progress for all chunks if using shared tracker
            progressReporter.updateAllChunksComplete(allChunks.length);
            
            statsTracker.recordChunk(lastChunk.to - firstChunk.from + 1);
            statsTracker.recordAttempt(lastChunk.to - firstChunk.from + 1, true, true);
            return fullRangeResult.events;
        }
    }

    // Process chunks in parallel
    // Only count original chunks in progress (depth === 0)
    const isRecursive = depth > 0;  // Mark as recursive for any depth > 0
    progressReporter.reset(
        allChunks.length,
        depth === 0 ? 'Processing chunks' : `Processing with size ${currentSize}`,
        isRecursive,
    );
    const { succeeded, failed } = await processChunksParallel(
        contract,
        filter,
        allChunks,
        progressReporter,
        maxConcurrent,
        depth === 0,  // Only update shared progress for original chunks at depth 0
    );

    // Collect successful events
    for (const { events: chunkEvents } of succeeded) {
        events.push(...chunkEvents);
        statsTracker.recordChunk(currentSize);
        statsTracker.recordAttempt(currentSize, true, true);
    }

    // Retry failed chunks
    if (failed.length > 0) {
        progressReporter.reset(failed.length, 'Retrying failed chunks', true); // Mark as recursive to not count in shared progress
        
        let remainingFailed = [...failed];
        for (let attempt = 0; attempt < retries && remainingFailed.length > 0; attempt++) {
            const retryResults = await processChunksParallel(
                contract,
                filter,
                remainingFailed,
                progressReporter,
                maxConcurrent,
                false,  // Don't update shared progress for retries
            );

            // Collect newly successful events
            for (const { events: chunkEvents } of retryResults.succeeded) {
                events.push(...chunkEvents);
                statsTracker.recordChunk(currentSize);
                statsTracker.recordAttempt(currentSize, true, attempt === 0);
            }

            remainingFailed = retryResults.failed;
        }

        // Process remaining failed chunks with smaller size if available
        if (remainingFailed.length > 0) {
            const nextSizeIndex = currentSizeIndex + 1;
            
            if (nextSizeIndex < CHUNK_SIZE_FALLBACK_SEQUENCE.length) {
                const nextSize = CHUNK_SIZE_FALLBACK_SEQUENCE[nextSizeIndex];
                
                for (const chunk of remainingFailed) {
                    const smallerChunks = splitChunkIntoSmaller(chunk, nextSize);
                    const recursiveEvents = await queryEventsRecursive(
                        contract,
                        filter,
                        smallerChunks,
                        nextSizeIndex,
                        statsTracker,
                        progressReporter,
                        config,
                        depth + 1,
                    );
                    events.push(...recursiveEvents);
                }
            } else {
                // No smaller size available, record failures
                for (const _chunk of remainingFailed) {
                    statsTracker.recordChunk(currentSize);
                    statsTracker.recordAttempt(currentSize, false, false);
                }
            }
        }
    }

    return events;
}

/**
 * Main entry point - query events with retry logic and parallel processing
 */
export async function queryEventsWithRetry (
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
        baseDelay: 200,
    };

    const statsTracker = new ChunkStatsTracker();
    const progressReporter = new ProgressReporter(chunks.length, progressTracker);

    // Fallback to chunked processing (optimistic will be tried inside recursive function)
    const events = await queryEventsRecursive(
        tokenContract,
        filter,
        chunks,
        0, // Start with index 0 (largest size)
        statsTracker,
        progressReporter,
        config,
        0,  // Start at depth 0 to allow optimistic attempt
    );

    // Clear progress line only if not using shared tracker
    if (!progressTracker) {
        progressReporter.clear();
    }

    // Sort events by block number and log index for consistency
    events.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
            return a.blockNumber - b.blockNumber;
        }
        return a.index - b.index;
    });

    return {
        events,
        chunkStats: statsTracker.getStats(),
    };
}
