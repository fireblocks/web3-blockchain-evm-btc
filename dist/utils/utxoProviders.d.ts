import type { UtxoProviderType } from "@fireblocks-recovery/assets-evm-btc";
export interface UTXO {
    txid: string;
    vout: number;
    value: number;
    scriptPubKey?: string;
}
export interface FeeRates {
    fast: number;
    medium: number;
    slow: number;
}
export interface TxStatus {
    confirmed: boolean;
    blockNumber?: number;
}
export interface UtxoProvider {
    getBalance(address: string): Promise<bigint>;
    getUTXOs(address: string): Promise<UTXO[]>;
    getFeeRates(): Promise<FeeRates>;
    broadcastTx(txHex: string): Promise<string>;
    getBlockHeight?(): Promise<number>;
    getTransactionStatus?(txHash: string): Promise<TxStatus>;
}
export declare class EsploraProvider implements UtxoProvider {
    private readonly baseUrl;
    constructor(baseUrl: string);
    getBalance(address: string): Promise<bigint>;
    getUTXOs(address: string): Promise<UTXO[]>;
    getFeeRates(): Promise<FeeRates>;
    broadcastTx(txHex: string): Promise<string>;
    getBlockHeight(): Promise<number>;
    getTransactionStatus(txHash: string): Promise<TxStatus>;
}
export declare class BlockchairProvider implements UtxoProvider {
    private readonly baseUrl;
    private readonly apiKey?;
    constructor(baseUrl: string, apiKey?: string | undefined);
    private keyParam;
    getBalance(address: string): Promise<bigint>;
    getUTXOs(address: string): Promise<UTXO[]>;
    getFeeRates(): Promise<FeeRates>;
    broadcastTx(txHex: string): Promise<string>;
    getBlockHeight(): Promise<number>;
    getTransactionStatus(txHash: string): Promise<TxStatus>;
}
export declare class BlockCypherProvider implements UtxoProvider {
    private readonly baseUrl;
    constructor(baseUrl: string);
    getBalance(address: string): Promise<bigint>;
    getUTXOs(address: string): Promise<UTXO[]>;
    getFeeRates(): Promise<FeeRates>;
    broadcastTx(txHex: string): Promise<string>;
}
export declare class WhatsOnChainProvider implements UtxoProvider {
    private readonly baseUrl;
    constructor(baseUrl: string);
    getBalance(address: string): Promise<bigint>;
    getUTXOs(address: string): Promise<UTXO[]>;
    getFeeRates(): Promise<FeeRates>;
    broadcastTx(txHex: string): Promise<string>;
}
export declare class BitailsProvider implements UtxoProvider {
    private readonly baseUrl;
    constructor(baseUrl: string);
    getBalance(address: string): Promise<bigint>;
    getUTXOs(address: string): Promise<UTXO[]>;
    getFeeRates(): Promise<FeeRates>;
    broadcastTx(txHex: string): Promise<string>;
}
export declare class ActorForthProvider implements UtxoProvider {
    private readonly baseUrl;
    constructor(baseUrl: string);
    getBalance(address: string): Promise<bigint>;
    getUTXOs(address: string): Promise<UTXO[]>;
    getFeeRates(): Promise<FeeRates>;
    broadcastTx(txHex: string): Promise<string>;
}
export declare class SoChainProvider implements UtxoProvider {
    private readonly network;
    private readonly soBase;
    constructor(baseUrl: string);
    private toSatoshis;
    getBalance(address: string): Promise<bigint>;
    getUTXOs(address: string): Promise<UTXO[]>;
    getFeeRates(): Promise<FeeRates>;
    broadcastTx(txHex: string): Promise<string>;
}
export declare class FallbackUtxoProvider implements UtxoProvider {
    private readonly providers;
    constructor(providers: UtxoProvider[]);
    private tryAll;
    getBalance(address: string): Promise<bigint>;
    getUTXOs(address: string): Promise<UTXO[]>;
    getFeeRates(): Promise<FeeRates>;
    broadcastTx(txHex: string): Promise<string>;
    getBlockHeight(): Promise<number>;
    getTransactionStatus(txHash: string): Promise<TxStatus>;
}
export declare function createUtxoProvider(endpoints: Array<{
    url: string;
    providerType: UtxoProviderType;
    apiKey?: string;
}>): UtxoProvider;
