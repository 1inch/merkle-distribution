# Fixing ES Module Directory Import Error in TypeScript Projects

## Problem Description

### The Error
When running E2E tests for a TypeScript CLI application, the following error occurred:

```
Error: Directory import '/Users/glebalekseev/Documents/git/merkle-distribution/src/types' 
is not supported resolving ES modules imported from 
/Users/glebalekseev/Documents/git/merkle-distribution/src/cli/merkle-drop-cli.ts
```

### Error Code
`ERR_UNSUPPORTED_DIR_IMPORT`

### Test Output
```
CLI E2E Tests
  Generate Mode (-g)
    ✔ should generate merkle drop with QR codes and links
Exit Code: 1  // Test failing despite checkmark
```

## Root Cause Analysis

The project was configured as an ES module with `"type": "module"` in `package.json`, but the TypeScript code was using directory imports:

```typescript
// This doesn't work in ES modules
import { CLIOptions } from '../types';
```

ES modules require explicit file references and don't support automatic index file resolution for directory imports, which is a common pattern in CommonJS.

## The Solution

### 1. TypeScript Configuration Update

Added ts-node ESM support to `tsconfig.json`:

```json
{
  "compilerOptions": {
    // ... existing options
  },
  "ts-node": {
    "esm": true,
    "experimentalSpecifierResolution": "node",
    "transpileOnly": true
  }
}
```

**Explanation:**
- `"esm": true` - Enables ES module support in ts-node
- `"experimentalSpecifierResolution": "node"` - Allows Node.js-style module resolution (including directory imports)
- `"transpileOnly": true` - Speeds up compilation by skipping type checking

### 2. Test Runner Configuration Update

Modified the CLI test runner to use Node.js with the ts-node ESM loader:

```typescript
// Before (failing):
const child = spawn('ts-node', [cliPath, ...args], {
    cwd: tempDir,
    env: { ...process.env, NODE_ENV: 'test' },
});

// After (working):
const projectRoot = path.join(__dirname, '../..');
const child = spawn('node', [
    '--loader', 'ts-node/esm',
    '--experimental-specifier-resolution=node',
    cliPath,
    ...args
], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'test', TEMP_DIR: tempDir },
});
```

**Key Changes:**
- Used `node` instead of `ts-node` directly
- Added `--loader ts-node/esm` flag to use ts-node as an ESM loader
- Added `--experimental-specifier-resolution=node` to enable Node.js-style resolution
- Changed working directory to project root for proper module resolution

## Why This Works

1. **ESM Loader**: The `--loader ts-node/esm` flag tells Node.js to use ts-node's ESM loader to handle TypeScript files
2. **Module Resolution**: The `--experimental-specifier-resolution=node` flag allows Node.js to resolve modules using its traditional algorithm, which supports directory imports with index files
3. **Working Directory**: Running from the project root ensures all relative imports and module resolutions work correctly

## Lessons Learned

1. **ES Modules are Strict**: Unlike CommonJS, ES modules don't support implicit index file resolution for directories
2. **TypeScript + ES Modules**: Requires careful configuration of both TypeScript and the runtime environment
3. **ts-node ESM Support**: The ts-node loader can bridge the gap between TypeScript and ES modules
4. **Test Environment**: Tests may need different module resolution strategies than production code

## Best Practices

1. **Consistent Import Style**: Choose either explicit file imports or configure proper module resolution
2. **Document Configuration**: Complex TypeScript/ESM setups should be well-documented
3. **Test Early**: Module resolution issues should be caught early in development
4. **Consider Build Tools**: For production, consider using bundlers like esbuild or Vite that handle these issues automatically

## References

- [Node.js ES Modules Documentation](https://nodejs.org/api/esm.html)
- [TypeScript ES Module Support](https://www.typescriptlang.org/docs/handbook/esm-node.html)
- [ts-node ESM Support](https://typestrong.org/ts-node/docs/imports/)
