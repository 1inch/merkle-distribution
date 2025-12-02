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

*Coming soon — contract verification with Ignition will be covered in a future update.*

## 10. What's Next

In **Part 3**, we'll cover migrating Hardhat tasks to the new v3 task system, including:
- The new task definition syntax
- Accessing network connections from tasks
- Integrating tasks with Ignition deploy scripts
