/**
 * UTXO transaction building, signing, and serialization for Bitcoin-family chains.
 * Supports Legacy (P2PKH) and Native SegWit (P2WPKH) address types.
 *
 * This module is intentionally pure (no network calls). The adapter layer
 * fetches UTXOs and fee rates via UtxoProvider, then calls these functions.
 */
import type { UTXO, FeeRates } from "../../utils/utxoProviders";
export declare function estimateFee(numInputs: number, numOutputs: number, isSegwit: boolean, feeRate: number): number;
export interface SelectedUTXOs {
    selected: UTXO[];
    totalInput: bigint;
    fee: bigint;
    change: bigint;
}
export declare function selectUTXOs(utxos: UTXO[], amountSat: bigint, feeRates: FeeRates, isSegwit: boolean, feeRateLevel?: "fast" | "medium" | "slow", minFeeRate?: number): SelectedUTXOs;
export interface UtxoUnsignedTxRaw {
    inputs: Array<{
        txid: string;
        vout: number;
        value: number;
        sequence: number;
        scriptPubKey: string;
    }>;
    outputs: Array<{
        address: string;
        value: bigint;
        scriptPubKey: string;
    }>;
    version: number;
    locktime: number;
    isSegwit: boolean;
    useForkId?: boolean;
    sighashes: string[];
}
export interface UtxoNetworkParams {
    p2pkhVersion: number;
    p2shVersion: number;
    bech32Hrps: string[];
}
export declare function addressToScriptPubKey(address: string, network: UtxoNetworkParams): Uint8Array;
export declare function buildUnsignedTx(inputs: Array<{
    utxo: UTXO;
    sequence?: number;
}>, outputs: Array<{
    address: string;
    valueSat: bigint;
}>, isSegwit: boolean, network: UtxoNetworkParams, version?: number, locktime?: number, useForkId?: boolean): UtxoUnsignedTxRaw;
export interface InputSignature {
    der: string;
    pubKey: string;
}
export declare function signSighashes(sighashes: string[], privateKeyHex: string, hashType?: number): InputSignature[];
export declare function serializeSignedTx(unsignedRaw: UtxoUnsignedTxRaw, signatures: InputSignature[]): string;
