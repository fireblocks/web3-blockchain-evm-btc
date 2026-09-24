/**
 * Token Standard Registry
 *
 * This file re-exports from the auto-generated registry.
 * Token standards are automatically discovered from the chains/ directory structure.
 *
 * To add a new token standard:
 * 1. Create the standard implementation in src/chains/<blockchain>/tokenStandards/<standard>.ts
 * 2. Export it from src/chains/<blockchain>/index.ts
 * 3. Run `pnpm run generate:registry` to regenerate the registry
 */
export * from './tokenStandardRegistry.generated';
