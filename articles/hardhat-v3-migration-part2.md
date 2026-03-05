# Migrating to Hardhat 3 - Part 2: Deployment Migration

## 1. Introduction

In [Part 1](/articles/hardhat-v3-migration-part1), we covered the foundation of migrating to Hardhat 3: ES module configuration, dependency updates, hardhat.config.ts changes, and test file migration.

In this second part, we tackle **deployment migration** — specifically, replacing `hardhat-deploy` with Hardhat Ignition. This turned out to be one of the more significant changes in our migration, as `hardhat-deploy` (the plugin we were using) is not compatible with Hardhat 3.

We'll cover:
- Why hardhat-deploy doesn't work and what replaces it
- Creating Ignition modules
- Writing deploy scripts with the new API
- Undocumented behaviors we discovered along the way
- Testing deployments

## 2. The hardhat-deploy Problem

Our project previously used `hardhat-deploy` for contract deployments. This popular plugin provided:
- Named deployments with automatic artifact storage
- Network-specific deployment folders (`deployments/mainnet/`, `deployments/base/`, etc.)
- Integration with named accounts
- Deployment scripts with a familiar pattern

**The problem:** `hardhat-deploy` is not compatible with Hardhat 3. The plugin relies on Hardhat 2's internal APIs.

We attempted to use `hardhat-deploy@next` — an experimental version intended for Hardhat 3 support — but couldn't get it to work with the latest Hardhat release.

This led us to **Hardhat Ignition** — the official deployment system built into Hardhat 3. Beyond being the supported replacement, Ignition brings major new features:
- Declarative module-based deployments
- Automatic transaction batching and parallelization
- Built-in recovery from failed deployments
- Transaction simulation before execution
- Deployment visualization and status tracking

While migrating requires rewriting deploy scripts, Ignition is actively maintained by Nomic Foundation and designed specifically for Hardhat 3's architecture.

## 3. Setting Up Hardhat Ignition

To use Ignition, add the plugin to your configuration.

**Install dependencies:**

```bash
yarn add -D @nomicfoundation/hardhat-ignition @nomicfoundation/ignition-core
```

**hardhat.config.ts:**

```typescript
import hardhatIgnition from '@nomicfoundation/hardhat-ignition';

const plugins: HardhatPlugin[] = [
    // ... other plugins
    hardhatIgnition
];
```

**tsconfig.json** — add the ignition folder to the include section:

```diff
{
    "include": [
        "src/**/*",
        "test/**/*",
+       "ignition/**/*",
        "hardhat.config.ts"
    ],
}
```

Without this change, VS Code will show errors when you try to reference ignition modules from other scripts.

Once registered, the plugin adds an `ignition` property to network connections, which you'll use for deploying modules.

## 4. Creating Ignition Modules

Ignition uses a declarative module pattern. Instead of imperative deploy scripts, you define *what* to deploy, and Ignition handles *how*.

Create modules in the `ignition/modules/` directory:

**ignition/modules/signature.ts:**

```typescript
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SignatureDrop", (m) => {
  const drop = m.contract("SignatureMerkleDrop128", [
    m.getParameter<string>('token'),
    m.getParameter<string>('merkleRoot'),
    m.getParameter<number>('merkleHeight'),
  ]);
  return { drop };
});
```

Key concepts:
- **`buildModule(name, callback)`** — Creates a named module. The name is used to identify this module in deployments.
- **`m.contract(name, args)`** — Declares a contract deployment. Arguments can be static values or parameters.
- **`m.getParameter<T>(name)`** — Declares a parameter that must be provided at deploy time. This keeps your modules reusable across different deployments.
- **Return object** — Exposed contracts that can be used by other modules or accessed after deployment.

Our contract is relatively simple with just a single deployment. Ignition is capable of much more — you can program complex multi-contract deployment scenarios with dependencies, call existing contracts, and orchestrate entire protocol deployments. However, these complex scenarios are limited to single-repo deployments — Ignition doesn't support cross-repo deployment coordination.

## 5. Writing Deploy Scripts

In our project, deployment parameters (version, merkle root, tree height) come from a Hardhat task that the user runs interactively. Ignition modules have [certain limitations](https://hardhat.org/ignition/docs/guides/scripts).

To overcome these limitations, we wrap Ignition in a deploy script. This gives us the flexibility to process parameters from tasks and handle custom logging.

**ignition/deploy-signature.ts:**

```typescript
import hre from 'hardhat';
import SignatureDropModule from './modules/signature';

export async function deploy(version: number, merkleRoot: string, merkleHeight: number) {
    const connection = await hre.network.connect();
    const chainId = connection.networkConfig.chainId;
    const networkName = connection.networkName;

    // Load token address for this chain
    const rewardTokens = (await import('./reward-tokens.json')).oneInch;
    const rewardToken = rewardTokens.find((t) => t.networkId == chainId);
    
    if (!rewardToken) {
        console.log('No reward token mapped for chain', chainId);
        return;
    }

    const { drop } = await connection.ignition.deploy(SignatureDropModule, {
        parameters: {
            "SignatureDrop": {
                "token": rewardToken.addr,
                "merkleRoot": merkleRoot,
                "merkleHeight": merkleHeight
            }
        },
        deploymentId: `${networkName}-MerkleDrop-${version}`,
    });

    console.log(`Deployed at address: ${drop.target}`);
    return drop;
}
```

Key points:

- **`hre.network.connect()`** — Creates a connection to the network, same pattern as in tests.
- **`connection.ignition.deploy(module, options)`** — Deploys the module with parameters.
- **`parameters` object** — This is where you pass values for `m.getParameter()` calls. The object is keyed by module name, then parameter name. **Note:** The docs primarily show file-based parameters, but passing them as an object works and is more flexible for programmatic deployments.
- **`deploymentId`** — Unique identifier for this deployment. Ignition uses this to track deployment state and enable resumption if something fails.

## 6. Deployment Folder Structure

One notable difference from `hardhat-deploy`: Ignition uses a **flat deployment structure**.

With `hardhat-deploy`, we had:
```
deployments/
├── mainnet/
│   ├── MerkleDrop128-2.json
│   └── MerkleDrop128-5.json
├── base/
│   └── MerkleDrop128-42.json
└── bsc/
    └── MerkleDrop128-3.json
```

With Ignition, deployments are stored in:
```
ignition/deployments/
├── mainnet-MerkleDrop-2/
├── mainnet-MerkleDrop-5/
├── base-MerkleDrop-42/
└── bsc-MerkleDrop-3/
```

Ignition doesn't support organizing deployments into `chainName/deploymentId` subfolders — all deployments are at the same level. The network name is encoded in the `deploymentId` instead.

## 7. Migration from hardhat-deploy

Unfortunately, we found no automated way to convert existing `hardhat-deploy` artifacts to Ignition format. The artifact structures are fundamentally different.

Our approach:
- **Keep the old `deployments/` folder** for historical reference and reading existing deployment addresses
- **Use Ignition for all new deployments** going forward
- **Implement auto-discovery logic** in tasks to determine whether a deployment comes from the old (`hardhat-deploy`) or new (Ignition) format, and read from the appropriate location

Another challenge: with `hardhat-deploy`, the `deployments` object provided convenient methods to load and read deployment files. Ignition doesn't offer an equivalent — we now have to parse deployment JSON files manually in our tasks.

## 8. Testing Deployments

Before testing deployments, configure your networks in `hardhat.config.ts`:

```typescript
import { configDotenv } from 'dotenv';

networks: {
    hardhat: {
        type: 'edr-simulated',
        chainId: 31337,
    },
    localhost: {
        type: 'http',
        url: 'http://localhost:8545',
        chainId: 31337,
    },
    base: {
        type: 'http',
        url: configDotenv().parsed?.BASE_RPC_URL || 'https://base.drpc.org',
        chainId: 8453,
        accounts: [configDotenv().parsed?.BASE_PRIVATE_KEY || ''],
    }
},
```

Key points:
- **`type` property** — Hardhat 3 requires explicitly specifying the network type (`'edr-simulated'` for in-memory or `'http'` for RPC connections)
- **`accounts` array** — Load private keys from environment variables for production deployments. Store them in a `.env` file and use `dotenv` to load them.

To test your deploy scripts locally:

```bash
yarn hardhat run ./ignition/deploy-signature.ts --network localhost
```

Make sure you have a node running with `yarn hardhat node` first.

## 9. Contract Verification

After deploying a contract, you typically want to verify its source code on a block explorer like Etherscan. Hardhat 3 uses the `@nomicfoundation/hardhat-verify` plugin (v3) for this.

### 9.1 Plugin Setup

We already added `@nomicfoundation/hardhat-verify` v3 as part of the dependency updates in [Part 1](/articles/hardhat-v3-migration-part1). If you don't have it installed yet:

```bash
yarn add -D @nomicfoundation/hardhat-verify
```

**hardhat.config.ts:**

```typescript
import hardhatVerify from "@nomicfoundation/hardhat-verify";

const plugins: HardhatPlugin[] = [
    // ... other plugins
    hardhatVerify,
];

export default defineConfig({
    plugins,
    // ...
    verify: {
        etherscan: {
            apiKey: configDotenv().parsed?.ETHERSCAN_API_KEY || '',
        },
        blockscout: {
            enabled: false,
        },
        sourcify: {
            enabled: false,
        },
    }
});
```

Note the config structure change from Hardhat 2: the Etherscan API key now lives under `verify.etherscan.apiKey` instead of the top-level `etherscan` object. Blockscout and Sourcify are enabled by default — disable them explicitly if you only want Etherscan verification.

### 9.2 Build Profiles and `evmVersion`: The Verification Pitfall (Watch Out!)

This was the most frustrating issue we encountered during migration. Verification would fail with:

```
Fail - Unable to verify. Compiled contract deployment bytecode
does NOT match the transaction deployment bytecode.
```

The exact same contract, compiler version, and optimizer settings that worked perfectly with Hardhat 2 suddenly produced bytecode mismatches. Two issues were at play:

**Issue 1: Build profiles.** Hardhat 3 introduces [build profiles](https://hardhat.org/docs/guides/writing-contracts/build-profiles) — a new concept that doesn't exist in Hardhat 2:
- **`default`** — used by most tasks (compile, test)
- **`production`** — used by Hardhat Ignition for deployments, with its own defaults (optimizer enabled, [Isolated Builds](https://hardhat.org/docs/guides/writing-contracts/isolated-builds) enabled)

When you define your Solidity config without explicit profiles, **you're only configuring the `default` profile**. The `production` profile keeps its own defaults — which may differ from your settings (e.g., optimizer `runs` defaults to 200, not your configured 1,000,000).

Here's the sequence that causes the failure:
1. Ignition deploys using the `production` profile → bytecode compiled with production defaults
2. `verifyContract` reads build artifacts from the `default` profile → sends different compilation settings to Etherscan
3. Etherscan recompiles with those different settings → bytecode doesn't match → verification fails

**Issue 2: `evmVersion` default.** If you were relying on an explicit `evmVersion` in your Hardhat 2 config (as we were with `'shanghai'`), make sure to carry it over. Hardhat's default `evmVersion` is `paris`, not the solc default of `shanghai` for 0.8.23+. The difference is significant — `shanghai` uses the `PUSH0` opcode while `paris` doesn't, producing entirely different bytecode.

**The fix:** Explicitly configure both profiles with identical settings, including `evmVersion`:

```diff
export default defineConfig({
    solidity: {
-       version: '0.8.23',
-       settings: {
-           optimizer: {
-               enabled: true,
-               runs: 1000000,
-           },
-       },
+       profiles: {
+           default: {
+               version: '0.8.23',
+               settings: {
+                   optimizer: {
+                       enabled: true,
+                       runs: 1000000,
+                   },
+                   evmVersion: 'shanghai',
+               },
+           },
+           production: {
+               version: '0.8.23',
+               settings: {
+                   optimizer: {
+                       enabled: true,
+                       runs: 1000000,
+                   },
+                   evmVersion: 'shanghai',
+               },
+           },
+       },
        npmFilesToBuild: ["@1inch/solidity-utils/contracts/mocks/TokenMock.sol"],
    },
});
```

### 9.3 Programmatic Verification

To verify from a deploy script (useful when deployment is triggered by a Hardhat task), use the `verifyContract` function:

```typescript
import hre from 'hardhat';
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";

export async function deploy(version: number, merkleRoot: string, merkleHeight: number) {
    const connection = await hre.network.connect();
    const chainId = connection.networkConfig.chainId;

    const constructorArgs: [string, string, number] = [rewardToken.addr, merkleRoot, merkleHeight];

    const { drop } = await connection.ignition.deploy(SignatureDropModule, {
        parameters: { /* ... */ },
        deploymentId: `${connection.networkName}-MerkleDrop-${version}`,
    });

    // Verify on Etherscan (skip for local networks)
    if (chainId !== 31337) {
        await verifyContract({
            address: drop.target.toString(),
            constructorArgs: constructorArgs,
        }, hre);
    }
}
```

### 9.4 CLI Verification

You can also verify after deployment using the CLI:

```bash
yarn hardhat verify --network sepolia 0x1234567890...
```

Hardhat automatically determines which contract to verify by compiling all contracts in the project and matching the resulting bytecodes against the deployed bytecode fetched from the on-chain address. If you have contracts with the same name in different files, you can disambiguate with `--contract`:

```bash
yarn hardhat verify --network sepolia --contract contracts/SignatureMerkleDrop128.sol:SignatureMerkleDrop128 0x1234...
```

If your contract has constructor arguments, pass them after the address:

```bash
yarn hardhat verify --network sepolia 0x1234... "0xTokenAddr" "0xMerkleRoot" 7
```

By default, the `verify` task uses the `production` build profile. If you deployed with a different profile, specify it with `--build-profile`:

```bash
yarn hardhat verify --network sepolia --build-profile default 0x1234...
```

## 10. What's Next

In **Part 3**, we'll cover migrating Hardhat tasks to the new v3 task system, including:
- The new task definition syntax
- Accessing network connections from tasks
- Integrating tasks with Ignition deploy scripts
