/**
 * Shared UTXO chain utilities
 * Used by Bitcoin, Litecoin, Dogecoin, Dash, Bitcoin Cash, Bitcoin SV, Zcash
 */
export declare function hash160(buffer: Buffer): Buffer;
export declare function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null;
/**
 * Decode a bech32 string into its HRP and 5-bit data words, verifying the checksum.
 * Returns null if the string is malformed OR the checksum is invalid.
 */
export declare function bech32Decode(str: string): {
    hrp: string;
    words: number[];
} | null;
export declare function bech32Encode(hrp: string, data: number[]): string;
export type CashAddrType = "p2pkh" | "p2sh";
/**
 * Encode a Bitcoin Cash CashAddr address
 * @param prefix - Network prefix ('bitcoincash' for mainnet, 'bchtest' for testnet)
 * @param hash - 20-byte public key hash (hash160 of public key, or script hash for P2SH)
 * @param type - 'p2pkh' (default) or 'p2sh'
 */
export declare function cashAddrEncode(prefix: string, hash: Buffer, type?: CashAddrType): string;
/**
 * Decode a Bitcoin Cash CashAddr address to its 20-byte hash and address type.
 * Inverse of cashAddrEncode. Accepts with or without the "prefix:" part.
 */
export declare function cashAddrDecode(address: string): {
    hash: Buffer;
    type: CashAddrType;
};
export declare function encodeVarint(n: number): Buffer;
export declare function writeUInt32LE(buf: Buffer, value: number, offset: number): void;
export declare function writeUInt64LE(buf: Buffer, value: bigint, offset: number): void;
/** P2PKH scriptPubKey: OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG */
export declare function p2pkhScriptPubKey(hash: Buffer): Buffer;
/** P2SH scriptPubKey: OP_HASH160 <20-byte script hash> OP_EQUAL */
export declare function p2shScriptPubKey(hash: Buffer): Buffer;
