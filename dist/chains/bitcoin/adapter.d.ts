import type { NativeAssetConfig } from '@fireblocks-recovery/assets-evm-btc';
import type { BlockchainAdapter, AddressOptions, TransferParams, UnsignedTransaction, TransactionSignature, SignedTransaction, BroadcastResult, BalanceInfo } from '../../core/adapter';
import type { UtxoProvider } from '../../utils/utxoProviders';
import type { UtxoNetworkParams } from './utxoTx';
export declare class BitcoinAdapter implements BlockchainAdapter {
    readonly assetConfig: NativeAssetConfig;
    protected readonly bech32Hrp: string;
    protected readonly p2pkhVersion: number;
    protected readonly p2shVersion: number;
    protected readonly supportsSegwit: boolean;
    protected readonly minFeeRate: number;
    protected readonly useForkId: boolean;
    constructor(assetConfig: NativeAssetConfig);
    protected get networkParams(): UtxoNetworkParams;
    private static providerFromUrl;
    protected getProvider(params: {
        rpcUrl: string;
        utxoRpcConfig?: TransferParams['utxoRpcConfig'];
    }): UtxoProvider;
    generateAddress(publicKey: string, options?: AddressOptions): string;
    validateAddress(address: string): boolean;
    getSupportedAddressTypes(): import("@fireblocks-recovery/assets-evm-btc").AddressType[];
    detectAddressType(address: string): string | undefined;
    getBalance(address: string, rpcUrl: string, utxoRpcConfig?: TransferParams['utxoRpcConfig']): Promise<BalanceInfo>;
    buildUnsignedTransaction(params: TransferParams): Promise<UnsignedTransaction>;
    signTransaction(unsignedTx: UnsignedTransaction, privateKey: string): Promise<TransactionSignature>;
    embedSignature(unsignedTx: UnsignedTransaction, signature: TransactionSignature): Promise<SignedTransaction>;
    broadcastTransaction(signedTx: SignedTransaction, rpcUrl: string, options?: {
        timeout?: number;
        utxoRpcConfig?: TransferParams['utxoRpcConfig'];
    }): Promise<BroadcastResult>;
    getTransactionStatus(txHash: string, rpcUrl: string): Promise<{
        confirmed: boolean;
        blockNumber?: number;
        failed?: boolean;
        error?: string;
    }>;
    getMaxTransferableAmount(address: string, rpcUrl: string, currentBalance?: string, utxoRpcConfig?: TransferParams['utxoRpcConfig']): Promise<{
        maxAmount: string;
        displayAmount: string;
    }>;
}
