"use strict";
/**
 * UTXO transaction building, signing, and serialization for Bitcoin-family chains.
 * Supports Legacy (P2PKH) and Native SegWit (P2WPKH) address types.
 *
 * This module is intentionally pure (no network calls). The adapter layer
 * fetches UTXOs and fee rates via UtxoProvider, then calls these functions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateFee = estimateFee;
exports.selectUTXOs = selectUTXOs;
exports.addressToScriptPubKey = addressToScriptPubKey;
exports.buildUnsignedTx = buildUnsignedTx;
exports.signSighashes = signSighashes;
exports.serializeSignedTx = serializeSignedTx;
const sha256_1 = require("@noble/hashes/sha256");
const secp256k1_1 = require("@noble/curves/secp256k1");
// ---------------------------------------------------------------------------
// Byte-level helpers
// ---------------------------------------------------------------------------
function doubleSha256(data) {
    return (0, sha256_1.sha256)((0, sha256_1.sha256)(data));
}
function writeUInt32LE(value) {
    const buf = new Uint8Array(4);
    buf[0] = value & 0xff;
    buf[1] = (value >> 8) & 0xff;
    buf[2] = (value >> 16) & 0xff;
    buf[3] = (value >> 24) & 0xff;
    return buf;
}
function writeUInt64LE(value) {
    const buf = new Uint8Array(8);
    let v = BigInt(value);
    for (let i = 0; i < 8; i++) {
        buf[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return buf;
}
function encodeVarint(n) {
    if (n < 0xfd)
        return new Uint8Array([n]);
    if (n <= 0xffff)
        return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
    if (n <= 0xffffffff) {
        const b = new Uint8Array(5);
        b[0] = 0xfe;
        b[1] = n & 0xff;
        b[2] = (n >> 8) & 0xff;
        b[3] = (n >> 16) & 0xff;
        b[4] = (n >> 24) & 0xff;
        return b;
    }
    throw new Error("varint too large");
}
function concat(...arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
    }
    return out;
}
function hexToBytes(hex) {
    const h = hex.replace("0x", "");
    const bytes = new Uint8Array(h.length / 2);
    for (let i = 0; i < bytes.length; i++)
        bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return bytes;
}
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
// Reverse byte order of a txid (internal vs display format)
function reverseTxid(txidHex) {
    return hexToBytes(txidHex).reverse();
}
// ---------------------------------------------------------------------------
// Script helpers
// ---------------------------------------------------------------------------
function p2pkhScript(pubKeyHash) {
    // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
    return concat(new Uint8Array([0x76, 0xa9, 0x14]), pubKeyHash, new Uint8Array([0x88, 0xac]));
}
// ---------------------------------------------------------------------------
// Fee estimation
// ---------------------------------------------------------------------------
// Virtual byte size estimation for fee calculation.
// Legacy: 10 base + 148 per input + 34 per output
// SegWit P2WPKH: 10.5 base + 67.75 per input + 31 per output (rounded up)
function estimateFee(numInputs, numOutputs, isSegwit, feeRate) {
    const vBytes = isSegwit
        ? Math.ceil(10.5 + numInputs * 67.75 + numOutputs * 31)
        : 10 + numInputs * 148 + numOutputs * 34;
    return vBytes * feeRate;
}
function selectUTXOs(utxos, amountSat, feeRates, isSegwit, feeRateLevel = "fast", minFeeRate = 1) {
    // Providers sometimes return a floor-level estimate (~1 sat/vByte) that leaves
    // a sweep stuck for hours. For a recovery tool we want funds to move promptly,
    // so clamp to at least minFeeRate.
    const rate = Math.max(feeRates[feeRateLevel], minFeeRate);
    // Sort largest first to minimise input count
    const sorted = [...utxos].sort((a, b) => b.value - a.value);
    const selected = [];
    let totalInput = 0n;
    for (const utxo of sorted) {
        selected.push(utxo);
        totalInput += BigInt(utxo.value);
        // Estimate with 1 output (no change); if we need change, add another output
        const feeNoChange = BigInt(estimateFee(selected.length, 1, isSegwit, rate));
        const feeWithChange = BigInt(estimateFee(selected.length, 2, isSegwit, rate));
        if (totalInput >= amountSat + feeNoChange) {
            const change = totalInput - amountSat - feeNoChange;
            // Only add change output if it's worth the extra output cost (dust threshold: 546 sat)
            if (change > 546n) {
                const fee = totalInput - amountSat - change;
                return { selected, totalInput, fee, change };
            }
            // Absorb dust into fee
            return { selected, totalInput, fee: feeNoChange + change, change: 0n };
        }
        if (totalInput >= amountSat + feeWithChange) {
            const fee = feeWithChange;
            const change = totalInput - amountSat - fee;
            if (change > 546n)
                return { selected, totalInput, fee, change };
        }
    }
    throw new Error(`Insufficient funds: need ${amountSat} sat + fees, have ${totalInput} sat across ${utxos.length} UTXOs`);
}
// ---------------------------------------------------------------------------
// bech32 checksum verification (shared by address decoding below)
// ---------------------------------------------------------------------------
const BECH32_CHECKSUM_CONST = 1;
const BECH32M_CHECKSUM_CONST = 0x2bc830a3; // BIP-350 (taproot / segwit v1+)
function bech32Polymod(values) {
    const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
        const top = chk >> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ v;
        for (let i = 0; i < 5; i++) {
            if ((top >> i) & 1)
                chk ^= GENERATOR[i];
        }
    }
    return chk;
}
function bech32HrpExpand(hrp) {
    const ret = [];
    for (let i = 0; i < hrp.length; i++)
        ret.push(hrp.charCodeAt(i) >> 5);
    ret.push(0);
    for (let i = 0; i < hrp.length; i++)
        ret.push(hrp.charCodeAt(i) & 31);
    return ret;
}
// Decode a bech32 address (bc1q... / tb1q...) to the scriptPubKey bytes.
// Verifies the checksum (bech32 or bech32m) and that the HRP is one this chain accepts.
function decodeBech32ToScript(address, allowedHrps) {
    const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const lower = address.toLowerCase();
    const sepIdx = lower.lastIndexOf("1");
    if (sepIdx < 1)
        throw new Error(`Invalid bech32 address: ${address}`);
    const hrp = lower.slice(0, sepIdx);
    if (!allowedHrps.includes(hrp)) {
        throw new Error(`Address ${address} has an unsupported or wrong-network bech32 prefix "${hrp}"`);
    }
    const dataChars = lower.slice(sepIdx + 1);
    if (dataChars.length < 6)
        throw new Error(`Invalid bech32 address: ${address}`);
    const data5bit = Array.from(dataChars).map((c) => CHARSET.indexOf(c));
    if (data5bit.some((v) => v === -1))
        throw new Error(`Invalid bech32 chars in: ${address}`);
    const polymod = bech32Polymod(bech32HrpExpand(hrp).concat(data5bit));
    if (polymod !== BECH32_CHECKSUM_CONST && polymod !== BECH32M_CHECKSUM_CONST) {
        throw new Error(`Invalid bech32 checksum for address: ${address}`);
    }
    const payload5bit = data5bit.slice(0, -6);
    // Convert from 5-bit groups to 8-bit (skip witness version byte at start)
    const witVer = payload5bit[0];
    const converted = [];
    let acc = 0, bits = 0;
    for (const val of payload5bit.slice(1)) {
        acc = (acc << 5) | val;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            converted.push((acc >> bits) & 0xff);
        }
    }
    const witnessProgram = new Uint8Array(converted);
    // OP_0 (0x00) or OP_1..OP_16 + push length + witness program
    const opcode = witVer === 0 ? 0x00 : 0x50 + witVer;
    return concat(new Uint8Array([opcode, witnessProgram.length]), witnessProgram);
}
// Decode a base58 string to bytes, correctly restoring leading zero bytes
// (each leading '1' character represents one 0x00 byte that BigInt math alone
// would otherwise lose).
function base58Decode(str) {
    const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let num = 0n;
    for (const char of str) {
        const idx = ALPHABET.indexOf(char);
        if (idx === -1)
            throw new Error(`Invalid base58 char: ${char}`);
        num = num * 58n + BigInt(idx);
    }
    let body;
    if (num === 0n) {
        body = new Uint8Array(0);
    }
    else {
        let hex = num.toString(16);
        if (hex.length % 2 !== 0)
            hex = "0" + hex;
        body = hexToBytes(hex);
    }
    let leadingZeros = 0;
    for (const char of str) {
        if (char === "1")
            leadingZeros += 1;
        else
            break;
    }
    return concat(new Uint8Array(leadingZeros), body);
}
// Decode a legacy (base58check) address to its payload hash (20 bytes) and version byte,
// verifying the 4-byte checksum. Handles both 1-byte version (BTC, LTC, DOGE, DASH, BCH)
// and 2-byte version (ZEC t-addrs).
function decodeBase58CheckToHash(address) {
    const decoded = base58Decode(address);
    if (decoded.length < 5)
        throw new Error(`Invalid base58check address: ${address}`);
    const payload = decoded.subarray(0, decoded.length - 4);
    const checksum = decoded.subarray(decoded.length - 4);
    const expectedChecksum = doubleSha256(payload).subarray(0, 4);
    for (let i = 0; i < 4; i++) {
        if (checksum[i] !== expectedChecksum[i]) {
            throw new Error(`Invalid checksum for address: ${address}`);
        }
    }
    // ZEC transparent addresses use a 2-byte version prefix: [0x1c, 0xb8] for mainnet t1,
    // [0x1c, 0xbd] for t3 P2SH, [0x1d, 0x25] for testnet.
    const hasTwoByteVersion = payload[0] === 0x1c || payload[0] === 0x1d;
    const offset = hasTwoByteVersion ? 2 : 1;
    const hash = payload.subarray(offset, offset + 20);
    if (hash.length !== 20)
        throw new Error(`Invalid base58check payload length for address: ${address}`);
    return { hash, versionByte: payload[0] };
}
function addressToScriptPubKey(address, network) {
    const lower = address.toLowerCase();
    const sepIdx = lower.lastIndexOf("1");
    const looksBech32 = sepIdx > 0 && network.bech32Hrps.includes(lower.slice(0, sepIdx));
    if (looksBech32) {
        return decodeBech32ToScript(address, network.bech32Hrps);
    }
    const { hash, versionByte } = decodeBase58CheckToHash(address);
    // ZEC t3 P2SH addresses use a 2-byte version prefix ([0x1c, 0xbd]) handled entirely
    // via versionByte above; not part of the single-byte p2pkh/p2sh comparison below.
    if (versionByte === network.p2shVersion) {
        return concat(new Uint8Array([0xa9, 0x14]), hash, new Uint8Array([0x87]));
    }
    if (versionByte === network.p2pkhVersion) {
        return p2pkhScript(hash);
    }
    throw new Error(`Address ${address} does not match this chain's network (expected version 0x${network.p2pkhVersion.toString(16)} for P2PKH or 0x${network.p2shVersion.toString(16)} for P2SH, got 0x${versionByte.toString(16)})`);
}
// ---------------------------------------------------------------------------
// Build unsigned transaction (populates sighashes for the signing step)
// ---------------------------------------------------------------------------
function buildUnsignedTx(inputs, outputs, isSegwit, network, version = 2, locktime = 0, useForkId = false) {
    const txInputs = inputs.map(({ utxo, sequence = 0xffffffff }) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        sequence,
        scriptPubKey: utxo.scriptPubKey ?? "",
    }));
    const txOutputs = outputs.map(({ address, valueSat }) => ({
        address,
        value: valueSat,
        scriptPubKey: bytesToHex(addressToScriptPubKey(address, network)),
    }));
    // BCH: uses BIP143 sighash preimage even for legacy P2PKH addresses, but with
    // SIGHASH_ALL|SIGHASH_FORKID (0x41) as replay protection. Serialization stays legacy.
    let sighashes;
    if (useForkId) {
        sighashes = buildSegwitSighashes(txInputs, txOutputs, version, locktime, 0x41);
    }
    else if (isSegwit) {
        sighashes = buildSegwitSighashes(txInputs, txOutputs, version, locktime, 0x01);
    }
    else {
        sighashes = buildLegacySighashes(txInputs, txOutputs, version, locktime);
    }
    return {
        inputs: txInputs,
        outputs: txOutputs,
        version,
        locktime,
        isSegwit,
        useForkId,
        sighashes,
    };
}
// BIP143 segwit sighash (one per input).
// hashType: 0x01 = SIGHASH_ALL (SegWit), 0x41 = SIGHASH_ALL|SIGHASH_FORKID (BCH)
function buildSegwitSighashes(inputs, outputs, version, locktime, hashType = 0x01) {
    // hashPrevouts: double-sha256 of all outpoints
    const prevouts = concat(...inputs.map((inp) => concat(reverseTxid(inp.txid), writeUInt32LE(inp.vout))));
    const hashPrevouts = doubleSha256(prevouts);
    // hashSequence: double-sha256 of all sequences
    const seqs = concat(...inputs.map((inp) => writeUInt32LE(inp.sequence)));
    const hashSequence = doubleSha256(seqs);
    // hashOutputs: double-sha256 of all outputs
    const outBytes = concat(...outputs.map((out) => {
        const scriptBytes = hexToBytes(out.scriptPubKey);
        return concat(writeUInt64LE(out.value), encodeVarint(scriptBytes.length), scriptBytes);
    }));
    const hashOutputs = doubleSha256(outBytes);
    return inputs.map((inp) => {
        const scriptCode = hexToBytes(inp.scriptPubKey);
        // For P2WPKH: scriptCode = OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
        // If the stored scriptPubKey is already the full P2PKH form, use it directly.
        // If it's the P2WPKH witness program (OP_0 <20 bytes>), derive P2PKH from it.
        let finalScriptCode;
        if (scriptCode.length === 22 &&
            scriptCode[0] === 0x00 &&
            scriptCode[1] === 0x14) {
            // P2WPKH witness program → scriptCode is P2PKH equivalent
            finalScriptCode = p2pkhScript(scriptCode.slice(2));
        }
        else if (scriptCode.length === 25) {
            finalScriptCode = scriptCode; // Already P2PKH
        }
        else {
            // Fallback: use as-is
            finalScriptCode = scriptCode;
        }
        const preimage = concat(writeUInt32LE(version), hashPrevouts, hashSequence, reverseTxid(inp.txid), writeUInt32LE(inp.vout), encodeVarint(finalScriptCode.length), finalScriptCode, writeUInt64LE(BigInt(inp.value)), writeUInt32LE(inp.sequence), hashOutputs, writeUInt32LE(locktime), writeUInt32LE(hashType));
        return bytesToHex(doubleSha256(preimage));
    });
}
// Legacy sighash: double-sha256 of the serialized tx with scriptPubKey in place of scriptSig
function buildLegacySighashes(inputs, outputs, version, locktime) {
    return inputs.map((_signingInput, sigIdx) => {
        const serialized = concat(writeUInt32LE(version), encodeVarint(inputs.length), ...inputs.map((inp, i) => {
            const script = i === sigIdx ? hexToBytes(inp.scriptPubKey) : new Uint8Array(0);
            return concat(reverseTxid(inp.txid), writeUInt32LE(inp.vout), encodeVarint(script.length), script, writeUInt32LE(inp.sequence));
        }), encodeVarint(outputs.length), ...outputs.map((out) => {
            const scriptBytes = hexToBytes(out.scriptPubKey);
            return concat(writeUInt64LE(out.value), encodeVarint(scriptBytes.length), scriptBytes);
        }), writeUInt32LE(locktime), writeUInt32LE(0x00000001));
        return bytesToHex(doubleSha256(serialized));
    });
}
function signSighashes(sighashes, privateKeyHex, hashType = 0x01) {
    const privKey = hexToBytes(privateKeyHex.replace("0x", ""));
    const pubKey = secp256k1_1.secp256k1.getPublicKey(privKey, true); // compressed
    const hashTypeByte = hashType.toString(16).padStart(2, "0");
    return sighashes.map((hashHex) => {
        const hash = hexToBytes(hashHex);
        const sig = secp256k1_1.secp256k1.sign(hash, privKey, { lowS: true });
        const der = sig.toDERHex();
        return {
            der: der + hashTypeByte,
            pubKey: bytesToHex(pubKey),
        };
    });
}
// ---------------------------------------------------------------------------
// Serialize the final signed transaction
// ---------------------------------------------------------------------------
function serializeSignedTx(unsignedRaw, signatures) {
    return unsignedRaw.isSegwit
        ? serializeSegwitTx(unsignedRaw, signatures)
        : serializeLegacyTx(unsignedRaw, signatures);
}
function serializeLegacyTx(raw, signatures) {
    const parts = [writeUInt32LE(raw.version)];
    parts.push(encodeVarint(raw.inputs.length));
    for (let i = 0; i < raw.inputs.length; i++) {
        const inp = raw.inputs[i];
        const sig = hexToBytes(signatures[i].der);
        const pub = hexToBytes(signatures[i].pubKey);
        // scriptSig: <sig_length> <sig> <pub_length> <pub>
        const scriptSig = concat(encodeVarint(sig.length), sig, encodeVarint(pub.length), pub);
        parts.push(reverseTxid(inp.txid), writeUInt32LE(inp.vout), encodeVarint(scriptSig.length), scriptSig, writeUInt32LE(inp.sequence));
    }
    parts.push(encodeVarint(raw.outputs.length));
    for (const out of raw.outputs) {
        const script = hexToBytes(out.scriptPubKey);
        parts.push(writeUInt64LE(out.value), encodeVarint(script.length), script);
    }
    parts.push(writeUInt32LE(raw.locktime));
    return bytesToHex(concat(...parts));
}
function serializeSegwitTx(raw, signatures) {
    const parts = [
        writeUInt32LE(raw.version),
        new Uint8Array([0x00, 0x01]), // segwit marker + flag
    ];
    parts.push(encodeVarint(raw.inputs.length));
    for (const inp of raw.inputs) {
        // scriptSig is empty for P2WPKH native segwit
        parts.push(reverseTxid(inp.txid), writeUInt32LE(inp.vout), new Uint8Array([0x00]), writeUInt32LE(inp.sequence));
    }
    parts.push(encodeVarint(raw.outputs.length));
    for (const out of raw.outputs) {
        const script = hexToBytes(out.scriptPubKey);
        parts.push(writeUInt64LE(out.value), encodeVarint(script.length), script);
    }
    // Witness data: one stack per input
    for (let i = 0; i < raw.inputs.length; i++) {
        const sig = hexToBytes(signatures[i].der);
        const pub = hexToBytes(signatures[i].pubKey);
        // 2 witness items: [sig, pubkey]
        parts.push(new Uint8Array([0x02]), // item count
        encodeVarint(sig.length), sig, encodeVarint(pub.length), pub);
    }
    parts.push(writeUInt32LE(raw.locktime));
    return bytesToHex(concat(...parts));
}
