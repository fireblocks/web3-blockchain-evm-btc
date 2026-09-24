import type { TokenStandard } from '../core/tokenStandard';
/**
 * Get token standard by key (e.g., "ALGO:ASA" or "ETH:ERC20")
 */
export declare function getTokenStandard(key: string): TokenStandard;
export declare function getTokenStandardByBlockchain(blockchainId: string, standardId: string): TokenStandard;
export declare function getAllTokenStandards(): TokenStandard[];
export declare function getTokenStandardsForBlockchain(blockchainId: string): TokenStandard[];
export declare function isTokenStandardSupported(key: string): boolean;
export declare const TOKEN_STANDARD_REGISTRY: Record<string, TokenStandard>;
