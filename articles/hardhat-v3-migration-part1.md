# Migrating to Hardhat 3 - Part 1: Initial Configuration and Test Migration

## 1. Introduction

### 1.1 Our Journey: Hardhat → Forge → Hardhat 3

At 1inch, we've been on quite a journey with Ethereum development tooling.

A couple of years ago, we started migrating from Hardhat v2 to Forge (Foundry) because it offered something we really wanted: **tests written in Solidity**. The ability to write tests in the same language as our contracts seemed like a significant advantage for testing complex DeFi protocols.

However, Forge caused us considerable pain in practice. While powerful in some areas, the overall experience didn't work well for our workflow.

When **Hardhat 3** was released, we saw an opportunity to return. Hardhat 3 now supports:
- **Native Solidity tests** — the feature that originally attracted us to Forge
- **Fuzz testing** — automated property-based testing with random inputs  
- **Invariant testing** — continuous verification of system invariants

These additions, combined with our existing familiarity with Hardhat's tooling and the fact that we already had significant TypeScript infrastructure built around it, made migrating back a practical choice.

**This article series documents our migration experience**, sharing the challenges we encountered and solutions we developed so other developers can avoid the same pitfalls.

### 1.2 The Project Being Migrated

For this migration, we chose the **Merkle Distribution** project ([github.com/1inch/merkle-distribution](https://github.com/1inch/merkle-distribution)). It's an open-source tool for generating and managing token drops — distributing tokens to users via merkle tree proofs through QR codes, web links, or NFC tags. We use it internally and make it available for anyone to use.

**Tech stack:** The project uses Solidity for smart contracts, TypeScript for tooling and tests, Hardhat v2 as the development framework, yarn as package manager, plus ESLint for TypeScript and Solhint for Solidity linting.

We picked this project specifically because it's standalone — it doesn't depend on our other protocols like 1inch Aggregator or Limit Orders. This isolation made it a safe candidate to test the migration process without risking breaking dependencies across our codebase.

The project uses Hardhat for three main purposes:

**Testing:** We have smart contract tests for our merkle drop contracts, plus unit and integration tests for the TypeScript services. The test suite includes shared behavior modules — a pattern where common test logic is extracted into reusable functions.

**Deployments:** The contracts are deployed across multiple networks using `hardhat-deploy`. Each deployment is versioned, and we've accumulated several dozen deployment artifacts over time that need to be preserved.

**Contract Management via Tasks:** We built custom Hardhat tasks for the full drop lifecycle: generating claim links, deploying contracts, verifying deployments on block explorers, checking claim statistics, and rescuing unclaimed tokens.

This combination — tests with shared behaviors, multi-network deployments, and heavy task usage — exercises most of the Hardhat features that change in v3.

### 1.3 Article Series Overview

This migration guide is organized into three parts:

- **Part 1: Initial Configuration and Test Migration** ← you are here
- **Part 2: Deployment Migration**
- **Part 3: Making Tasks Work with Hardhat 3**

In this first part, we cover configuration file changes and test migration, including some non-obvious issues we encountered along the way.

## 2. Configuration Changes

### 2.1 Moving to ES Modules

Hardhat 3 is built on ES modules ([see Hardhat docs](https://hardhat.org/docs/hardhat3/whats-new#esm-first)), so the first step is configuring your project for ESM.

**package.json:**

```diff
{
+  "type": "module",
   ...
}
```

Even in a TypeScript project, this setting is required. When you run code via `ts-node` or when TypeScript compiles to JS, Node.js uses this flag to determine how to handle module imports/exports. Without it, `ts-node` defaults to CommonJS behavior.

**tsconfig.json:**

```diff
{
  "compilerOptions": {
-    "module": "nodenext",
-    "moduleResolution": "nodenext",
+    "module": "esnext",
+    "moduleResolution": "bundler",
  },
+ "ts-node": {
+   "esm": true,
+   "experimentalSpecifierResolution": "node",
+   "transpileOnly": true
+ }
}
```

The `module` and `moduleResolution` changes:
- `module: "esnext"` — Outputs standard ES modules. The previous `nodenext` was tied to Node.js-specific ESM quirks; `esnext` is more compatible with Hardhat 3's module system.
- `moduleResolution: "bundler"` — This newer resolution strategy supports modern package.json `exports` fields, which Hardhat 3 packages use extensively. The old `nodenext` resolution had stricter requirements that don't work well with how Hardhat 3 exports its modules.

The `ts-node` section enables running TypeScript files directly with ESM:
- `esm: true` — Enable ES module mode
- `experimentalSpecifierResolution: "node"` — Allows Node.js-style imports (like importing directories with index files)
- `transpileOnly: true` — Faster compilation by skipping type checking

**Additional tsconfig.json changes:**

You may also need to update `types` and `exclude` sections:

```diff
{
  "compilerOptions": {
-    "types": ["node"],
+    "types": ["node", "chai", "hardhat", "ethers"],
  },
  "exclude": [
    "node_modules",
    "dist",
-   "test",
-   "**/*.test.ts"
  ],
}
```

- **types:** In Hardhat 2 with CommonJS, type declarations were auto-discovered through module resolution — when you `import 'hardhat'`, TypeScript follows the module and finds its `.d.ts` files automatically. In Hardhat 3 with ESM, the module structure is different. The `await network.connect()` pattern returns objects whose types need to be resolved differently, so adding explicit `"hardhat"` and `"ethers"` entries ensures TypeScript can find the type declarations.
- **exclude:** If you previously excluded test files, remove them from `exclude`. Otherwise VS Code won't recognize Hardhat objects in your tests and will show compilation errors — even though the tests actually run correctly via ts-node.

### 2.2 Dependency Updates

The Hardhat 3 ecosystem uses a new set of packages. In `package.json`, you'll need to remove the old Hardhat 2 devDependencies and add the new ones:

```diff
"devDependencies": {
-   "hardhat": "2.26.1",
+   "hardhat": "3.0.15",

-   "@nomicfoundation/hardhat-chai-matchers": "2.1.0",
-   "@nomicfoundation/hardhat-ethers": "3.1.0",
-   "@nomicfoundation/hardhat-verify": "2.1.0",
-   "hardhat-dependency-compiler": "1.2.1",
-   "hardhat-gas-reporter": "2.3.0",
-   "solidity-coverage": "0.8.16",

+   "@nomicfoundation/hardhat-ethers": "^4.0.3",
+   "@nomicfoundation/hardhat-ethers-chai-matchers": "^3.0.2",
+   "@nomicfoundation/hardhat-ignition": "^3.0.5",
+   "@nomicfoundation/hardhat-ignition-ethers": "^3.0.5",
+   "@nomicfoundation/hardhat-keystore": "^3.0.3",
+   "@nomicfoundation/hardhat-mocha": "^3.0.7",
+   "@nomicfoundation/hardhat-network-helpers": "^3.0.3",
+   "@nomicfoundation/hardhat-toolbox-mocha-ethers": "3.0.1",
+   "@nomicfoundation/hardhat-typechain": "^3.0.1",
+   "@nomicfoundation/hardhat-verify": "^3.0.7",
+   "@nomicfoundation/ignition-core": "^3.0.5",

-   "chai": "4.5.0",
+   "chai": "5.1.2",
    // ... other dependencies
}
```

Note that some packages like `hardhat-deploy`, `hardhat-dependency-compiler`, `hardhat-gas-reporter`, and `solidity-coverage` are no longer compatible with Hardhat 3.

> **Note on yarn:** Yarn doesn't auto-install peer dependencies by default. You may need to manually add some dependencies that other packages require as peers — check the installation warnings and add them explicitly.

## 3. Hardhat Configuration Migration

Hardhat 3 introduces a new configuration format ([see configuration reference](https://hardhat.org/docs/reference/configuration)). The main changes are:
- The `defineConfig()` function replaces the plain object export
- Plugins are now imported as ES modules and explicitly registered in a `plugins` array
- Side-effect imports (`import 'plugin-name'`) are replaced with named imports

### 3.1 Configuration Code Changes

In Hardhat 3, plugins must be explicitly registered in the `plugins` array. If a plugin is not listed there, the objects and functions it provides will be `undefined` when you try to access them from hardhat runtime environment. This is a common source of errors during migration — if something that worked before is now undefined, check that its plugin is registered.

**Before (Hardhat 2):**
```typescript
import '@nomicfoundation/hardhat-verify';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import 'hardhat-dependency-compiler';
import { HardhatUserConfig } from 'hardhat/config';

const config: HardhatUserConfig = {
    solidity: { ... },
    networks: { ... },
};

export default config;
```

**After (Hardhat 3):**
```typescript
import { defineConfig } from 'hardhat/config';
import type { HardhatPlugin } from 'hardhat/types/plugins';
import hardhatEthers from '@nomicfoundation/hardhat-ethers';
import hardhatToolboxMochaEthers from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import hardhatEthersChaiMatchers from '@nomicfoundation/hardhat-ethers-chai-matchers';
import hardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';

const plugins: HardhatPlugin[] = [
    hardhatNetworkHelpers,
    hardhatEthers,
    hardhatToolboxMochaEthers,
    hardhatEthersChaiMatchers,
];

export default defineConfig({
    plugins,
    solidity: { ... },
});
```

### 3.2 Using External Library Contracts

With `hardhat-dependency-compiler` gone, Hardhat 3 provides a native way to compile contracts from npm packages using the `npmFilesToBuild` configuration option ([see NPM artifacts docs](https://hardhat.org/docs/cookbook/npm-artifacts#_top)):

```diff
export default defineConfig({
    plugins,
    solidity: {
        version: '0.8.23',
        settings: { ... },
+       npmFilesToBuild: ["@1inch/solidity-utils/contracts/mocks/TokenMock.sol"],
    },
-   dependencyCompiler: {
-       paths: ['@1inch/solidity-utils/contracts/mocks/TokenMock.sol'],
-   },
});
```

If you don't add external contracts to `npmFilesToBuild`, they won't be compiled and won't be available in your tests.

## 4. Tests Migration

### 4.1 Import Changes

In Hardhat 3, you no longer import `ethers`, `loadFixture`, etc. directly from hardhat or plugin packages. Instead, you call `network.connect()` which creates a connection to a local blockchain simulation and returns the associated objects ([see Hardhat testing docs](https://hardhat.org/docs/guides/testing/using-ethers)).

You can call `network.connect()` at the module level (shared across all tests in the file) or inside each `describe` block (separate connection per describe). If called in each describe, each one gets its own blockchain simulation with isolated state.

```diff
- import '@nomicfoundation/hardhat-chai-matchers';
- import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
- import { Contract, Signer } from 'ethers';
-
- const hre = require('hardhat');
- const { ethers } = hre;

+ import { expect } from 'chai';
+ import type { Contract, Signer } from 'ethers';
+ import { network } from 'hardhat';
+
+ const { ethers, networkHelpers } = await network.connect();
+ const { loadFixture } = networkHelpers;
```

Key changes:
- No more side-effect plugin imports (`import '@nomicfoundation/...'`)
- `ethers` comes from `network.connect()`, not from `require('hardhat')`
- `loadFixture` comes from `networkHelpers` returned by `network.connect()`
- `chai` can be imported directly with named exports

> **Note on type-only imports:** When you only use an import for type annotations (like `Contract` for typing a variable), use `import { type X }`. This tells TypeScript not to emit the import in the JavaScript output, avoiding potential runtime errors in ESM mode when the module's exports don't match what Node.js expects.

### 4.2 loadFixture with Modular Tests (Watch Out!)

This is a subtle issue that caused us significant debugging time. When organizing tests into separate behavior modules, you may encounter a problem where `loadFixture` doesn't reset properly between tests.

**The symptom:** Tests work when defined in a single file but fail when behavior functions are extracted to separate modules. The fixture appears to run only once instead of being reset for each test.

**The root cause:** In ESM, each module calling `await network.connect()` at the top level gets its own separate blockchain simulation instance. If `behavior.ts` has its own `network.connect()` call, it uses a different `loadFixture` instance than the test file — and these don't coordinate their snapshot/restore mechanisms.

**Failing (separate modules):**
```typescript
// behavior.ts
import { network } from 'hardhat';
const { networkHelpers } = await network.connect();  // ⚠️ Own network instance
const { loadFixture } = networkHelpers;

export function shouldBehaveLikeDrop() {
    // Uses loadFixture from THIS module's network - wrong context
}

// test.ts
import { shouldBehaveLikeDrop } from './behavior';
import { network } from 'hardhat';
const { networkHelpers } = await network.connect();  // ⚠️ Different network instance
// Tests fail - fixtures don't reset properly
```

**The solution:** Pass `loadFixture` from the test file to behavior modules, ensuring a single source of truth:

```typescript
// behavior.ts
export function shouldBehaveLikeDrop({ loadFixture }) {
    // Uses loadFixture passed from caller
}

// test.ts
import { shouldBehaveLikeDrop } from './behavior';
const { networkHelpers } = await network.connect();
const { loadFixture } = networkHelpers;

shouldBehaveLikeDrop({ loadFixture });  // Pass the loadFixture
```

### 4.3 Chai Matchers Now Require `ethers` Parameter

In Hardhat 3, several chai matchers have updated signatures. Because Hardhat 3 supports multiple connections (each with its own `ethers` instance), you must now pass `ethers` as the first parameter to balance-related matchers ([full list of affected matchers](https://hardhat.org/docs/plugins/hardhat-ethers-chai-matchers#migration-from-hardhat-v2)):

```diff
// changeEtherBalance
- await expect(tx).to.changeEtherBalance(sender, -1000);
+ await expect(tx).to.changeEtherBalance(ethers, sender, -1000);

// changeTokenBalance
- await expect(tx).to.changeTokenBalance(token, sender, -1000);
+ await expect(tx).to.changeTokenBalance(ethers, token, sender, -1000);
```

Be careful to pass the correct `ethers` instance — the one from the same `network.connect()` call that your test is using. If you pass an `ethers` from a different connection (like one imported from a behavior module with its own `network.connect()`), the matcher will query a different blockchain state and produce incorrect results or cryptic errors.

### 4.4 HHE100 Error? Check Your `await` Statements

During migration, we encountered this mysterious error that appeared after tests had already passed:

```
Unhandled promise rejection:
HardhatError: HHE100: An internal invariant was violated: The block doesn't exist
```

The error message doesn't point to the actual problem. After investigation, we found it was caused by a missing `await` in an existing test:

```diff
- expect(txn).to.changeEtherBalance(ethers, alice, 10);
+ await expect(txn).to.changeEtherBalance(ethers, alice, 10);
```

This test worked in Hardhat 2 (by coincidence) but fails in Hardhat 3. **If you see `HHE100` or other cryptic internal errors, check for missing `await` statements** — especially on chai matchers like `.to.changeEtherBalance`, `.to.emit`, and `.to.be.reverted`.

### 4.5 Contract Deployment Changes

In Hardhat 2, `deployContract` was a helper from ethers.js `ContractFactory`. In Hardhat 3, it's provided by the hardhat-ethers plugin on the `ethers` object returned from `network.connect()` ([see deployment docs](https://hardhat.org/docs/plugins/hardhat-ethers#deploying-contracts)):

```
const { ethers } = await network.connect();
const contract = await ethers.deployContract("MyContract", [constructorArg]);
```

## 5. ESLint Configuration

With `"type": "module"` in package.json, Node.js treats `.js` files as ES modules by default. However, ESLint's flat config and many ESLint plugins still rely on CommonJS (`require()`, `module.exports`).

The simplest solution is to rename your ESLint config file to use the `.cjs` extension:

```diff
- eslint.config.js
+ eslint.config.cjs
```

The `.cjs` extension forces Node.js to treat the file as CommonJS, regardless of the package's `type` setting. Your config can continue using `require()` and `module.exports`.

Don't forget to update the global ignores in your config to match the new filename:

```diff
{
    ignores: [
      'node_modules/**',
-     'eslint.config.js'
+     'eslint.config.cjs'
    ]
}
```

## 6. What's Next

In this first part, we covered the foundation of migrating to Hardhat 3:
- ES module configuration (package.json, tsconfig.json)
- Dependency updates and plugin changes
- Hardhat configuration file migration
- Test file import changes and common gotchas
- ESLint configuration for ESM

In **Part 2: Deployment Migration**, we'll cover how to replace `hardhat-deploy` (which isn't compatible with Hardhat 3) and migrate to Hardhat Ignition while preserving existing deployment artifacts.

In **Part 3: Making Tasks Work with Hardhat 3**, we'll tackle the new task API and how to migrate existing custom Hardhat tasks.
