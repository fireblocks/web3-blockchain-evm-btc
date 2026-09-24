import type { BlockchainAdapter } from "../core/adapter";
export declare const BLOCKCHAIN_REGISTRY: Record<string, BlockchainAdapter>;
export declare function getBlockchainAdapter(chainId: string): BlockchainAdapter;
export declare function getAllBlockchains(): BlockchainAdapter[];
export declare function isBlockchainSupported(chainId: string): boolean;
