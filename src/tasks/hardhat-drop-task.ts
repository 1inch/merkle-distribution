import { HardhatDropTaskArgs, HardhatQRDeployTaskArgs } from '../types';
import { DropService } from '../services/DropService';
import { VerificationService } from '../services/VerificationService';

/**
 * Generate links for merkle drop
 */
export async function generateLinks(
  amounts: string,
  counts: string,
  version: string,
  chainId: number,
  debugMode: boolean
): Promise<{ merkleRoot: string; height: number; urls: string[] }> {
  return DropService.generateLinks(amounts, counts, version, chainId, debugMode);
}

/**
 * Verify a claim link
 */
export function verifyLink(
  url: string,
  root: string,
  chainId: number
): { root: string; proof: Buffer; leaf: string; isValid: boolean } {
  const result = VerificationService.parseLink(url, root, chainId);
  
  if (!result.isValid) {
    throw new Error('Invalid link');
  }
  
  return {
    root: result.root,
    proof: result.proof,
    leaf: result.leaf,
    isValid: result.isValid
  };
}

/**
 * Deploy QR drop contract
 */
export async function deployQRDrop(
  hre: any,
  args: HardhatQRDeployTaskArgs
): Promise<any> {
  const deploymentScript = require('../../deploy/deploy_signature');
  const { deployments, getNamedAccounts } = hre;
  
  return deploymentScript({
    deployments,
    getNamedAccounts,
    version: args.v,
    merkleRoot: args.r,
    merkleHeight: args.h
  });
}

/**
 * Full drop deployment task
 */
export async function dropTask(
  hre: any,
  args: HardhatDropTaskArgs
): Promise<void> {
  const chainId = await hre.getChainId();
  
  console.log('\n🚀 Starting merkle drop deployment...\n');
  
  // Generate links
  const { merkleRoot, height, urls } = await generateLinks(
    args.a,
    args.n,
    args.v,
    Number(chainId),
    args.debug || false
  );
  
  console.log(`\n📊 Generated drop with:`);
  console.log(`   - Merkle root: ${merkleRoot}`);
  console.log(`   - Tree height: ${height}`);
  console.log(`   - Total links: ${urls.length}\n`);
  
  // Deploy contract if not in debug mode
  if (!args.debug) {
    console.log('📝 Deploying contract...\n');
    
    const contract = await deployQRDrop(hre, {
      v: args.v,
      r: merkleRoot,
      h: height.toString()
    });
    
    console.log(`✅ Contract deployed at: ${await contract.getAddress()}\n`);
    
    // Verify all links
    console.log('🔍 Verifying all links...');
    process.stdout.write('[');
    
    let validCount = 0;
    for (const url of urls) {
      try {
        const merkleNode = verifyLink(url, merkleRoot, Number(chainId));
        const response = await contract.verify(merkleNode.proof, merkleNode.leaf);
        const isValid = response[0];
        
        if (isValid) {
          process.stdout.write('\x1b[32m■\x1b[0m');
          validCount++;
        } else {
          process.stdout.write('\x1b[31m■\x1b[0m');
        }
      } catch (error) {
        process.stdout.write('\x1b[31m■\x1b[0m');
      }
    }
    
    process.stdout.write(']\n\n');
    console.log(`✅ Verification complete: ${validCount}/${urls.length} links valid\n`);
  }
}

/**
 * Verify deployment task
 */
export async function verifyDeploymentTask(
  hre: any,
  version: string
): Promise<void> {
  const { deployments } = hre;
  
  const deployed = await deployments.getOrNull(`MerkleDrop128-${version}`);
  
  if (!deployed) {
    console.error(`❌ Deployment file not found for version: ${version}`);
    return;
  }
  
  console.log(`\n🔍 Verifying contract deployment for version ${version}...`);
  console.log(`📍 Contract address: ${deployed.address}\n`);
  
  await hre.run('verify:verify', {
    address: deployed.address,
    constructorArguments: deployed.args
  });
  
  console.log('\n✅ Contract verified successfully!\n');
}
