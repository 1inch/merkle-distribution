// Test file to display mock statistics output
import { StatisticsService, MultiDropStatistics } from './src/services/StatisticsService';

// Create mock multi-drop statistics
const mockMultiStats: MultiDropStatistics = {
    '0x1234567890123456789012345678901234567890': {
        version: '60',
        totalFunded: '10000',
        totalClaims: 9,
        totalClaimed: '450.5',
        remainingBalance: '9549.5',
        claimedPercentage: '4.5',
        remainingPercentage: '95.5',
        topFunders: [
            { from: '0xabc123def456789012345678901234567890abcd', amount: '5000', blockNumber: 31942720, isTest: false },
            { from: '0xdef456789012345678901234567890abcdef1234', amount: '3000', blockNumber: 31942721, isTest: false },
            { from: '0x789012345678901234567890abcdef1234567890', amount: '2000', blockNumber: 31942722, isTest: false },
        ],
        timeline: {
            firstClaim: { blockNumber: 31942800, timestamp: new Date('2024-01-15T10:00:00Z') },
            lastClaim: { blockNumber: 37077000, timestamp: new Date('2024-10-20T09:00:00Z') }
        },
        symbol: '1INCH',
        decimals: 18,
        chunkStatistics: [
            { chunkSize: 10000, chunks: 400, firstTrySuccesses: 380, totalSuccesses: 395, firstTryRate: 95.0, totalRate: 98.75 },
            { chunkSize: 5000, chunks: 80, firstTrySuccesses: 60, totalSuccesses: 78, firstTryRate: 75.0, totalRate: 97.5 },
            { chunkSize: 2500, chunks: 30, firstTrySuccesses: 20, totalSuccesses: 29, firstTryRate: 66.7, totalRate: 96.7 },
            { chunkSize: 500, chunks: 4, firstTrySuccesses: 2, totalSuccesses: 4, firstTryRate: 50.0, totalRate: 100.0 },
        ],
        rescuedAmount: '1000',
        rescueTransactions: [
            { amount: '1000', blockNumber: 37077050, timestamp: new Date('2024-10-20T10:00:00Z') }
        ],
        testStatistics: {
            totalFunded: '100',
            totalClaims: 5,
            totalClaimed: '50.5',
            claimedPercentage: '50.5',
            topFunders: [
                { from: '0xtest1234567890123456789012345678901234', amount: '100', blockNumber: 31942719, isTest: true }
            ]
        },
        productionStatistics: {
            totalFunded: '9900',
            totalClaims: 4,
            totalClaimed: '400',
            claimedPercentage: '4.0',
            topFunders: [
                { from: '0xabc123def456789012345678901234567890abcd', amount: '5000', blockNumber: 31942720, isTest: false },
                { from: '0xdef456789012345678901234567890abcdef1234', amount: '3000', blockNumber: 31942721, isTest: false }
            ]
        }
    },
    '0x2345678901234567890123456789012345678901': {
        version: '61',
        totalFunded: '15000',
        totalClaims: 29,
        totalClaimed: '2850.75',
        remainingBalance: '12149.25',
        claimedPercentage: '19.0',
        remainingPercentage: '81.0',
        topFunders: [
            { from: '0xbcd234ef567890123456789012345678901abcd', amount: '8000', blockNumber: 31942730, isTest: false },
            { from: '0xef567890123456789012345678901abcdef2345', amount: '4000', blockNumber: 31942731, isTest: false },
            { from: '0x890123456789012345678901abcdef2345678901', amount: '3000', blockNumber: 31942732, isTest: false },
        ],
        timeline: {
            firstClaim: { blockNumber: 31942850, timestamp: new Date('2024-01-16T10:00:00Z') },
            lastClaim: { blockNumber: 37077010, timestamp: new Date('2024-10-20T09:30:00Z') }
        },
        symbol: '1INCH',
        decimals: 18,
        chunkStatistics: [
            { chunkSize: 10000, chunks: 400, firstTrySuccesses: 380, totalSuccesses: 395, firstTryRate: 95.0, totalRate: 98.75 },
            { chunkSize: 5000, chunks: 80, firstTrySuccesses: 60, totalSuccesses: 78, firstTryRate: 75.0, totalRate: 97.5 },
            { chunkSize: 2500, chunks: 30, firstTrySuccesses: 20, totalSuccesses: 29, firstTryRate: 66.7, totalRate: 96.7 },
            { chunkSize: 500, chunks: 4, firstTrySuccesses: 2, totalSuccesses: 4, firstTryRate: 50.0, totalRate: 100.0 },
        ],
        rescuedAmount: '0',
        rescueTransactions: [],
        testStatistics: {
            totalFunded: '200',
            totalClaims: 10,
            totalClaimed: '150.75',
            claimedPercentage: '75.4',
            topFunders: [
                { from: '0xtest2345678901234567890123456789012345', amount: '200', blockNumber: 31942729, isTest: true }
            ]
        },
        productionStatistics: {
            totalFunded: '14800',
            totalClaims: 19,
            totalClaimed: '2700',
            claimedPercentage: '18.2',
            topFunders: [
                { from: '0xbcd234ef567890123456789012345678901abcd', amount: '8000', blockNumber: 31942730, isTest: false },
                { from: '0xef567890123456789012345678901abcdef2345', amount: '4000', blockNumber: 31942731, isTest: false }
            ]
        }
    },
    '0x3456789012345678901234567890123456789012': {
        version: '63',
        totalFunded: '5000',
        totalClaims: 1,
        totalClaimed: '100',
        remainingBalance: '4900',
        claimedPercentage: '2.0',
        remainingPercentage: '98.0',
        topFunders: [
            { from: '0xcde345f678901234567890123456789012abcde', amount: '3000', blockNumber: 31942740, isTest: false },
            { from: '0xf678901234567890123456789012abcdef3456', amount: '2000', blockNumber: 31942741, isTest: false },
        ],
        timeline: {
            firstClaim: { blockNumber: 31942900, timestamp: new Date('2024-01-17T10:00:00Z') }
        },
        symbol: '1INCH',
        decimals: 18,
        chunkStatistics: [
            { chunkSize: 10000, chunks: 400, firstTrySuccesses: 380, totalSuccesses: 395, firstTryRate: 95.0, totalRate: 98.75 },
            { chunkSize: 5000, chunks: 80, firstTrySuccesses: 60, totalSuccesses: 78, firstTryRate: 75.0, totalRate: 97.5 },
            { chunkSize: 2500, chunks: 30, firstTrySuccesses: 20, totalSuccesses: 29, firstTryRate: 66.7, totalRate: 96.7 },
            { chunkSize: 500, chunks: 4, firstTrySuccesses: 2, totalSuccesses: 4, firstTryRate: 50.0, totalRate: 100.0 },
        ],
        rescuedAmount: '0',
        rescueTransactions: []
    }
};

// Test single drop output
console.log('═══════════════════════════════════════════════════════════════');
console.log('TESTING SINGLE DROP OUTPUT:');
console.log('═══════════════════════════════════════════════════════════════');

const singleDropStats: MultiDropStatistics = {
    '0x1234567890123456789012345678901234567890': mockMultiStats['0x1234567890123456789012345678901234567890']
};

StatisticsService.formatMultiDropStatisticsOutput(singleDropStats);

// Test multi-drop output
console.log('\n\n═══════════════════════════════════════════════════════════════');
console.log('TESTING MULTI-DROP OUTPUT:');
console.log('═══════════════════════════════════════════════════════════════');

StatisticsService.formatMultiDropStatisticsOutput(mockMultiStats);

console.log('\n\n═══════════════════════════════════════════════════════════════');
console.log('TEST COMPLETE - Check the output above to see how it looks!');
console.log('═══════════════════════════════════════════════════════════════');
