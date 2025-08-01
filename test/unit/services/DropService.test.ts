import sinon from 'sinon';
import mockFs from 'mock-fs';
import { ethers } from 'ethers';
import { DropService } from '../../../src/services/DropService';
import * as wallet from '../../../src/lib/wallet';
import * as merkle from '../../../src/lib/merkle';
import * as encoding from '../../../src/lib/encoding';
import * as qr from '../../../src/lib/qr';
import { testWallets } from '../../fixtures/test-data';
const { expect } = require('@1inch/solidity-utils');

describe('DropService', () => {
    let generatePrivateKeysStub: sinon.SinonStub;
    let createMerkleDropStub: sinon.SinonStub;
    let generateClaimUrlStub: sinon.SinonStub;
    let generateQrCodesStub: sinon.SinonStub;
    let consoleWarnStub: sinon.SinonStub;

    beforeEach(() => {
    // Stub console methods to prevent output during tests
        sinon.stub(console, 'log');
        sinon.stub(console, 'error');
        consoleWarnStub = sinon.stub(console, 'warn');
    
        // Set up file system mock
        mockFs({
            'src': {
                '.latest': '10',
                'gendata': {},
                'qr': {},
                'test_qr': {},
            },
        });

        // Set up stubs
        generatePrivateKeysStub = sinon.stub(wallet, 'generatePrivateKeys');
        createMerkleDropStub = sinon.stub(merkle, 'createMerkleDrop');
        generateClaimUrlStub = sinon.stub(encoding, 'generateClaimUrl');
        generateQrCodesStub = sinon.stub(qr, 'generateQrCodes');
    });

    afterEach(() => {
        mockFs.restore();
        sinon.restore();
    });

    describe('createDropSettings', () => {
        it('should create drop settings with correct properties', () => {
            const settings = DropService.createDropSettings(
                true, // flagSaveQr
                true, // flagSaveLink
                [BigInt(10), BigInt(20)],
                [ethers.parseEther('1'), ethers.parseEther('2')],
                5, // testCount
                11, // version
                false, // flagNoDeploy
                1, // chainId
            );

            expect(settings.flagSaveQr).to.be.true;
            expect(settings.flagSaveLink).to.be.true;
            expect(settings.codeCounts).to.deep.equal([BigInt(10), BigInt(20)]);
            expect(settings.testCount).to.equal(5);
            expect(settings.version).to.equal(11);
            expect(settings.chainId).to.equal(1);
            expect(settings.prefix).to.equal('https://app.1inch.io/#/1/qr?');
            expect(settings.fileLinks).to.include('11-qr-links.json');
            expect(settings.testLinks).to.include('11-qr-links-test.json');
        });
    });

    describe('generateCodes', () => {
        it('should generate merkle drop codes successfully', async () => {
            const settings = DropService.createDropSettings(
                false,
                false,
                [BigInt(2)],
                [ethers.parseEther('1')],
                1,
                11,
                true,
                1,
            );

            // Mock private key generation
            generatePrivateKeysStub.resolves([
                testWallets[0].privateKey,
                testWallets[1].privateKey,
            ]);

            // Mock merkle drop creation
            const mockDrop = {
                root: '0x1234567890abcdef',
                elements: ['elem1', 'elem2'],
                leaves: ['leaf1', 'leaf2'],
                proofs: [
                    [{ position: 'left', data: Buffer.from('proof1', 'hex') }],
                    [{ position: 'right', data: Buffer.from('proof2', 'hex') }],
                ],
            };
            createMerkleDropStub.returns(mockDrop);

            // Mock URL generation
            generateClaimUrlStub.onCall(0).returns('https://app.1inch.io/#/1/qr?d=url1');
            generateClaimUrlStub.onCall(1).returns('https://app.1inch.io/#/1/qr?d=url2');

            const result = await DropService.generateCodes(settings);

            expect(result.merkleRoot).to.equal('0x1234567890abcdef');
            expect(result.height).to.equal(1);
            expect(result.urls).to.have.lengthOf(2);
            expect(generatePrivateKeysStub.calledOnce).to.be.true;
            expect(createMerkleDropStub.calledOnce).to.be.true;
        });

        it('should save QR codes when flagSaveQr is true', async () => {
            const settings = DropService.createDropSettings(
                true, // flagSaveQr
                false,
                [BigInt(2)],
                [ethers.parseEther('1')],
                1,
                11,
                true,
                1,
            );

            generatePrivateKeysStub.resolves([
                testWallets[0].privateKey,
                testWallets[1].privateKey,
            ]);

            const mockDrop = {
                root: '0x1234567890abcdef',
                elements: ['elem1', 'elem2'],
                leaves: ['leaf1', 'leaf2'],
                proofs: [
                    [{ position: 'left', data: Buffer.from('proof1', 'hex') }],
                    [{ position: 'right', data: Buffer.from('proof2', 'hex') }],
                ],
            };
            createMerkleDropStub.returns(mockDrop);
            generateClaimUrlStub.returns('https://app.1inch.io/#/1/qr?d=test');

            await DropService.generateCodes(settings);

            expect(generateQrCodesStub.calledOnce).to.be.true;
        });

        it('should update version file when flagNoDeploy is false', async () => {
            const settings = DropService.createDropSettings(
                false,
                false,
                [BigInt(1)],
                [ethers.parseEther('1')],
                0,
                12,
                false, // flagNoDeploy = false
                1,
            );

            generatePrivateKeysStub.resolves([testWallets[0].privateKey]);
            createMerkleDropStub.returns({
                root: '0x1234567890abcdef',
                elements: ['elem1'],
                leaves: ['leaf1'],
                proofs: [[{ position: 'left', data: Buffer.from('proof1', 'hex') }]],
            });
            generateClaimUrlStub.returns('https://app.1inch.io/#/1/qr?d=test');

            await DropService.generateCodes(settings);

            // Check that version file was updated
            const fs = require('fs');
            const versionContent = fs.readFileSync('./src/.latest', 'utf-8');
            expect(versionContent).to.equal('12');
        });
    });

    describe('validateVersion', () => {
        it('should validate version correctly', () => {
            expect(DropService.validateVersion(11, './src/.latest')).to.be.true;
            expect(DropService.validateVersion(10, './src/.latest')).to.be.false;
            expect(DropService.validateVersion(9, './src/.latest')).to.be.false;
            expect(DropService.validateVersion(-1, './src/.latest')).to.be.false;
        });

        it('should handle missing version file', () => {
            expect(DropService.validateVersion(1, './nonexistent/.latest')).to.be.true;
        });
    });

    describe('getLatestVersion', () => {
        it('should read latest version from file', () => {
            expect(DropService.getLatestVersion('./src/.latest')).to.equal(10);
        });

        it('should return 0 for non-existent file', () => {
            expect(DropService.getLatestVersion('./nonexistent/.latest')).to.equal(0);
        });

        it('should handle corrupted version file', () => {
            mockFs({
                'src': {
                    '.latest': 'not-a-number',
                },
            });

            expect(DropService.getLatestVersion('./src/.latest')).to.equal(-1);
            expect(consoleWarnStub.calledWith('WARNING! Version file is corrupted')).to.be.true;
        });
    });

    describe('generateLinks', () => {
        it('should generate links for Hardhat task', async () => {
            // Mock for 12 total keys (10 test + 2 production) - use valid hex strings
            const mockKeys = Array(12).fill(null).map((_, i) =>
                (i + 1).toString(16).padStart(64, '0'),
            );
            generatePrivateKeysStub.resolves(mockKeys);

            const mockDrop = {
                root: '0xabcdef1234567890',
                elements: Array(12).fill('elem'),
                leaves: Array(12).fill('leaf'),
                proofs: Array(12).fill([{ position: 'left', data: Buffer.from('proof1', 'hex') }]),
            };
            createMerkleDropStub.returns(mockDrop);
            generateClaimUrlStub.returns('https://app.1inch.io/#/1/qr?d=test');

            const result = await DropService.generateLinks(
                '5,10', // amounts
                '1,1',  // counts
                '11',   // version
                1,      // chainId
                true,    // debugMode
            );

            expect(result.merkleRoot).to.equal('0xabcdef1234567890');
            expect(result.height).to.equal(4); // Height for 12 total codes
            // In debug mode, it returns all URLs (test + production)
            expect(result.urls).to.have.lengthOf(12); // All URLs in debug mode
        });

        it('should throw error for invalid version', async () => {
            try {
                await DropService.generateLinks('5', '1', '10', 1, false);
                expect.fail('Should have thrown error');
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                expect(errorMessage).to.include('Version should be greater than');
            }
        });
    });

    describe('createZipArchives', () => {
        it('should call zipFolders with correct paths', () => {
            const zipFoldersStub = sinon.stub(require('../../../src/lib/zip'), 'zipFolders');
      
            const settings = DropService.createDropSettings(
                false, false, [], [], 0, 11, true, 1,
            );

            DropService.createZipArchives(settings, '2024-01');

            expect(zipFoldersStub.calledOnce).to.be.true;
            const call = zipFoldersStub.getCall(0);
            expect(call.args[1][0]).to.include('11-qr-drop-2024-01.zip');
            expect(call.args[1][1]).to.include('11-qr-drop-test-2024-01.zip');

            zipFoldersStub.restore();
        });
    });
});
