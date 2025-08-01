export interface ChainConfig {
  id: number;
  tokenAddress: string;
}

export interface PathConfig {
  latestVersion: string;
  qrCodes: string;
  testQrCodes: string;
  generatedData: string;
}

export interface UrlConfig {
  baseUrl: string;
  encodedPrefix: string;
}

export interface DefaultConfig {
  testCodeCount: number;
  testCodeAmount: string;
}

export interface Config {
  chains: Record<string, ChainConfig>;
  paths: PathConfig;
  urls: UrlConfig;
  defaults: DefaultConfig;
}

export interface DropSettings {
  flagSaveQr: boolean;
  flagSaveLink: boolean;
  flagNoDeploy: boolean;
  codeCounts: bigint[];
  codeAmounts: bigint[];
  testCount: number;
  version: number;
  chainId: number;
  fileLinks: string;
  testLinks: string;
  prefix: string;
  encPrefix: string;
  fileLatest: string;
  pathQr: string;
  pathTestQr: string;
  pathZip: string;
}

export interface MerkleDropData {
  elements: string[];
  leaves: string[];
  root: string;
  proofs: Array<Array<{ position: 'left' | 'right'; data: Buffer }>>;
}

export interface GeneratedLink {
  url: string;
  encUrl?: string;
  amount: string;
  index: number;
}

export interface LinkFileContent {
  count: number;
  root: string;
  amount: string;
  version: number;
  codes: GeneratedLink[];
}

export interface VerificationResult {
  root: string;
  proof: Buffer;
  leaf: string;
  isValid: boolean;
  wallet?: string;
  amount?: bigint;
}

export interface GenerateLinksResult {
  merkleRoot: string;
  height: number;
  urls: string[];
}

export interface CLIOptions {
  dropVersion?: string;
  gencodes?: boolean;
  qrs?: boolean;
  links?: boolean;
  numbers?: string;
  amounts?: string;
  testcodes?: string;
  nodeploy?: boolean;
  cleanup?: boolean;
  zip?: boolean;
  validate?: boolean;
  url?: string;
  root?: string;
  wipe?: boolean;
  chainid?: string;
}

export interface HardhatDropTaskArgs {
  v: string;
  a: string;
  n: string;
  debug?: boolean;
}

export interface HardhatQRDeployTaskArgs {
  r: string;
  v: string;
  h: string;
}
