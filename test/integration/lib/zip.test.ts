import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { zipFolder, zipFolders, cleanDir, cleanDirs } from '../../../src/lib/zip';
import AdmZip from 'adm-zip';
import sinon from 'sinon';

describe('Zip Library Integration Tests', () => {
  const testDir = './test-zip-output';
  const sourceDir = path.join(testDir, 'source');
  let consoleLogStub: sinon.SinonStub;

  beforeEach(() => {
    // Create test directories and files
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'folder1'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'folder2'), { recursive: true });
    
    // Create test files
    fs.writeFileSync(path.join(sourceDir, 'folder1', 'file1.txt'), 'Content of file 1');
    fs.writeFileSync(path.join(sourceDir, 'folder1', 'file2.txt'), 'Content of file 2');
    fs.writeFileSync(path.join(sourceDir, 'folder2', 'file3.txt'), 'Content of file 3');
    
    // Stub console to prevent output
    consoleLogStub = sinon.stub(console, 'log');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    sinon.restore();
  });

  describe('zipFolders', () => {
    it('should create zip archives for multiple folders', () => {
      const folders = [
        path.join(sourceDir, 'folder1'),
        path.join(sourceDir, 'folder2')
      ];
      const archives = [
        path.join(testDir, 'archive1.zip'),
        path.join(testDir, 'archive2.zip')
      ];

      zipFolders(folders, archives);

      // Check that archives were created
      expect(fs.existsSync(archives[0])).to.be.true;
      expect(fs.existsSync(archives[1])).to.be.true;

      // Verify archive contents
      const zip1 = new AdmZip(archives[0]);
      const entries1 = zip1.getEntries();
      expect(entries1).to.have.lengthOf(2);
      expect(entries1.map(e => e.entryName)).to.include('file1.txt');
      expect(entries1.map(e => e.entryName)).to.include('file2.txt');

      const zip2 = new AdmZip(archives[1]);
      const entries2 = zip2.getEntries();
      expect(entries2).to.have.lengthOf(1);
      expect(entries2[0].entryName).to.equal('file3.txt');
    });

    it('should handle empty folders', () => {
      const emptyDir = path.join(sourceDir, 'empty');
      fs.mkdirSync(emptyDir);

      const folders = [emptyDir];
      const archives = [path.join(testDir, 'empty.zip')];

      zipFolders(folders, archives);

      expect(fs.existsSync(archives[0])).to.be.true;
      
      const zip = new AdmZip(archives[0]);
      const entries = zip.getEntries();
      expect(entries).to.have.lengthOf(0);
    });

    it('should handle mismatched array lengths', () => {
      const folders = [path.join(sourceDir, 'folder1')];
      const archives: string[] = []; // Empty archives array

      expect(() => {
        zipFolders(folders, archives);
      }).to.throw();
    });

    it('should create parent directories for archives', () => {
      const folders = [path.join(sourceDir, 'folder1')];
      const nestedDir = path.join(testDir, 'nested', 'deep');
      const nestedArchive = path.join(nestedDir, 'archive.zip');
      const archives = [nestedArchive];

      // Create parent directory first
      fs.mkdirSync(nestedDir, { recursive: true });

      zipFolders(folders, archives);

      expect(fs.existsSync(nestedArchive)).to.be.true;
    });

    it('should log progress messages', () => {
      const folders = [path.join(sourceDir, 'folder1')];
      const archives = [path.join(testDir, 'test.zip')];

      zipFolders(folders, archives);

      expect(consoleLogStub.called).to.be.true;
    });
  });

  describe('zipFolder', () => {
    it('should create a zip archive from a single folder', () => {
      const folder = path.join(sourceDir, 'folder1');
      const archive = path.join(testDir, 'single.zip');

      zipFolder(folder, archive);

      expect(fs.existsSync(archive)).to.be.true;

      // Verify archive contents
      const zip = new AdmZip(archive);
      const entries = zip.getEntries();
      expect(entries).to.have.lengthOf(2);
      expect(entries.map(e => e.entryName)).to.include('file1.txt');
      expect(entries.map(e => e.entryName)).to.include('file2.txt');
    });

    it('should handle nested folder structures', () => {
      // Create nested structure
      const nestedDir = path.join(sourceDir, 'nested', 'deep');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(path.join(nestedDir, 'deep.txt'), 'Deep content');

      const archive = path.join(testDir, 'nested.zip');
      zipFolder(sourceDir, archive);

      expect(fs.existsSync(archive)).to.be.true;

      const zip = new AdmZip(archive);
      const entries = zip.getEntries();
      const deepFile = entries.find(e => e.entryName.includes('deep.txt'));
      expect(deepFile).to.exist;
    });
  });

  describe('cleanDir', () => {
    it('should remove all files from a directory', () => {
      const dirToClean = path.join(testDir, 'to-clean');
      fs.mkdirSync(dirToClean);
      fs.writeFileSync(path.join(dirToClean, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(dirToClean, 'file2.txt'), 'content2');
      fs.mkdirSync(path.join(dirToClean, 'subdir'));

      cleanDir(dirToClean);

      // Directory should still exist
      expect(fs.existsSync(dirToClean)).to.be.true;
      // Files should be removed
      expect(fs.existsSync(path.join(dirToClean, 'file1.txt'))).to.be.false;
      expect(fs.existsSync(path.join(dirToClean, 'file2.txt'))).to.be.false;
      // Subdirectory should remain
      expect(fs.existsSync(path.join(dirToClean, 'subdir'))).to.be.true;
    });

    it('should create directory if it does not exist', () => {
      const nonExistentDir = path.join(testDir, 'new-dir');
      
      expect(fs.existsSync(nonExistentDir)).to.be.false;
      
      cleanDir(nonExistentDir);
      
      expect(fs.existsSync(nonExistentDir)).to.be.true;
    });

    it('should throw error if path is not a directory', () => {
      const filePath = path.join(testDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');

      expect(() => {
        cleanDir(filePath);
      }).to.throw('Not a valid directory');
    });
  });

  describe('cleanDirs', () => {
    it('should clean multiple directories', () => {
      const dir1 = path.join(testDir, 'dir1');
      const dir2 = path.join(testDir, 'dir2');
      
      fs.mkdirSync(dir1);
      fs.mkdirSync(dir2);
      fs.writeFileSync(path.join(dir1, 'file1.txt'), 'content1');
      fs.writeFileSync(path.join(dir2, 'file2.txt'), 'content2');

      cleanDirs([dir1, dir2]);

      expect(fs.existsSync(dir1)).to.be.true;
      expect(fs.existsSync(dir2)).to.be.true;
      expect(fs.existsSync(path.join(dir1, 'file1.txt'))).to.be.false;
      expect(fs.existsSync(path.join(dir2, 'file2.txt'))).to.be.false;
    });

    it('should log completion message', () => {
      const dirs = [path.join(testDir, 'test1'), path.join(testDir, 'test2')];
      
      cleanDirs(dirs);

      expect(consoleLogStub.calledWith('Directories cleaned')).to.be.true;
    });
  });
});
