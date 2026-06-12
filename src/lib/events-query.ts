import { ethers } from 'ethers';

// Configurable chunk size fallback sequence (in blocks)
// Starts with largest size and falls back to smaller sizes on failure
// For Base network, smaller chunks work better due to high transaction volume
export const CHUNK_SIZE_FALLBACK_SEQUENCE = [10000, 5000, 2500, 500, 100];

/**
 * Thrown when the underlying RPC fundamentally cannot serve eth_getLogs for any
 * chunk size in CHUNK_SIZE_FALLBACK_SEQUENCE (e.g. the configured plan caps the
 * block range below our smallest chunk). Retrying / falling back further will
 * not help, so this aborts the whole query immediately.
 */
export class RpcCapabilityError extends Error {
    statusCode: number;
    rpcMessage: string;
    allowedBlockRange: number | null;
    minChunkSize: number;
    constructor (statusCode: number, rpcMessage: string, allowedBlockRange: number | null, minChunkSize: number) {
        super(`RPC rejected eth_getLogs (HTTP ${statusCode}): ${rpcMessage}`);
        this.name = 'RpcCapabilityError';
        this.statusCode = statusCode;
        this.rpcMessage = rpcMessage;
        this.allowedBlockRange = allowedBlockRange;
        this.minChunkSize = minChunkSize;
    }
}

/**
 * Extract the maximum allowed eth_getLogs block range from a JSON-RPC error
 * message, when the provider tells us. Returns null when no number can be
 * parsed.
 *
 * Recognised formats (case-insensitive):
 *   - "up to a 10 block range"               (Alchemy)
 *   - "limited to a 10000 block range"       (QuickNode-style)
 *   - "maximum range of 10000 blocks"        (Infura-style)
 *   - "[0x..., 0x...]"                       (Alchemy hint range; used as fallback)
 */
export function extractAllowedBlockRange (rpcMessage: string): number | null {
    const numberPatterns = [
        /up to (?:a |an )?(\d[\d,_]*)\s*blocks?\s*range/i,
        /(?:limited|capped|cap)\s+to\s+(?:a |an )?(\d[\d,_]*)\s*blocks?/i,
        /max(?:imum)?\s+(?:range|number)\s+of\s+(\d[\d,_]*)\s*blocks?/i,
        // DRPC-style: "ranges over 10000 blocks are not supported"
        /ranges?\s+over\s+(\d[\d,_]*)\s*blocks?\s*(?:are\s+)?not\s+supported/i,
        /(\d[\d,_]*)\s*blocks?\s*range/i,
    ];
    for (const re of numberPatterns) {
        const m = re.exec(rpcMessage);
        if (m) {
            const n = parseInt(m[1].replace(/[,_]/g, ''), 10);
            if (!isNaN(n) && n > 0) return n;
        }
    }
    // Fallback: derive from a "[0xHEX, 0xHEX]" hint range.
    const hint = /\[\s*0x([0-9a-f]+)\s*,\s*0x([0-9a-f]+)\s*\]/i.exec(rpcMessage);
    if (hint) {
        const from = parseInt(hint[1], 16);
        const to = parseInt(hint[2], 16);
        if (!isNaN(from) && !isNaN(to) && to >= from) {
            return to - from + 1;
        }
    }
    return null;
}

/**
 * Parsed information about a JSON-RPC capability error (e.g. "max 10 block
 * range"). Returned by `parseCapabilityErrorInfo` regardless of whether the
 * error is recoverable, so callers can adapt their chunk size if they want.
 */
export interface RpcCapabilityErrorInfo {
    statusCode: number;
    rpcMessage: string;
    allowedBlockRange: number | null;
}

/**
 * Parse an error from a queryFilter / eth_getLogs call and, if it looks like an
 * RPC-level range / plan limit, return structured info about it. Returns null
 * for errors that don't match the pattern (network errors, generic bad request
 * without a range hint, etc.).
 */
export function parseCapabilityErrorInfo (err: unknown): RpcCapabilityErrorInfo | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cause: any = (err as any)?.cause;
    if (!cause) return null;
    const statusCode: number = cause.statusCode || cause.status || 0;
    // 400 = generic bad request, 413 = payload too large. Both can carry the
    // free-tier / range-limit signal in the JSON-RPC body.
    if (statusCode !== 400 && statusCode !== 413) return null;
    const rpcMessage: string = cause.body?.error?.message || cause.body?.message || '';
    if (!rpcMessage) return null;
    // Patterns that look like an eth_getLogs range / plan limit.
    const limitPatterns = [
        // matches "free tier" and "freetier" (DRPC uses one word)
        /\bfree.?tier\b/i,
        /upgrade\s+(?:to|your\s+tier).{0,30}\b(?:paid|payg)\b/i,
        // DRPC: "ranges over 10000 blocks are not supported"
        /ranges?\s+over\s+\d.{0,30}blocks?/i,
        /\b(?:block ?range|range)\b.{0,60}\b(?:up to|max(?:imum)?|limited|cap(?:ped)?)\b/i,
        /\b(?:up to|max(?:imum)?)\b.{0,60}\bblocks?\b/i,
    ];
    if (!limitPatterns.some(p => p.test(rpcMessage))) return null;
    return {
        statusCode,
        rpcMessage,
        allowedBlockRange: extractAllowedBlockRange(rpcMessage),
    };
}

/**
 * Inspect a thrown error from a queryFilter / eth_getLogs call and decide
 * whether it indicates an RPC-level capability limit that no chunk size in our
 * fallback sequence can satisfy. Returns null when the error is recoverable
 * (e.g. the RPC's limit is still >= our smallest chunk, so chunking down will
 * eventually succeed), letting the existing retry/fallback machinery run.
 */
export function detectRpcCapabilityError (err: unknown): RpcCapabilityError | null {
    const info = parseCapabilityErrorInfo(err);
    if (!info) return null;
    const minChunkSize = Math.min(...CHUNK_SIZE_FALLBACK_SEQUENCE);
    if (info.allowedBlockRange !== null && info.allowedBlockRange >= minChunkSize) {
        return null;
    }
    return new RpcCapabilityError(info.statusCode, info.rpcMessage, info.allowedBlockRange, minChunkSize);
}

/**
 * Given a known maximum allowed block range from an RPC, return the index in
 * CHUNK_SIZE_FALLBACK_SEQUENCE of the largest chunk size that fits, or -1 if
 * no size fits.
 */
export function pickOptimalChunkSizeIndex (allowedBlockRange: number): number {
    return CHUNK_SIZE_FALLBACK_SEQUENCE.findIndex(s => s <= allowedBlockRange);
}

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

    getStats (): Map<number, unknown> {
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
    } catch (err) {
        const capErr = detectRpcCapabilityError(err);
        if (capErr) throw capErr;
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
            // Only advance progress on actual success. Counting attempts (the
            // old behaviour) lets the bar reach 100% while many chunks are
            // still being silently retried/fallback-split, which is what the
            // user perceives as "stuck at 100%".
            if (result.success) {
                progressReporter.update(chunk.to - chunk.from + 1, updateSharedProgress);
            }
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
    skipOptimistic: boolean = false,
): Promise<(ethers.EventLog | ethers.Log)[]> {
    const { retries = 3, maxConcurrent = 5 } = config;
    const events: (ethers.EventLog | ethers.Log)[] = [];
    
    // Get current chunk size
    const currentSize = CHUNK_SIZE_FALLBACK_SEQUENCE[currentSizeIndex];
    if (!currentSize) return events;

    // Optimistic approach: try to get the whole range at once (only at depth 0,
    // and only when the caller hasn't already discovered that the full range is
    // doomed via a prior probe).
    if (depth === 0 && !skipOptimistic && allChunks.length > 0) {
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
        progressReporter.reset(failed.length, 'Retrying failed chunks', isRecursive);

        let remainingFailed = [...failed];
        for (let attempt = 0; attempt < retries && remainingFailed.length > 0; attempt++) {
            const retryResults = await processChunksParallel(
                contract,
                filter,
                remainingFailed,
                progressReporter,
                maxConcurrent,
                depth === 0,  // Retries of original chunks should advance the shared bar on success
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
                // Surface the fallback to the user so they don't see a frozen
                // progress bar while the recursive sub-chunking grinds away.
                if (depth === 0) {
                    progressReporter.clear();
                    console.log(`   - ${remainingFailed.length} chunk(s) still failing at ${currentSize}-block size; falling back to ${nextSize}-block chunks...`);
                }
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
                    // The original top-level chunk is now done (successfully
                    // or with inner failures). Mark it on the shared bar so
                    // progress reflects forward motion rather than freezing.
                    if (depth === 0) {
                        progressReporter.update(chunk.to - chunk.from + 1, true);
                    }
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
 * Main entry point - query events with retry logic and parallel processing.
 *
 * `options.startSizeIndex` lets callers that have already discovered the RPC's
 *  capabilities (e.g. via a prior failed direct query) start at a chunk size
 *  they know fits, skipping the doomed bigger sizes in the fallback sequence.
 * `options.skipOptimistic` disables the optimistic full-range probe that
 *  queryEventsRecursive does at depth 0, useful when the caller has already
 *  tried that range and seen it fail.
 */
export async function queryEventsWithRetry (
    tokenContract: ethers.Contract,
    filter: ethers.ContractEventName,
    chunks: ChunkRange[],
    progressTracker?: { completed: number; total: number },
    options?: { startSizeIndex?: number; skipOptimistic?: boolean },
): Promise<{
    events: (ethers.EventLog | ethers.Log)[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chunkStats: Map<number, any>;
}> {
    const config: QueryConfig = {
        maxConcurrent: 5,
        retries: 3,
        baseDelay: 200,
    };

    const statsTracker = new ChunkStatsTracker();
    const progressReporter = new ProgressReporter(chunks.length, progressTracker);

    const startSizeIndex = options?.startSizeIndex ?? 0;
    const skipOptimistic = options?.skipOptimistic ?? false;

    const events = await queryEventsRecursive(
        tokenContract,
        filter,
        chunks,
        startSizeIndex,
        statsTracker,
        progressReporter,
        config,
        0,  // depth 0
        skipOptimistic,
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
