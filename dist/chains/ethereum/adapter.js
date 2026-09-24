"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVMAdapter = void 0;
const ethers_1 = require("ethers");
// ERC20 ABI for transfer function
const ERC20_TRANSFER_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
];
class EVMAdapter {
    assetConfig;
    evmChainId;
    constructor(assetConfig) {
        this.assetConfig = assetConfig;
        if (!assetConfig.evmChainId) {
            throw new Error(`EVM chain ${assetConfig.id} is missing evmChainId`);
        }
        this.evmChainId = assetConfig.evmChainId;
    }
    generateAddress(publicKey, _options) {
        const computedAddress = ethers_1.ethers.computeAddress(publicKey);
        return computedAddress;
    }
    validateAddress(address) {
        try {
            return ethers_1.ethers.isAddress(address);
        }
        catch {
            return false;
        }
    }
    getSupportedAddressTypes() {
        return this.assetConfig.addressCapabilities?.addressTypes || [
            {
                id: 'default',
                name: `${this.assetConfig.name} Address`,
                description: 'Standard EVM address (EIP-55 checksum)',
            },
        ];
    }
    /**
     * Creates an unsigned transaction for ETH or ERC20 token transfer
     * Automatically fetches nonce, estimates gas, and calculates fees
     */
    async buildUnsignedTransaction(params) {
        const { from, to, amount, token, rpcUrl, rpcHeaders } = params;
        // Validate addresses
        if (!this.validateAddress(from)) {
            throw new Error(`Invalid from address: ${from}`);
        }
        if (!this.validateAddress(to)) {
            throw new Error(`Invalid to address: ${to}`);
        }
        // Create provider to fetch network data
        const fetchRequest = new ethers_1.ethers.FetchRequest(rpcUrl);
        if (rpcHeaders) {
            for (const [name, value] of Object.entries(rpcHeaders)) {
                fetchRequest.setHeader(name, value);
            }
        }
        const provider = new ethers_1.ethers.JsonRpcProvider(fetchRequest, this.evmChainId, { staticNetwork: true });
        const type = token ? 'token' : 'native';
        let txData;
        let encodedData;
        if (token) {
            // ERC20 token transfer
            if (!token.contractAddress) {
                throw new Error('Contract address required for token transfer');
            }
            if (!this.validateAddress(token.contractAddress)) {
                throw new Error(`Invalid contract address: ${token.contractAddress}`);
            }
            // Encode ERC20 transfer function call
            const iface = new ethers_1.ethers.Interface(ERC20_TRANSFER_ABI);
            encodedData = iface.encodeFunctionData('transfer', [to, amount]);
            txData = {
                to: token.contractAddress,
                from,
                data: encodedData,
                value: 0,
                chainId: this.evmChainId,
            };
        }
        else {
            // Native ETH transfer
            txData = {
                to,
                from,
                value: amount,
                chainId: this.evmChainId,
            };
        }
        // Fetch nonce from network
        const nonce = await provider.getTransactionCount(from, 'pending');
        txData.nonce = nonce;
        // Estimate gas limit
        try {
            const estimatedGas = await provider.estimateGas({
                from,
                to: txData.to,
                value: txData.value,
                data: encodedData,
            });
            txData.gasLimit = estimatedGas;
        }
        catch (error) {
            // If estimation fails, use default values
            txData.gasLimit = token ? 100000n : 21000n;
        }
        // Get current fee data (EIP-1559)
        const feeData = await provider.getFeeData();
        // Use EIP-1559 if available, otherwise fall back to legacy gas price
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
            txData.maxFeePerGas = feeData.maxFeePerGas;
            txData.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        }
        else if (feeData.gasPrice) {
            txData.gasPrice = feeData.gasPrice;
        }
        else {
            // Fallback to 50 gwei if fee data unavailable
            txData.maxFeePerGas = ethers_1.ethers.parseUnits('50', 'gwei');
            txData.maxPriorityFeePerGas = ethers_1.ethers.parseUnits('2', 'gwei');
        }
        // Calculate estimated fee
        const gasLimit = BigInt(txData.gasLimit?.toString() || '21000');
        const maxFee = txData.maxFeePerGas ? BigInt(txData.maxFeePerGas.toString()) : BigInt(txData.gasPrice?.toString() || '0');
        const estimatedFeeAmount = gasLimit * maxFee;
        return {
            chainId: this.assetConfig.id,
            type,
            raw: txData,
            estimatedFee: {
                amount: estimatedFeeAmount.toString(),
                decimals: 18,
                displayAmount: ethers_1.ethers.formatEther(estimatedFeeAmount),
                currency: this.assetConfig.symbol,
            },
            metadata: {
                from,
                to,
                amount,
                tokenAddress: token?.contractAddress,
            },
        };
    }
    /**
     * Signs an unsigned transaction with a private key using ECDSA
     */
    async signTransaction(unsignedTx, privateKey) {
        const txData = unsignedTx.raw;
        // Create a wallet from private key (without provider)
        // Ensure private key has 0x prefix
        const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
        const wallet = new ethers_1.ethers.Wallet(formattedPrivateKey);
        // Remove 'from' field as ethers derives it from the signature
        const { from, ...txDataWithoutFrom } = txData;
        // Serialize the transaction to get the hash
        const serializedTx = ethers_1.ethers.Transaction.from(txDataWithoutFrom).unsignedSerialized;
        const txHash = ethers_1.ethers.keccak256(serializedTx);
        // Sign the transaction hash
        const signature = wallet.signingKey.sign(txHash);
        return {
            r: signature.r,
            s: signature.s,
            v: signature.v,
            raw: signature.serialized,
        };
    }
    /**
     * Combines unsigned transaction with signature to create a complete signed transaction
     */
    async embedSignature(unsignedTx, signature) {
        const txData = unsignedTx.raw;
        // Remove 'from' field as ethers derives it from the signature
        const { from, ...txDataWithoutFrom } = txData;
        // Create transaction object and add signature
        const tx = ethers_1.ethers.Transaction.from(txDataWithoutFrom);
        tx.signature = ethers_1.ethers.Signature.from({
            r: signature.r,
            s: signature.s,
            v: signature.v,
        });
        // Serialize the signed transaction
        const serializedTx = tx.serialized;
        const txHash = tx.hash ?? undefined;
        return {
            chainId: this.assetConfig.id,
            type: unsignedTx.type,
            raw: serializedTx,
            txHash,
            metadata: unsignedTx.metadata,
        };
    }
    /**
     * Broadcasts a signed transaction to the blockchain network
     */
    async broadcastTransaction(signedTx, rpcUrl, options) {
        // Create provider with optional timeout
        const fetchRequest = new ethers_1.ethers.FetchRequest(rpcUrl);
        if (options?.timeout) {
            fetchRequest.timeout = options.timeout;
        }
        if (options?.headers) {
            for (const [name, value] of Object.entries(options.headers)) {
                fetchRequest.setHeader(name, value);
            }
        }
        const provider = new ethers_1.ethers.JsonRpcProvider(fetchRequest, this.evmChainId, { staticNetwork: true });
        // Broadcast the signed transaction
        const txResponse = await provider.broadcastTransaction(signedTx.raw);
        return {
            txHash: txResponse.hash,
            raw: txResponse,
        };
    }
    /**
     * Get native asset balance for an address
     */
    async getBalance(address, rpcUrl, _utxoRpcConfig, rpcHeaders) {
        if (!this.validateAddress(address)) {
            throw new Error(`Invalid address: ${address}`);
        }
        const fetchRequest = new ethers_1.ethers.FetchRequest(rpcUrl);
        if (rpcHeaders) {
            for (const [name, value] of Object.entries(rpcHeaders)) {
                fetchRequest.setHeader(name, value);
            }
        }
        const provider = new ethers_1.ethers.JsonRpcProvider(fetchRequest, this.evmChainId, { staticNetwork: true });
        const balanceWei = await provider.getBalance(address);
        // Get decimals from asset config (typically 18 for EVM chains)
        const decimals = 18;
        const displayBalance = ethers_1.ethers.formatUnits(balanceWei, decimals);
        return {
            balance: balanceWei.toString(),
            decimals,
            displayBalance,
        };
    }
    /**
     * Get ERC20 token balance for an address
     */
    async getTokenBalance(address, tokenAddress, decimals, rpcUrl) {
        if (!this.validateAddress(address)) {
            throw new Error(`Invalid address: ${address}`);
        }
        if (!this.validateAddress(tokenAddress)) {
            throw new Error(`Invalid token address: ${tokenAddress}`);
        }
        const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl, this.evmChainId, { staticNetwork: true });
        const contract = new ethers_1.ethers.Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
        const balanceRaw = await contract.balanceOf(address);
        const displayBalance = ethers_1.ethers.formatUnits(balanceRaw, decimals);
        return {
            balance: balanceRaw.toString(),
            decimals,
            displayBalance,
        };
    }
    /**
     * Get transaction confirmation status on Ethereum
     */
    async getTransactionStatus(txHash, rpcUrl) {
        const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl, this.evmChainId, { staticNetwork: true });
        try {
            const receipt = await provider.getTransactionReceipt(txHash);
            if (!receipt) {
                // Transaction not found or not yet mined
                return { confirmed: false };
            }
            // Transaction is confirmed if it has a block number
            return {
                confirmed: true,
                blockNumber: receipt.blockNumber,
            };
        }
        catch (error) {
            console.error('[EVMAdapter] Error checking transaction status:', error);
            return { confirmed: false };
        }
    }
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
    async getMaxTransferableAmount(address, rpcUrl) {
        // Get current balance
        const balance = await this.getBalance(address, rpcUrl);
        const balanceWei = BigInt(balance.balance);
        const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl, this.evmChainId, { staticNetwork: true });
        try {
            // Get current fee data from the network
            const feeData = await provider.getFeeData();
            // Estimate gas for a simple ETH transfer (21000 gas)
            const gasLimit = 21000n;
            // Calculate fee using maxFeePerGas (EIP-1559) or gasPrice (legacy)
            let estimatedFeeWei;
            if (feeData.maxFeePerGas) {
                // EIP-1559: Use maxFeePerGas (base fee + priority fee)
                estimatedFeeWei = gasLimit * BigInt(feeData.maxFeePerGas.toString());
            }
            else if (feeData.gasPrice) {
                // Legacy: Use gasPrice
                estimatedFeeWei = gasLimit * BigInt(feeData.gasPrice.toString());
            }
            else {
                // Fallback to 50 gwei if fee data unavailable
                const fallbackGasPrice = ethers_1.ethers.parseUnits('50', 'gwei');
                estimatedFeeWei = gasLimit * BigInt(fallbackGasPrice.toString());
            }
            // Add 20% buffer to cover gas price spikes between estimation and broadcast
            // (on volatile chains like Polygon, maxFeePerGas can rise significantly)
            estimatedFeeWei = estimatedFeeWei * 120n / 100n;
            // Calculate max transferable (balance - fee)
            if (balanceWei <= estimatedFeeWei) {
                return {
                    maxAmount: '0',
                    displayAmount: '0',
                };
            }
            const maxTransferableWei = balanceWei - estimatedFeeWei;
            const displayAmount = ethers_1.ethers.formatEther(maxTransferableWei);
            return {
                maxAmount: maxTransferableWei.toString(),
                displayAmount,
            };
        }
        catch (error) {
            console.error('[EVMAdapter] Error calculating max transferable amount:', error);
            // On error, return 0 to be safe (prevents "insufficient funds" errors)
            return {
                maxAmount: '0',
                displayAmount: '0',
            };
        }
    }
}
exports.EVMAdapter = EVMAdapter;
