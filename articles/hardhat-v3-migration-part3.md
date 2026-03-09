# Migrating to Hardhat 3 - Part 3: Tasks Migration

## 1. Introduction

In [Part 1](https://github.com/1inch/merkle-distribution/blob/hardhat-3/articles/hardhat-v3-migration-part1.md), we covered the foundation of migrating to Hardhat 3: basic configuration changes, and tests migration. In [Part 2](https://github.com/1inch/merkle-distribution/blob/hardhat-3/articles/hardhat-v3-migration-part2.md), we replaced `hardhat-deploy` with Hardhat Ignition.

In the final part, we cover **custom Hardhat task migration** - the last piece of our move to Hardhat 3. Our project has several custom tasks that manage the full drop lifecycle: generating claim links and deploying contracts, collecting on-chain statistics, and rescuing unclaimed tokens.

We'll cover:

- Task definition syntax: before and after
- Two action patterns: inline vs lazy-loaded modules
- Parameter definition differences between Hardhat 2 and Hardhat 3
- CLI argument mapping from Hardhat 2 to Hardhat 3
- What changed inside task code: network access, return values, and reading Ignition artifacts

## 2. Task Definition: Before and After

There are major changes in how tasks are defined in Hardhat 3. Tasks are built using builders and must be explicitly registered in the config. Parameters are structured objects with typed definitions. Actions can be lazy-loaded from separate modules.

Here's how our `drop` task looked before and after.

**Before (Hardhat 2):**

```typescript
import { task } from 'hardhat/config';
import { dropTask } from './src/tasks/hardhat-drop-task';

task('drop', 'Generate merkle drop links, deploy contract, and verify all generated claim links')
    .addParam('v', 'Deployment version')
    .addParam('a', 'Amounts to generate')
    .addParam('n', 'Codes to generate')
    .addFlag('debug', 'Debug mode')
    .setAction(async (taskArgs, hre) => {
        await dropTask(hre, taskArgs);
    });

export default { solidity: {...}, networks: {...} };
```

**After (Hardhat 3):**

```typescript
import { defineConfig, task } from 'hardhat/config';
import { ArgumentType } from 'hardhat/types/arguments';

const drop = task('drop', 'Generate merkle drop links, deploy contract, and verify all generated claim links')
    .addOption({
        name: 'ver',
        shortName: 'v',
        description: 'Deployment version (defaults to .latest + 1)',
        defaultValue: 0,
        type: ArgumentType.INT,
    })
    .addOption({
        name: 'amounts',
        shortName: 'a',
        description: 'Amounts for drop to generate',
        defaultValue: 'not set',
        type: ArgumentType.STRING,
    })
    .addOption({
        name: 'numbers',
        shortName: 'n',
        description: 'Number of codes to generate',
        defaultValue: 'not set',
        type: ArgumentType.STRING,
    })
    .addFlag({
        name: 'debug',
        description: 'Debug mode',
    })
    .setAction(() => import('./src/tasks/drop'))
    .build();

export default defineConfig({
    // ...
    tasks: [drop],
    // ...
});
```

Key differences:

- **Builder pattern with `.build()`** - `task()` returns a builder. You chain methods and finalize with `.build()`, which returns a task object. If you forget `.build()` the task simply won't be registered.
- **Explicit registration** - The built task is stored in a variable and passed to `defineConfig({ tasks: [...] })`. No more side-effect registration.
- **Structured argument definitions** - `.addParam('v', 'desc')` becomes `.addOption({ name, shortName, description, defaultValue, type })`. Arguments are now typed via the `ArgumentType` enum and support short names natively (see details in [Section 4](#4-cli-arguments-hardhat-2-to-hardhat-3-mapping)).
- **Lazy-loaded actions** - `.setAction()` takes a module import instead of an inline function (more on this in the next section).

## 3. Actions vs Inline Actions

Hardhat 3 supports two patterns for defining task actions (see [details and comparison](https://hardhat.org/docs/guides/writing-tasks#choosing-between-setaction-and-setinlineaction)).

**Inline action** - define the function directly:

```typescript
const myTask = task('my-task', 'Do something')
    .setInlineAction(async (args, hre) => {
        const conn = await hre.network.connect();
        console.log('Connected to', conn.networkName);
        return successfulResult(true);
    })
    .build();
```

This works for simple tasks, but it puts your logic into `hardhat.config.ts`.

**Module action (lazy-loaded)** - points to a module:

```typescript
const drop = task('drop', 'Generate merkle drop links...')
    .setAction(() => import('./src/tasks/drop'))
    .build();
```

The module must export a default function with the signature `(args, hre) => Promise<TaskResult>`:

```typescript
// src/tasks/drop.ts
import { HardhatRuntimeEnvironment } from 'hardhat/types/hre';
import { successfulResult, errorResult } from 'hardhat/utils/result';

interface DropTaskArguments {
    ver: number;
    amounts: string;
    numbers: string;
    debug: boolean;
}

export default async function (
    args: DropTaskArguments,
    hre: HardhatRuntimeEnvironment,
) {
    if (args.amounts === 'not set' || args.numbers === 'not set') {
        return errorResult(new Error('Missing required parameters'));
    }

    const conn = await hre.network.connect();
    const chainId = conn.networkConfig.chainId ?? 31337;
    // ... task logic ...

    return successfulResult<boolean>(true);
}
```

We used the module pattern for all our tasks because in this case

- `hardhat.config.ts` contains only task definitions and argument schemas, not implementation details.
- Task code is only loaded when the task is actually run.
- Each task is independently maintainable. We went from one huge file to five focused files plus shared utilities in `src/tasks/lib/`.

> Note the argument interface (`DropTaskArguments`): the property names must match the `name` values from `.addOption()` and `.addFlag()` in the task definition. Hardhat 3 doesn't generate these types for you - you define them yourself and trust the match.

## 4. CLI Arguments: Hardhat 2 to Hardhat 3 Mapping

The parameter mapping between Hardhat 2 and Hardhat 3 was one of the confusing parts of our migration. The concept was reorganized, and the official documentation on this topic is sparse - we ended up reading the Hardhat 3 source code to understand how the old parameter types map to the new ones. To save you that effort, here's the reference table we built:


| Hardhat 2                                       | Hardhat 3                                      | What changed                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addParam(name, ...)`                           | **No direct 1:1 equivalent**                   | There are no direct equivalents in HH3 for HH2 required params. There is always default value should be set and validation is done by user                                                                                                            |
| `addOptionalParam(name, ...)`                   | `addOption({ name, type, defaultValue, ... })` | The replacement for an HH2 optional named param.                                                                                                                                                                                                      |
| `addFlag(name, ...)`                            | `addFlag({ name, ... })`                       | The equivalent behavour HH2 and HH3.                                                                                                                                                                                                                  |
| -                                               | `addLevel({ name, ... })`                      | This is new in HH3; `addLevel` defines an option that accepts a non-negative integer and defaults to `0`. When the option has a short name such as `-v`, repeating it increases the level, so `-vvvv` means level `4` (for example, `--verbosity 4`). |
| `addPositionalParam(name, ...)`                 | `addPositionalArgument({ name, type })`        | Unlike named options, positional arguments CAN be required - just omit `defaultValue`.                                                                                                                                                                |
| `addOptionalPositionalParam(name, ...)`         | `addPositionalArgument({ ..., defaultValue })` | The replacement for an HH2 optional positional param. Providing `defaultValue` makes it optional.                                                                                                                                                     |
| `addVariadicPositionalParam(name, ...)`         | `addVariadicArgument({ name, type })`          | Like positional arguments, variadic arguments CAN be required - just omit `defaultValue`.                                                                                                                                                             |
| `addOptionalVariadicPositionalParam(name, ...)` | `addVariadicArgument({ ..., defaultValue })`   | The replacement for an HH2 optional variadic positional param. Providing `defaultValue` makes it optional.                                                                                                                                            |


Note that `addOption()` always requires a `defaultValue` - there's no way to define a required named option in Hardhat 3. If you had a required parameter in Hardhat 2, you need to validate it yourself in the task action. For example, our `--ver` option defaults to `0` and we check for it at the start of every task that needs it:

```typescript
// Task definition: ver defaults to 0
const verifyDeployment = task('verify-deployment', '...')
    .addOption({ name: 'ver', shortName: 'v', defaultValue: 0, type: ArgumentType.INT })
    .setAction(() => import('./src/tasks/verify-deployment'))
    .build();

// Task action: validate that ver was actually provided
export default async function (args: VerifyDeploymentTaskArguments, hre: HardhatRuntimeEnvironment) {
    const version = args.ver;
    if (version < 1) {
        console.error('Error: Version must be specified with --v parameter');
        return errorResult(new Error('Missing required version parameter'));
    }
    // ... rest of task logic
}
```

A few things that we liked:

- `ArgumentType` enum replaces the old untyped string parameters. Available types: `STRING`, `INT`, `BOOLEAN`, `BIGINT`, `FILE`. In Hardhat 2, parameters were essentially untyped strings - you'd parse and validate them yourself. In Hardhat 3, the type is enforced by the framework, so `ArgumentType.INT` will reject non-numeric input before your task even runs.
- `shortName` is a new property that gives you short CLI flags natively. In Hardhat 2, if you wanted `--v`, you named the parameter `v`. In Hardhat 3, you give it a descriptive `name` (like `ver`) and a `shortName` (like `v`), so both `--ver 53` and `-v 53` work.

## 5. Task Internals: What Changed Inside

Beyond the definition syntax, the actual task code needed updates too.

### 5.1 Network Access

In Hardhat 2, you accessed ethers and network info directly from `hre`:

```typescript
// Hardhat 2
const chainId = await hre.getChainId();
const networkName = hre.network.name;
const contract = new hre.ethers.Contract(address, abi, hre.ethers.provider);
```

In Hardhat 3, you first create a connection, then access everything through it:

```typescript
// Hardhat 3
const conn = await hre.network.connect();
const chainId = conn.networkConfig.chainId;
const networkName = conn.networkName;
const contract = new conn.ethers.Contract(address, abi, conn.ethers.provider);
```

This `hre.network.connect()` pattern is the same one used in tests (covered in Part 1). The connection object provides `ethers`, `networkConfig`, `networkName`, and - if you have Ignition registered - `ignition` for deployments.

### 5.2 Return Values

Hardhat 2 tasks returned `void`. Hardhat 3 tasks return structured results:

```diff
- export async function dropTask(hre, args): Promise<void> {
-     // ... do work ...
- }

+ export default async function(args, hre): Promise<TaskResult> {
+     if (somethingFailed) {
+         return errorResult(new Error('Descriptive error'));
+     }
+     return successfulResult<boolean>(true);
+ }
```

Import `successfulResult` and `errorResult` from `hardhat/utils/result`. This replaces the pattern of throwing errors or calling `process.exit(1)` - the task runner handles error display and exit codes based on which result type you return.

### 5.3 Reading Deployment Artifacts

In Hardhat 2 with `hardhat-deploy`, reading deployment data was trivial - `hre.deployments.getOrNull('MerkleDrop128-42')` gave you the contract address, constructor arguments, and transaction receipt in one call.

Hardhat Ignition has no equivalent API for reading past deployment artifacts programmatically. It stores deployment data in files under `ignition/deployments/<deploymentId>/`, but provides no built-in way to query them from task code. Here's what each deployment folder looks like, using our project as an example:

```
ignition/deployments/sepolia-MerkleDrop-78/
├── artifacts/                - compiled contract artifacts (ABI, bytecode, source info)
│   └── SignatureDrop#SignatureMerkleDrop128.json
├── build-info/               - full Solidity compiler input/output for reproducible builds
│   └── solc-0_8_23-....json
├── deployed_addresses.json   - contract addresses keyed by future ID
└── journal.jsonl             - line-delimited JSON log of every deployment step
```

`deployed_addresses.json` maps Ignition future IDs to deployed addresses:

```json
{
  "SignatureDrop#SignatureMerkleDrop128": "0xb56c499b57F720D59028f74D36Fb1571E031Cd83"
}
```

`journal.jsonl` is a line-by-line log of the deployment process. Each line is a JSON object with a `type` field. We used the following entry types:

- `DEPLOYMENT_EXECUTION_STATE_INITIALIZE` - contains `constructorArgs`, `contractName`, and the deployer address (`from`)
- `TRANSACTION_CONFIRM` - contains the transaction `hash` and `receipt` with `blockNumber`, `blockHash`, and `contractAddress`
- `DEPLOYMENT_EXECUTION_STATE_COMPLETE` - contains the final deployed `address`

We had to create a helper class that parses these files directly to extract deployment parameters like contract addresses, constructor arguments, and block numbers. If your tasks need to read deployment data from previous Ignition runs, be prepared to write your own parsing layer.

## 6. Conclusion

This completes our three-part migration series from Hardhat 2 to Hardhat 3:

- **Part 1** covered ES module configuration, dependency updates, test migration, and the `loadFixture` pitfall with modular tests.
- **Part 2** covered replacing `hardhat-deploy` with Hardhat Ignition, build profiles, and the `evmVersion` verification pitfall.
- **Part 3** covered the new task API, inline vs module actions, CLI argument mapping, and building helpers to bridge the gap between Ignition's deployment artifacts and task code.

The task migration was straightforward once we understood the new patterns. The builder API with `.addOption()` / `.build()` is more verbose than Hardhat 2's `.addParam()`, but the explicit typing, short names, and lazy loading are real improvements. The biggest pain point was the lack of a built-in API for reading Ignition deployment artifacts - something that `hardhat-deploy` handled seamlessly.

Overall, migrating to Hardhat 3 required meaningful effort, but the result is a cleaner, more maintainable codebase. The new task system, combined with native Solidity tests and Hardhat Ignition, makes Hardhat 3 a solid step forward for Ethereum development tooling.
