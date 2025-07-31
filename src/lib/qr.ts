import qr from 'qr-image';
import fs from 'fs';
import path from 'path';

/**
 * Generate QR code and save to file
 */
export function saveQrCode(content: string, index: number, directory: string): void {
  const code = qr.imageSync(content, { type: 'png' });
  const qrFile = path.join(directory, `${index}.png`);
  fs.writeFileSync(qrFile, code);
}

/**
 * Generate multiple QR codes
 */
export function generateQrCodes(
  urls: string[],
  indices: number[],
  testCount: number,
  qrDirectory: string,
  testQrDirectory: string
): void {
  urls.forEach((url, i) => {
    const directory = i < testCount ? testQrDirectory : qrDirectory;
    saveQrCode(url, indices[i], directory);
  });
}

/**
 * Ensure directory exists
 */
export function ensureDirectoryExists(directory: string): void {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}
