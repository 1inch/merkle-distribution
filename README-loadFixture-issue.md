# Hardhat 3 Migration Gotcha: `loadFixture` in Modular Test Architecture

## The Problem

When migrating to Hardhat 3 and using ESM modules, you may encounter an unexpected issue with `loadFixture` when organizing tests into separate behavior/helper modules.

### Symptom

- Tests that work when defined in a single file **fail** when the behavior function is extracted to a separate module
- The fixture appears to run only once instead of being reset for each test
- Console logs show the contract being deployed only once, even though each test should get a fresh deployment

### Example Scenario

**Working (single file):**
```typescript
// hardhat3.test.ts
import { network } from 'hardhat';
const { ethers, networkHelpers } = await network.connect();
const { loadFixture } = networkHelpers;

function shouldBehaveLikeMerkleDrop(config) {
    describe('tests', function () {
        async function deployContractsFixture() {
            // Deploy contracts...
        }
        
        it('test 1', async function () {
            const result = await loadFixture(deployContractsFixture);
            // Works - gets fresh deployment
        });
        
        it('test 2', async function () {
            const result = await loadFixture(deployContractsFixture);
            // Works - gets fresh deployment (snapshot restored)
        });
    });
}
```

**Failing (separate modules):**
```typescript
// behavior.ts
import { network } from 'hardhat';
const { ethers, networkHelpers } = await network.connect();  // ⚠️ First network.connect()
const { loadFixture } = networkHelpers;

export function shouldBehaveLikeMerkleDrop(config) {
    // Uses loadFixture from THIS module's network.connect() call
}

// test.ts
import { shouldBehaveLikeMerkleDrop } from './behavior';
import { network } from 'hardhat';
const { ethers, networkHelpers } = await network.connect();  // ⚠️ Second network.connect()

// Tests fail - fixture not being reset properly
```

## Root Cause

In Hardhat 3 with ESM, when you have multiple modules each calling `await network.connect()` at the top level:

1. **Module Loading Order**: `behavior.ts` is loaded first (due to the import), executing its `await network.connect()` and capturing its own `loadFixture`
2. **Separate Instances**: The `loadFixture` in `behavior.ts` is bound to the `networkHelpers` from **its own** module-level `network.connect()` call
3. **Fixture Caching Issue**: The `loadFixture` function uses the fixture function reference as a cache key. When the fixture is defined in a module that has its own `network.connect()` context, the snapshot/restore mechanism doesn't coordinate properly with the test file's context

This creates a subtle bug where:
- The fixture function reference is the same across all tests (defined once when the `describe` callback runs)
- But the `loadFixture` being used has its own internal state that doesn't properly reset between tests

## The Solution

**Pass `loadFixture` as a parameter to your behavior functions** instead of obtaining it from a module-level `network.connect()` call.

### Fixed Code

**behavior.ts:**
```typescript
import { network } from 'hardhat';
import type { Signer, Contract } from 'ethers';

const { ethers } = await network.connect();  // Only get ethers, not networkHelpers

interface BehaviorConfig {
    // ... other config
    loadFixture: <T>(fixture: () => Promise<T>) => Promise<T>;  // Add this
}

export function shouldBehaveLikeMerkleDrop({
    loadFixture,  // Receive from caller
    // ... other config
}: BehaviorConfig) {
    describe('tests', function () {
        async function deployContractsFixture() {
            // Deploy contracts...
        }
        
        it('test 1', async function () {
            const result = await loadFixture(deployContractsFixture);
            // Now works correctly
        });
    });
}
```

**test.ts:**
```typescript
import { shouldBehaveLikeMerkleDrop } from './behavior';
import { network } from 'hardhat';
const { ethers, networkHelpers } = await network.connect();
const { loadFixture } = networkHelpers;

shouldBehaveLikeMerkleDrop({
    loadFixture,  // Pass the loadFixture from test file
    // ... other config
});
```

## Key Takeaways

1. **Single Source of Truth**: Ensure `loadFixture` comes from a single `network.connect()` call in your test architecture
2. **Dependency Injection**: Pass `loadFixture` (and other network helpers) as parameters to behavior modules instead of obtaining them independently
3. **ESM Module Evaluation**: Remember that top-level await in ESM modules executes during module loading, which can create subtle issues with shared state
4. **Testing After Refactoring**: When extracting test helpers to separate modules in Hardhat 3, always verify that fixtures still reset properly between tests

## Affected Patterns

This issue affects any test architecture where:
- Behavior/helper functions are in separate modules
- Those modules independently call `await network.connect()`
- `loadFixture` is used for test isolation

Common patterns that may be affected:
- Shared behavior functions (BDD-style testing)
- Test utilities in separate files
- Reusable test fixtures across multiple test files
