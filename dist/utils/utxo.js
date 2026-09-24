"use strict";
/**
 * Shared UTXO chain utilities
 * Used by Bitcoin, Litecoin, Dogecoin, Dash, Bitcoin Cash, Bitcoin SV, Zcash
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.hash160 = hash160;
exports.convertBits = convertBits;
exports.bech32Decode = bech32Decode;
exports.bech32Encode = bech32Encode;
exports.cashAddrEncode = cashAddrEncode;
exports.cashAddrDecode = cashAddrDecode;
exports.encodeVarint = encodeVarint;
exports.writeUInt32LE = writeUInt32LE;
exports.writeUInt64LE = writeUInt64LE;
exports.p2pkhScriptPubKey = p2pkhScriptPubKey;
exports.p2shScriptPubKey = p2shScriptPubKey;
const sha256_1 = require("@noble/hashes/sha256");
const ripemd160_1 = require("@noble/hashes/ripemd160");
function hash160(buffer) {
    const sha = (0, sha256_1.sha256)(buffer);
    const hash = (0, ripemd160_1.ripemd160)(sha);
    return Buffer.from(hash);
}
function convertBits(data, fromBits, toBits, pad) {
    let acc = 0;
    let bits = 0;
    const ret = [];
    const maxv = (1 << toBits) - 1;
    for (const value of data) {
        if (value < 0 || value >> fromBits !== 0) {
            return null;
        }
        acc = (acc << fromBits) | value;
        bits += fromBits;
        while (bits >= toBits) {
            bits -= toBits;
            ret.push((acc >> bits) & maxv);
        }
    }
    if (pad) {
        if (bits > 0) {
            ret.push((acc << (toBits - bits)) & maxv);
        }
    }
    else if (bits >= fromBits || (acc << (toBits - bits)) & maxv) {
        return null;
    }
    return ret;
}
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bech32Polymod(values) {
    const GENERATOR = [
        0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
    ];
    let chk = 1;
    for (const value of values) {
        const top = chk >> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ value;
        for (let i = 0; i < 5; i++) {
            if ((top >> i) & 1) {
                chk ^= GENERATOR[i];
            }
        }
    }
    return chk;
}
function hrpExpand(hrp) {
    const ret = [];
    for (let i = 0; i < hrp.length; i++) {
        ret.push(hrp.charCodeAt(i) >> 5);
    }
    ret.push(0);
    for (let i = 0; i < hrp.length; i++) {
        ret.push(hrp.charCodeAt(i) & 31);
    }
    return ret;
}
const BECH32_CHARSET_REV = {};
"qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    .split("")
    .forEach((c, i) => (BECH32_CHARSET_REV[c] = i));
// bech32 checksum constant; bech32m (BIP-350, used by taproot/segwit-v1+) uses a different constant.
const BECH32_CHECKSUM_CONST = 1;
const BECH32M_CHECKSUM_CONST = 0x2bc830a3;
/**
 * Decode a bech32 string into its HRP and 5-bit data words, verifying the checksum.
 * Returns null if the string is malformed OR the checksum is invalid.
 */
function bech32Decode(str) {
    const lower = str.toLowerCase();
    const sepIdx = lower.lastIndexOf("1");
    if (sepIdx < 1 || sepIdx + 7 > lower.length)
        return null;
    const hrp = lower.slice(0, sepIdx);
    const dataStr = lower.slice(sepIdx + 1);
    const words = [];
    for (const ch of dataStr) {
        const val = BECH32_CHARSET_REV[ch];
        if (val === undefined)
            return null;
        words.push(val);
    }
    const polymod = bech32Polymod(hrpExpand(hrp).concat(words));
    if (polymod !== BECH32_CHECKSUM_CONST && polymod !== BECH32M_CHECKSUM_CONST) {
        return null; // invalid checksum
    }
    return { hrp, words: words.slice(0, -6) };
}
function bech32Encode(hrp, data) {
    const checksumData = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    const mod = bech32Polymod(checksumData) ^ 1;
    const checksum = [];
    for (let i = 0; i < 6; i++) {
        checksum.push((mod >> (5 * (5 - i))) & 31);
    }
    const combined = data.concat(checksum);
    let result = hrp + "1";
    for (const d of combined) {
        result += BECH32_CHARSET.charAt(d);
    }
    return result;
}
/**
 * CashAddr encoding for Bitcoin Cash (BCH)
 * Reference: https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md
 */
function cashAddrPolymod(values) {
    const GENERATORS = [
        BigInt("0x98f2bc8e61"),
        BigInt("0x79b76d99e2"),
        BigInt("0xf33e5fb3c4"),
        BigInt("0xae2eabe2a8"),
        BigInt("0x1e4f43e470"),
    ];
    let c = BigInt(1);
    for (const d of values) {
        const c0 = c >> BigInt(35);
        c = ((c & BigInt("0x07ffffffff")) << BigInt(5)) ^ BigInt(d);
        for (let i = 0; i < 5; i++) {
            if ((c0 >> BigInt(i)) & BigInt(1)) {
                c ^= GENERATORS[i];
            }
        }
    }
    return c ^ BigInt(1);
}
/**
 * Encode a Bitcoin Cash CashAddr address
 * @param prefix - Network prefix ('bitcoincash' for mainnet, 'bchtest' for testnet)
 * @param hash - 20-byte public key hash (hash160 of public key, or script hash for P2SH)
 * @param type - 'p2pkh' (default) or 'p2sh'
 */
function cashAddrEncode(prefix, hash, type = "p2pkh") {
    // Version byte: bits 3-6 encode type (0 = P2PKH, 1 = P2SH), bits 0-2 encode hash size
    // (0 = 160 bits / 20 bytes). https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md
    const versionByte = type === "p2sh" ? 0x08 : 0x00;
    // Pack version byte + hash into 5-bit groups
    const payload8 = [versionByte, ...Array.from(hash)];
    const payload5 = convertBits(payload8, 8, 5, true);
    if (!payload5)
        throw new Error("CashAddr: failed to convert payload bits");
    // Prefix data for checksum: lowercase ASCII & 31, followed by 0
    const prefixData = [...prefix].map((c) => c.charCodeAt(0) & 31);
    // Checksum covers: prefix data + 0x00 separator + payload5 + 8 zero bytes
    const checksumInput = [...prefixData, 0, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0];
    const mod = cashAddrPolymod(checksumInput);
    // Extract 8 checksum 5-bit groups (MSB first)
    const checksum = [];
    for (let i = 7; i >= 0; i--) {
        checksum.push(Number((mod >> BigInt(i * 5)) & BigInt(31)));
    }
    const combined = [...payload5, ...checksum];
    return prefix + ":" + combined.map((d) => BECH32_CHARSET[d]).join("");
}
/**
 * Decode a Bitcoin Cash CashAddr address to its 20-byte hash and address type.
 * Inverse of cashAddrEncode. Accepts with or without the "prefix:" part.
 */
function cashAddrDecode(address) {
    const lower = address.toLowerCase();
    const sepIdx = lower.indexOf(":");
    const prefix = sepIdx >= 0 ? lower.slice(0, sepIdx) : "bitcoincash";
    const dataPart = sepIdx >= 0 ? lower.slice(sepIdx + 1) : lower;
    const data5 = [];
    for (const ch of dataPart) {
        const v = BECH32_CHARSET.indexOf(ch);
        if (v === -1)
            throw new Error(`CashAddr: invalid character '${ch}'`);
        data5.push(v);
    }
    // Verify checksum
    const prefixData = [...prefix].map((c) => c.charCodeAt(0) & 31);
    if (cashAddrPolymod([...prefixData, 0, ...data5]) !== BigInt(0)) {
        throw new Error("CashAddr: invalid checksum");
    }
    // Drop the 8 trailing checksum groups, convert payload back to 8-bit bytes
    const payload5 = data5.slice(0, -8);
    const payload8 = convertBits(payload5, 5, 8, false);
    if (!payload8 || payload8.length < 21) {
        throw new Error("CashAddr: failed to decode payload");
    }
    // payload8[0] is the version byte: bits 3-6 encode type (0 = P2PKH, 1 = P2SH),
    // bits 0-2 encode hash size. The next 20 bytes are the hash160/script-hash.
    const versionByte = payload8[0];
    const type = ((versionByte >> 3) & 0x0f) === 1 ? "p2sh" : "p2pkh";
    return { hash: Buffer.from(payload8.slice(1, 21)), type };
}
// ---------------------------------------------------------------------------
// Bitcoin/UTXO raw transaction serialization helpers
// ---------------------------------------------------------------------------
function encodeVarint(n) {
    if (n < 0xfd)
        return Buffer.from([n]);
    if (n <= 0xffff) {
        const b = Buffer.alloc(3);
        b[0] = 0xfd;
        b.writeUInt16LE(n, 1);
        return b;
    }
    if (n <= 0xffffffff) {
        const b = Buffer.alloc(5);
        b[0] = 0xfe;
        b.writeUInt32LE(n, 1);
        return b;
    }
    throw new Error("encodeVarint: value too large");
}
function writeUInt32LE(buf, value, offset) {
    buf.writeUInt32LE(value >>> 0, offset);
}
function writeUInt64LE(buf, value, offset) {
    buf.writeBigUInt64LE(value, offset);
}
/** P2PKH scriptPubKey: OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG */
function p2pkhScriptPubKey(hash) {
    return Buffer.concat([
        Buffer.from([0x76, 0xa9, 0x14]),
        hash,
        Buffer.from([0x88, 0xac]),
    ]);
}
/** P2SH scriptPubKey: OP_HASH160 <20-byte script hash> OP_EQUAL */
function p2shScriptPubKey(hash) {
    return Buffer.concat([
        Buffer.from([0xa9, 0x14]),
        hash,
        Buffer.from([0x87]),
    ]);
}
