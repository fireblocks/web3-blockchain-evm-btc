import type { NativeAssetConfig, AddressType, UtxoProviderType } from '@fireblocks-recovery/assets-evm-btc';
export interface AddressOptions {
    addressType?: string;
    [key: string]: unknown;
}
/**
 * Parameters for building a transfer transaction
 * The adapter is responsible for fetching nonce, estimating gas, and other blockchain-specific details
 */
export interface TransferParams {
    from: string;
    to: string;
    amount: string;
    rpcUrl: string;
    publicKey?: string;
    token?: {
        contractAddress?: string;
        mintAddress?: string;
        decimals: number;
        symbol?: string;
    };
    memo?: string;
    utxoRpcConfig?: {
        endpoints: Array<{
            url: string;
            providerType: UtxoProviderType;
            apiKey?: string;
        }>;
    };
}
/**
 * Unsigned transaction data
 */
export interface UnsignedTransaction {
    chainId: string;
    type: 'native' | 'token';
    raw: unknown;
    estimatedFee?: {
        amount: string;
        decimals: number;
        displayAmount: string;
        currency: string;
    };
    metadata?: {
        from?: string;
        to?: string;
        amount?: string;
        tokenAddress?: string;
        [key: string]: unknown;
    };
}
/**
 * Transaction signature
 */
export interface TransactionSignature {
    r: string;
    s: string;
    v?: number;
    raw?: string;
    serializedTransaction?: string;
}
/**
 * Signed transaction ready for broadcast
 */
export interface SignedTransaction {
    chainId: string;
    type: 'native' | 'token';
    raw: string;
    txHash?: string;
    metadata?: {
        from?: string;
        to?: string;
        amount?: string;
        tokenAddress?: string;
        [key: string]: unknown;
    };
}
/**
 * Result of broadcasting a transaction
 */
export interface BroadcastResult {
    txHash: string;
    raw?: unknown;
}
/**
 * Balance information
 */
export interface BalanceInfo {
    balance: string;
    decimals: number;
    displayBalance: string;
}
export interface BlockchainAdapter {
    readonly assetConfig: NativeAssetConfig;
    generateAddress?(publicKey: string, options?: AddressOptions): string;
    validateAddress?(address: string): boolean;
    getSupportedAddressTypes?(): AddressType[];
    /**
     * Optional: resolve a generated address to its canonical display form.
     * Used by chains where generateAddress() returns a sentinel that requires
     * an async network lookup to resolve (e.g. Hedera account ID from pubkey).
     * If implemented, the IPC derive-address handler will call this and use the
     * result as the final address.
     */
    resolveAddress?(address: string, rpcUrl: string): Promise<string>;
    /**
     * Detect the address type (e.g. 'legacy' | 'segwit' | 'base' | 'enterprise') from
     * an address string. Returns one of the `id` values from getSupportedAddressTypes(),
     * or undefined if detection is not applicable / format is unknown.
     *
     * Used when re-deriving from a CSV (or other pre-known address) so we can pick the
     * correct addressType for derivation rather than always returning the default.
     */
    detectAddressType?(address: string): string | undefined;
    /**
     * Phase 1: Build unsigned transaction
     * Creates an unsigned transaction for transferring assets (native or token)
     *
     * @param params - Transfer parameters including amount, addresses, and optional token info
     * @returns Unsigned transaction data
     */
    buildUnsignedTransaction?(params: TransferParams): Promise<UnsignedTransaction>;
    /**
     * Phase 2: Sign transaction
     * Signs an unsigned transaction with a private key
     *
     * @param unsignedTx - Unsigned transaction from buildUnsignedTransaction
     * @param privateKey - Private key (hex string)
     * @returns Transaction signature
     */
    signTransaction?(unsignedTx: UnsignedTransaction, privateKey: string): Promise<TransactionSignature>;
    /**
     * Phase 3: Embed signature
     * Combines unsigned transaction with signature to create a complete signed transaction
     *
     * @param unsignedTx - Unsigned transaction from buildUnsignedTransaction
     * @param signature - Signature from signTransaction
     * @returns Signed transaction ready for broadcast
     */
    embedSignature?(unsignedTx: UnsignedTransaction, signature: TransactionSignature): Promise<SignedTransaction>;
    /**
     * Phase 4: Broadcast transaction
     * Broadcasts a signed transaction to the blockchain network
     *
     * @param signedTx - Signed transaction from embedSignature
     * @param rpcUrl - RPC endpoint URL for the blockchain network
     * @param options - Optional broadcasting options (timeout, retries, etc.)
     * @returns Broadcast result with transaction hash
     */
    broadcastTransaction?(signedTx: SignedTransaction, rpcUrl: string, options?: {
        timeout?: number;
        [key: string]: unknown;
    }): Promise<BroadcastResult>;
    /**
     * Get native asset balance for an address
     *
     * @param address - Address to check balance for
     * @param rpcUrl - RPC endpoint URL for the blockchain network
     * @returns Balance information
     */
    getBalance?(address: string, rpcUrl: string, utxoRpcConfig?: TransferParams['utxoRpcConfig']): Promise<BalanceInfo>;
    /**
     * Get token balance for an address
     *
     * @param address - Address to check balance for
     * @param tokenAddress - Token contract address (ERC20) or mint address (SPL)
     * @param decimals - Token decimals
     * @param rpcUrl - RPC endpoint URL for the blockchain network
     * @returns Balance information
     */
    getTokenBalance?(address: string, tokenAddress: string, decimals: number, rpcUrl: string): Promise<BalanceInfo>;
    /**
     * Get transaction confirmation status
     *
     * @param txHash - Transaction hash to check
     * @param rpcUrl - RPC endpoint URL for the blockchain network
     * @returns Transaction status information
     */
    getTransactionStatus?(txHash: string, rpcUrl: string): Promise<{
        confirmed: boolean;
        blockNumber?: number;
        failed?: boolean;
        error?: string;
    }>;
    /**
     * Canonical identity key for an address, used to dedupe addresses that are the
     * same on-chain output in different encodings (e.g. BCH legacy `1…` vs CashAddr
     * `bitcoincash:q…` - same scriptPubKey, same UTXOs). Two addresses with the
     * same key hold the same funds and must not be summed twice. Defaults to the
     * address itself for chains without alternate encodings.
     */
    canonicalAddressKey?(address: string): string;
    /**
     * Calculate maximum transferable amount for native asset
     *
     * This method computes how much of the native asset can be transferred while
     * ensuring enough balance remains to pay the transaction fee. This is essential
     * for "max" or "sweep" operations where users want to empty an account.
     *
     * Implementation requirements:
     * - Fetch current balance for the address
     * - Estimate transaction fee based on current network conditions
     * - Subtract estimated fee from balance
     * - Return max transferable amount in both base units and display format
     *
     * Chain-specific considerations:
     * - EVM chains: Estimate gas using current gas prices (21000 gas for simple transfer)
     * - Solana: Fixed fee of ~5000 lamports, no need to reserve rent-exempt minimum for sweep
     * - UTXO chains: Account for transaction size and input/output count
     *
     * Important notes:
     * - This is only for NATIVE asset transfers (ETH, SOL, BTC, etc.)
     * - Token transfers should NOT use this (tokens pay fees in native currency)
     * - The estimate should be conservative to avoid "insufficient funds" errors
     * - If estimation fails, it's safer to return a lower amount or throw an error
     *
     * @param address - Address to calculate max amount for
     * @param rpcUrl - RPC endpoint URL for fetching balance and fee data
     * @returns Object containing:
     *   - maxAmount: Maximum transferable in base units (e.g., wei, lamports, satoshis)
     *   - displayAmount: Human-readable amount with proper decimal formatting
     * @throws Error if balance fetch fails or fee estimation fails
     *
     * @example
     * ```typescript
     * // User wants to send all ETH from address
     * const result = await adapter.getMaxTransferableAmount(address, rpcUrl);
     * // result.maxAmount = "999979000000000000" (balance minus gas fee in wei)
     * // result.displayAmount = "0.999979" (human-readable ETH)
     * ```
     */
    getMaxTransferableAmount?(address: string, rpcUrl: string, 
    /** Pre-fetched balance in base units - avoids a redundant RPC round-trip */
    currentBalance?: string, utxoRpcConfig?: TransferParams['utxoRpcConfig']): Promise<{
        maxAmount: string;
        displayAmount: string;
    }>;
}
