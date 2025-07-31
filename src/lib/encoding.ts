import { VerificationResult } from '../types';
import { getAddressFromPrivateKey } from './wallet';
import { verifyMerkleProof, keccak128 } from './merkle';
import { MerkleTree } from 'merkletreejs';

/**
 * Encode buffer to URI-safe base64
 */
export function uriEncode(buffer: Buffer): string {
  return encodeURIComponent(
    buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '!')
  );
}

/**
 * Decode URI-safe base64 to buffer
 */
export function uriDecode(encoded: string): Buffer {
  const base64 = decodeURIComponent(encoded)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/!/g, '=');
  return Buffer.from(base64, 'base64');
}

/**
 * Generate a claim URL from components
 */
export function generateClaimUrl(
  privateKey: string,
  amount: bigint,
  proof: Array<{ position: 'left' | 'right'; data: Buffer }>,
  version: number,
  prefix: string
): string {
  // Version buffer (1 byte)
  const versionBuffer = Buffer.from([version]);
  
  // Private key buffer (16 bytes from the last 32 chars)
  const keyBuffer = Buffer.from(privateKey.substring(32), 'hex');
  
  // Amount buffer (12 bytes)
  const amountBuffer = Buffer.from(amount.toString(16).padStart(24, '0'), 'hex');
  
  // Proof buffer (concatenated proof data)
  const proofBuffer = Buffer.concat(proof.map(p => p.data));
  
  // Combine all buffers
  const combinedBuffer = Buffer.concat([versionBuffer, keyBuffer, amountBuffer, proofBuffer]);
  
  // Encode and create URL
  const encoded = uriEncode(combinedBuffer);
  return `${prefix}d=${encoded}`;
}

/**
 * Parse and verify a claim URL
 */
export function parseClaimUrl(
  url: string,
  root: string,
  prefix: string,
  displayResults: boolean = false
): VerificationResult {
  // Extract encoded data from URL
  const encodedData = url.substring(prefix.length + 2);
  const buffer = uriDecode(encodedData);
  
  // Parse components
  // const version = buffer[0]; // Currently unused but part of the protocol
  const keyBuffer = buffer.slice(1, 17);
  const amountBuffer = buffer.slice(17, 29);
  let proofBuffer = buffer.slice(29);
  
  // Reconstruct proof array
  const proof: Buffer[] = [];
  while (proofBuffer.length > 0) {
    proof.push(proofBuffer.slice(0, 16));
    proofBuffer = proofBuffer.slice(16);
  }
  
  // Reconstruct private key and derive wallet
  const privateKey = keyBuffer.toString('hex').padStart(64, '0');
  const wallet = getAddressFromPrivateKey(privateKey);
  
  // Parse amount
  const amount = BigInt('0x' + amountBuffer.toString('hex'));
  
  // Verify proof
  const element = wallet + amount.toString(16).padStart(64, '0');
  const leaf = MerkleTree.bufferToHex(keccak128(element));
  const isValid = verifyMerkleProof(wallet, amount, proof, root);
  
  if (displayResults) {
    console.log('root : ' + root);
    console.log('proof: 0x' + Buffer.concat(proof).toString('hex'));
    console.log('leaf : ' + leaf);
  }
  
  return {
    root,
    proof: Buffer.concat(proof),
    leaf,
    isValid,
    wallet,
    amount
  };
}

/**
 * Shuffle an array in place
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  let currentIndex = shuffled.length;
  
  while (currentIndex !== 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    
    [shuffled[currentIndex], shuffled[randomIndex]] = 
    [shuffled[randomIndex], shuffled[currentIndex]];
  }
  
  return shuffled;
}
