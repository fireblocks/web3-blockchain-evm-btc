import type { NativeAssetConfig } from '@fireblocks-recovery/assets-evm-btc';
import type { BlockchainAdapter, AddressOptions, TransferParams, UnsignedTransaction, TransactionSignature, SignedTransaction, BroadcastResult, BalanceInfo } from '../../core/adapter';
export declare class EVMAdapter implements BlockchainAdapter {
    readonly assetConfig: NativeAssetConfig;
    readonly evmChainId: number;
    constructor(assetConfig: NativeAssetConfig);
    generateAddress(publicKey: string, _options?: AddressOptions): string;
    validateAddress(address: string): boolean;
    getSupportedAddressTypes(): import("@fireblocks-recovery/assets-evm-btc").AddressType[];
    /**
     * Creates an unsigned transaction for ETH or ERC20 token transfer
     * Automatically fetches nonce, estimates gas, and calculates fees
     */
    buildUnsignedTransaction(params: TransferParams): Promise<UnsignedTransaction>;
    /**
     * Signs an unsigned transaction with a private key using ECDSA
     */
    signTransaction(unsignedTx: UnsignedTransaction, privateKey: string): Promise<TransactionSignature>;
    /**
     * Combines unsigned transaction with signature to create a complete signed transaction
     */
    embedSignature(unsignedTx: UnsignedTransaction, signature: TransactionSignature): Promise<SignedTransaction>;
    /**
     * Broadcasts a signed transaction to the blockchain network
     */
    broadcastTransaction(signedTx: SignedTransaction, rpcUrl: string, options?: {
        timeout?: number;
        [key: string]: unknown;
    }): Promise<BroadcastResult>;
    /**
     * Get native asset balance for an address
     */
    getBalance(address: string, rpcUrl: string): Promise<BalanceInfo>;
    /**
     * Get ERC20 token balance for an address
     */
    getTokenBalance(address: string, tokenAddress: string, decimals: number, rpcUrl: string): Promise<BalanceInfo>;
    /**
     * Get transaction confirmation status on Ethereum
     */
    getTransactionStatus(txHash: string, rpcUrl: string): Promise<{
        confirmed: boolean;
        blockNumber?: number;
    }>;
    /**
     * Calculate maximum transferable ETH amount for account sweep operations
     *
     * EVM-specific implementation notes:
     * - Gas limit: Fixed at 21000 gas for simple ETH transfers
     * - Gas price: Dynamically fetched from the network
     * - Fee structure: Supports both EIP-1559 (maxFeePerGas) and legacy (gasPrice)
     * - Fee calculation: gasLimit * gasPrice (or maxFeePerGas)
     *
     * Gas price priority:
     * 1. EIP-1559 maxFeePerGas (most common on modern networks)
     * 2. Legacy gasPrice (for networks without EIP-1559)
     * 3. Fallback to 50 gwei if network fee data is unavailable
     *
     * Why 21000 gas:
     * - Simple ETH transfers always consume exactly 21000 gas
     * - Contract interactions require more gas (not handled by this method)
     * - This is the base cost for transferring value on EVM chains
     *
     * Fee estimation considerations:
     * - Gas prices fluctuate based on network congestion
     * - EIP-1559 provides more predictable fees with base fee + priority fee
     * - The estimate is conservative (uses maxFeePerGas, not base fee)
     * - If RPC call fails, returns 0 rather than risking insufficient funds
     *
     * Applicable networks:
     * - Ethereum Mainnet (EIP-1559)
     * - Polygon (EIP-1559)
     * - BSC (legacy gas pricing)
     * - Avalanche C-Chain (EIP-1559)
     * - All other EVM-compatible chains
     *
     * @param address - Ethereum address (0x-prefixed hex)
     * @param rpcUrl - EVM-compatible RPC endpoint
     * @returns Object with:
     *   - maxAmount: Balance minus estimated gas fee (in wei, as string)
     *   - displayAmount: Human-readable amount (18 decimals for ETH)
     * @throws Does not throw - returns zero amount on errors to prevent failed transactions
     *
     * @example
     * ```typescript
     * // Address has 1 ETH, gas price is 50 gwei
     * const result = await adapter.getMaxTransferableAmount(address, rpcUrl);
     * // result.maxAmount = "998950000000000000" (1 ETH minus 21000 * 50 gwei)
     * // result.displayAmount = "0.99895" (human-readable)
     * ```
     */
    getMaxTransferableAmount(address: string, rpcUrl: string): Promise<{
        maxAmount: string;
        displayAmount: string;
    }>;
}
