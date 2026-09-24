import type { BlockchainAdapter } from '../core/adapter';
/**
 * Registry for non-EVM blockchain adapters
 * EVM chains are auto-registered from the assets package in blockchainRegistry.ts
 */
export declare const NON_EVM_ADAPTERS: Record<string, BlockchainAdapter>;
export declare function registerNonEVMAdapters(registry: Record<string, BlockchainAdapter>): void;
