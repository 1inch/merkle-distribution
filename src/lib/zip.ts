import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

/**
 * Zip a single folder to an output file
 */
export function zipFolder(sourceDir: string, outputFile: string): void {
  const zip = new AdmZip();
  zip.addLocalFolder(sourceDir);
  zip.writeZip(outputFile);
  console.log(`Created ${outputFile}`);
}

/**
 * Zip multiple folders to corresponding output files
 */
export function zipFolders(sourceDirs: string[], outputFiles: string[]): void {
  if (sourceDirs.length !== outputFiles.length) {
    throw new Error('Source and output directories must be the same length');
  }

  for (let i = 0; i < sourceDirs.length; i++) {
    zipFolder(sourceDirs[i], outputFiles[i]);
  }
}

/**
 * Clean all files in a directory
 */
export function cleanDir(directoryPath: string): void {
  // Check if the directory exists and it's a directory
  if (!fs.existsSync(directoryPath)) {
    console.log(`Directory does not exist: ${directoryPath}, creating it...`);
    fs.mkdirSync(directoryPath, { recursive: true });
    return;
  }

  if (!fs.statSync(directoryPath).isDirectory()) {
    throw new Error(`Not a valid directory: ${directoryPath}`);
  }

  const files = fs.readdirSync(directoryPath);
  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    if (fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  }
}

/**
 * Clean multiple directories
 */
export function cleanDirs(directoryPaths: string[]): void {
  for (const directoryPath of directoryPaths) {
    cleanDir(directoryPath);
  }
  console.log('Directories cleaned');
}
