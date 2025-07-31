import Wallet from 'ethereumjs-wallet';
import { randomBytes } from 'crypto';
import { promisify } from 'util';

const randomBytesAsync = promisify(randomBytes);

/**
 * Generate a random private key (16 bytes, padded to 64 hex chars)
 */
export async function generatePrivateKey(): Promise<string> {
  const bytes = await randomBytesAsync(16);
  return bytes.toString('hex').padStart(64, '0');
}

/**
 * Generate multiple private keys
 */
export async function generatePrivateKeys(count: number): Promise<string[]> {
  return Promise.all(Array.from({ length: count }, generatePrivateKey));
}

/**
 * Get wallet address from private key
 */
export function getAddressFromPrivateKey(privateKey: string): string {
  const wallet = Wallet.fromPrivateKey(Buffer.from(privateKey, 'hex'));
  return wallet.getAddressString();
}

/**
 * Generate wallets (private keys and addresses)
 */
export async function generateWallets(count: number): Promise<{ privateKey: string; address: string }[]> {
  const privateKeys = await generatePrivateKeys(count);
  return privateKeys.map(privateKey => ({
    privateKey,
    address: getAddressFromPrivateKey(privateKey)
  }));
}
