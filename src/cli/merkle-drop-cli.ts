#!/usr/bin/env node

import { exit } from 'process';
import { Command } from 'commander';
import { ethers } from 'ethers';
import { CLIOptions } from '../types';
import { DropService } from '../services/DropService';
import { VerificationService } from '../services/VerificationService';

const program = new Command();

// Configure CLI
program
    .name('merkle-drop-cli')
    .description('CLI tool for creating and managing merkle drops')
    .version('1.0.0');

// Add options
program
// Generation mode options
    .option('-v, --drop-version <version>', 'deployment instance version')
    .option('-g, --gencodes', 'generate codes mode', false)
    .option('-q, --qrs', 'generate QR codes', false)
    .option('-l, --links', 'generate links', false)
    .option('-n, --numbers <numbers>', 'codes to generate per amount')
    .option('-a, --amounts <amounts>', 'amounts to generate (in ether)')
    .option('-t, --testcodes <codes>', 'test codes count,amount', '10,1')
    .option('-s, --nodeploy', 'test run, ignores version', false)
    .option('-c, --cleanup', 'cleanup QR directories before generation', false)
    .option('-z, --zip', 'zip QR codes', false)
// Verification mode options
    .option('-x, --validate', 'validation mode', false)
    .option('-u, --url <url>', 'QR URL to validate')
    .option('-r, --root <root>', 'merkle root')
// Cleanup mode options
    .option('-w, --wipe', 'clean up QR directories', false)
// General options
    .option('-b, --chainid <chainid>', 'chain ID', '1');

// Parse arguments
program.parse(process.argv);
const options = program.opts() as CLIOptions;

// Main execution
async function main () {
    try {
    // Validate arguments
        validateArguments(options);

        // Execute based on mode
        if (options.gencodes) {
            await executeGenerateMode(options);
        } else if (options.validate) {
            executeValidateMode(options);
        } else if (options.wipe) {
            executeWipeMode(options);
        }
    } catch (error) {
        console.error('Error:', error);
        exit(1);
    }
}

/**
 * Validate CLI arguments
 */
function validateArguments (options: CLIOptions): void {
    // Check that exactly one mode is selected
    const modeCount = [options.gencodes, options.validate, options.wipe]
        .filter(Boolean).length;
  
    if (modeCount !== 1) {
        console.error('Please specify exactly one mode: -g (generate), -x (validate), or -w (wipe)');
        exit(1);
    }

    // Validate generation mode arguments
    if (options.gencodes) {
        if (!options.dropVersion || isNaN(Number(options.dropVersion))) {
            console.error('Option -v, --drop-version <version> is required and must be a number');
            exit(1);
        }

        if (!options.chainid || isNaN(Number(options.chainid))) {
            console.error('Option -b, --chainid <chainid> must be a number');
            exit(1);
        }

        if (!options.numbers || !options.amounts) {
            console.error('Options -n, --numbers and -a, --amounts are required');
            exit(1);
        }

        const counts = options.numbers.split(',');
        const amounts = options.amounts.split(',');

        if (counts.length !== amounts.length) {
            console.error('Numbers and amounts must have the same length');
            exit(1);
        }

        if (counts.length === 0) {
            console.error('Numbers and amounts must contain at least one element');
            exit(1);
        }
    }

    // Validate verification mode arguments
    if (options.validate) {
        if (!options.url || !options.root) {
            console.error('Options -u, --url and -r, --root are required for validation');
            exit(1);
        }
    }
}

/**
 * Execute generate mode
 */
async function executeGenerateMode (options: CLIOptions): Promise<void> {
    const version = Number(options.dropVersion!);
    const chainId = Number(options.chainid!);
    const counts = options.numbers!.split(',').map(x => BigInt(x));
    const amounts = options.amounts!.split(',').map(x => BigInt(x));
    const testCodes = options.testcodes!.split(',').map(x => BigInt(x));

    if (testCodes.length !== 2) {
        console.error('Test codes must be in format: count,amount (e.g., -t 10,1)');
        exit(1);
    }

    // Create drop settings
    const settings = DropService.createDropSettings(
        options.qrs || false,
        options.links || false,
        counts,
        amounts.map(a => ethers.parseEther(a.toString())),
        Number(testCodes[0]),
        version,
        options.nodeploy || false,
        chainId,
    );

    // Validate version
    if (!options.nodeploy && !DropService.validateVersion(version, settings.fileLatest)) {
        exit(1);
    }

    // Clean directories if requested
    if (options.cleanup) {
        DropService.cleanQrDirectories(settings);
    }

    // Add test codes to the beginning
    const allCounts = [testCodes[0], ...counts];
    const allAmounts = [ethers.parseEther(testCodes[1].toString()), ...amounts.map(a => ethers.parseEther(a.toString()))];

    // Update settings with all codes
    settings.codeCounts = allCounts;
    settings.codeAmounts = allAmounts;

    // Generate codes
    console.log('\n🚀 Generating merkle drop...\n');
    const result = await DropService.generateCodes(settings);
  
    console.log('\n✅ Generation complete!');
    console.log(`📊 Merkle root: ${result.merkleRoot}`);
    console.log(`🌳 Tree height: ${result.height}`);
    console.log(`🔗 Generated ${result.urls.length} claim links\n`);

    // Create zip archives if requested
    if (options.zip) {
        const dateString = new Date().toISOString().slice(0, 7);
        DropService.createZipArchives(settings, dateString);
        console.log('📦 Created zip archives\n');
    }
}

/**
 * Execute validate mode
 */
function executeValidateMode (options: CLIOptions): void {
    const chainId = Number(options.chainid!);
  
    console.log('\n🔍 Validating claim link...\n');
  
    const result = VerificationService.verifyLink(
    options.url!,
    options.root!,
    chainId,
    true,
    );

    if (result.wallet && result.amount) {
        console.log(`\n💰 Wallet: ${result.wallet}`);
        console.log(`💵 Amount: ${ethers.formatEther(result.amount)} tokens\n`);
    }
}

/**
 * Execute wipe mode
 */
function executeWipeMode (_options: CLIOptions): void {
    const settings = DropService.createDropSettings(
        false,
        false,
        [],
        [],
        0,
        0,
        true,
        1,
    );

    console.log('\n🧹 Cleaning QR directories...\n');
    DropService.cleanQrDirectories(settings);
    console.log('✅ Directories cleaned\n');
}

// Run the CLI
main().catch(console.error);
