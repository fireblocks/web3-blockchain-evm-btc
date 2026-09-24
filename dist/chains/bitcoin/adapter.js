"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BitcoinAdapter = void 0;
const bs58check_1 = __importDefault(require("bs58check"));
const sha256_1 = require("@noble/hashes/sha256");
const ripemd160_1 = require("@noble/hashes/ripemd160");
const utxoProviders_1 = require("../../utils/utxoProviders");
const utxoTx_1 = require("./utxoTx");
// ---------------------------------------------------------------------------
// Address generation helpers (moved to module level, shared by subclasses)
// ---------------------------------------------------------------------------
function hash160(buffer) {
    const sha = (0, sha256_1.sha256)(buffer);
    const hash = (0, ripemd160_1.ripemd160)(sha);
    return Buffer.from(hash);
}
function convertBits(data, fromBits, toBits, pad) {
    let acc = 0, bits = 0;
    const ret = [];
    const maxv = (1 << toBits) - 1;
    for (const value of data) {
        if (value < 0 || value >> fromBits !== 0)
            return null;
        acc = (acc << fromBits) | value;
        bits += fromBits;
        while (bits >= toBits) {
            bits -= toBits;
            ret.push((acc >> bits) & maxv);
        }
    }
    if (pad) {
        if (bits > 0)
            ret.push((acc << (toBits - bits)) & maxv);
    }
    else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv))
        return null;
    return ret;
}
function bech32Encode(hrp, data) {
    const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    function polymod(values) {
        let chk = 1;
        for (const v of values) {
            const top = chk >> 25;
            chk = (chk & 0x1ffffff) << 5 ^ v;
            for (let i = 0; i < 5; i++) {
                if ((top >> i) & 1)
                    chk ^= GENERATOR[i];
            }
        }
        return chk;
    }
    function hrpExpand(h) {
        const ret = [];
        for (let i = 0; i < h.length; i++)
            ret.push(h.charCodeAt(i) >> 5);
        ret.push(0);
        for (let i = 0; i < h.length; i++)
            ret.push(h.charCodeAt(i) & 31);
        return ret;
    }
    const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    const mod = polymod(values) ^ 1;
    const checksum = [];
    for (let i = 0; i < 6; i++)
        checksum.push((mod >> 5 * (5 - i)) & 31);
    const combined = data.concat(checksum);
    let result = hrp + '1';
    for (const d of combined)
        result += CHARSET.charAt(d);
    return result;
}
// ---------------------------------------------------------------------------
// BitcoinAdapter
// ---------------------------------------------------------------------------
class BitcoinAdapter {
    assetConfig;
    // Subclasses may override to change the bech32 HRP (e.g. 'ltc', 'tltc', 'tb')
    bech32Hrp = 'bc';
    // P2PKH version byte (0x00 = BTC mainnet, 0x6f = testnet, 0x30 = LTC, etc.)
    p2pkhVersion = 0x00;
    // P2SH version byte (0x05 = BTC mainnet, 0xc4 = BTC testnet, 0x32 = LTC, etc.)
    p2shVersion = 0x05;
    // Whether this chain supports native SegWit (P2WPKH) destinations/addresses.
    // BTC and LTC do; DOGE, DASH, BSV, and BCH's legacy encoding do not.
    supportsSegwit = true;
    // Minimum fee rate (sat/vByte) floor for withdrawals, so a lowball provider
    // estimate can't produce a stuck-slow sweep. Subclasses may raise it.
    minFeeRate = 2;
    // BCH requires SIGHASH_ALL|SIGHASH_FORKID (0x41) with BIP143 preimage.
    // BTC, LTC, DOGE, DASH, BSV all use standard SIGHASH_ALL (0x01).
    useForkId = false;
    constructor(assetConfig) {
        this.assetConfig = assetConfig;
        if (this.assetConfig.id.includes('TEST')) {
            this.bech32Hrp = 'tb';
            this.p2pkhVersion = 0x6f;
            this.p2shVersion = 0xc4;
        }
    }
    // Network parameters passed to the shared UTXO address-decoding logic so it
    // can validate a destination address's version byte / bech32 HRP against
    // *this* chain, rather than silently accepting any Bitcoin-family address
    // (see addressToScriptPubKey in utxoTx.ts).
    get networkParams() {
        return {
            p2pkhVersion: this.p2pkhVersion,
            p2shVersion: this.p2shVersion,
            bech32Hrps: this.supportsSegwit ? [this.bech32Hrp] : [],
        };
    }
    // ---------------------------------------------------------------------------
    // Provider resolution
    // ---------------------------------------------------------------------------
    // Infer the right provider class from a URL without requiring explicit config.
    // This lets balance IPC handlers pass a plain rpcUrl string and still get
    // the correct provider behaviour (e.g. BlockCypher format for LTC/DOGE).
    static providerFromUrl(url) {
        if (url.includes('blockchair.com'))
            return new utxoProviders_1.BlockchairProvider(url);
        if (url.includes('blockcypher.com'))
            return new utxoProviders_1.BlockCypherProvider(url);
        if (url.includes('whatsonchain.com'))
            return new utxoProviders_1.WhatsOnChainProvider(url);
        if (url.includes('actorforth.org'))
            return new utxoProviders_1.ActorForthProvider(url);
        if (url.includes('bitails.io'))
            return new utxoProviders_1.BitailsProvider(url);
        return new utxoProviders_1.EsploraProvider(url); // Blockstream, Mempool.space, or any Esplora instance
    }
    getProvider(params) {
        // 1. Caller-supplied endpoints (carry the runtime API key)
        if (params.utxoRpcConfig?.endpoints && params.utxoRpcConfig.endpoints.length > 0) {
            return (0, utxoProviders_1.createUtxoProvider)(params.utxoRpcConfig.endpoints);
        }
        // 2. The asset's own configured endpoint list — gives the full fallback chain
        //    even for calls that only receive an rpcUrl (e.g. status polling).
        const configured = this.assetConfig.utxoRpcEndpoints;
        if (configured && configured.length > 0) {
            return (0, utxoProviders_1.createUtxoProvider)(configured);
        }
        // 3. Last resort: infer a single provider from the URL.
        return BitcoinAdapter.providerFromUrl(params.rpcUrl);
    }
    // ---------------------------------------------------------------------------
    // Address generation
    // ---------------------------------------------------------------------------
    generateAddress(publicKey, options) {
        const addressType = options?.addressType ?? 'segwit';
        const pubKeyBuffer = Buffer.from(publicKey.replace('0x', ''), 'hex');
        const pubKeyHash = hash160(pubKeyBuffer);
        if (addressType === 'legacy') {
            const payload = Buffer.concat([Buffer.from([this.p2pkhVersion]), pubKeyHash]);
            return bs58check_1.default.encode(payload);
        }
        // Native segwit (P2WPKH bech32)
        const words = convertBits(Array.from(pubKeyHash), 8, 5, true);
        if (!words)
            throw new Error('Failed to convert bits for bech32 encoding');
        return bech32Encode(this.bech32Hrp, [0].concat(words));
    }
    validateAddress(address) {
        try {
            // Reuses the same checksum + network-version validation as the actual
            // transaction-building path, so "valid" here means "buildable" there.
            (0, utxoTx_1.addressToScriptPubKey)(address, this.networkParams);
            return true;
        }
        catch {
            return false;
        }
    }
    getSupportedAddressTypes() {
        return this.assetConfig.addressCapabilities?.addressTypes ?? [
            { id: 'legacy', name: 'Legacy (P2PKH)', description: `Base58 addresses starting with 1` },
            { id: 'segwit', name: 'Native SegWit (P2WPKH)', description: `Bech32 addresses starting with ${this.bech32Hrp}1` },
        ];
    }
    detectAddressType(address) {
        const lower = address.toLowerCase();
        if (lower.startsWith(`${this.bech32Hrp}1p`))
            return 'taproot';
        if (lower.startsWith(`${this.bech32Hrp}1q`) || lower.startsWith(`${this.bech32Hrp}1`))
            return 'segwit';
        if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n'))
            return 'legacy';
        return undefined;
    }
    // ---------------------------------------------------------------------------
    // Balance
    // ---------------------------------------------------------------------------
    async getBalance(address, rpcUrl, utxoRpcConfig) {
        const provider = this.getProvider({ rpcUrl, utxoRpcConfig });
        const satoshis = await provider.getBalance(address);
        const displayBalance = (Number(satoshis) / 1e8).toFixed(8).replace(/\.?0+$/, '');
        return {
            balance: satoshis.toString(),
            decimals: 8,
            displayBalance,
        };
    }
    // ---------------------------------------------------------------------------
    // Build unsigned transaction
    // ---------------------------------------------------------------------------
    async buildUnsignedTransaction(params) {
        const { from, to, amount, rpcUrl, utxoRpcConfig } = params;
        if (!this.validateAddress(to)) {
            throw new Error(`Invalid or wrong-network destination address for ${this.assetConfig.id}: ${to}`);
        }
        const provider = this.getProvider({ rpcUrl, utxoRpcConfig });
        const amountSat = BigInt(amount);
        const isSegwit = this.detectAddressType(from) === 'segwit';
        const [utxos, feeRates] = await Promise.all([
            provider.getUTXOs(from),
            provider.getFeeRates(),
        ]);
        if (utxos.length === 0) {
            throw new Error(`No confirmed UTXOs found for address ${from}`);
        }
        // For segwit UTXOs we need the scriptPubKey — derive it from the sender address
        // if the provider didn't return it (Blockstream/Mempool.space don't include it in UTXO list)
        const senderScript = Buffer.from((0, utxoTx_1.addressToScriptPubKey)(from, this.networkParams)).toString('hex');
        const enrichedUtxos = utxos.map(u => ({
            ...u,
            scriptPubKey: u.scriptPubKey ?? senderScript,
        }));
        const { selected, fee, change } = (0, utxoTx_1.selectUTXOs)(enrichedUtxos, amountSat, feeRates, isSegwit, 'fast', this.minFeeRate);
        const outputs = [
            { address: to, valueSat: amountSat },
        ];
        if (change > 0n) {
            outputs.push({ address: from, valueSat: change });
        }
        const raw = (0, utxoTx_1.buildUnsignedTx)(selected.map(u => ({ utxo: u })), outputs, isSegwit, this.networkParams, 2, 0, this.useForkId);
        const feeSat = Number(fee);
        const feeDisplay = (feeSat / 1e8).toFixed(8).replace(/\.?0+$/, '');
        return {
            chainId: this.assetConfig.id,
            type: 'native',
            raw,
            estimatedFee: {
                amount: fee.toString(),
                decimals: 8,
                displayAmount: feeDisplay,
                currency: this.assetConfig.symbol,
            },
            metadata: {
                from,
                to,
                amount,
                inputCount: selected.length,
                outputCount: outputs.length,
                isSegwit,
            },
        };
    }
    // ---------------------------------------------------------------------------
    // Sign transaction (offline — no network call)
    // ---------------------------------------------------------------------------
    async signTransaction(unsignedTx, privateKey) {
        const raw = unsignedTx.raw;
        if (!raw.sighashes || !Array.isArray(raw.sighashes)) {
            throw new Error('Invalid unsigned transaction: missing sighashes');
        }
        const hashType = raw.useForkId ? 0x41 : 0x01;
        const signatures = (0, utxoTx_1.signSighashes)(raw.sighashes, privateKey, hashType);
        return {
            r: '', s: '', // Not used for UTXO chains — full signature lives in `raw`
            raw: JSON.stringify(signatures),
        };
    }
    // ---------------------------------------------------------------------------
    // Embed signature (offline — no network call)
    // ---------------------------------------------------------------------------
    async embedSignature(unsignedTx, signature) {
        const raw = unsignedTx.raw;
        if (!signature.raw)
            throw new Error('Missing signature data');
        const signatures = JSON.parse(signature.raw);
        const txHex = (0, utxoTx_1.serializeSignedTx)(raw, signatures);
        return {
            chainId: this.assetConfig.id,
            type: 'native',
            raw: txHex,
            metadata: unsignedTx.metadata,
        };
    }
    // ---------------------------------------------------------------------------
    // Broadcast
    // ---------------------------------------------------------------------------
    async broadcastTransaction(signedTx, rpcUrl, options) {
        const provider = this.getProvider({ rpcUrl, utxoRpcConfig: options?.utxoRpcConfig });
        const txHash = await provider.broadcastTx(signedTx.raw);
        return { txHash };
    }
    // ---------------------------------------------------------------------------
    // Transaction status (confirmation polling) — routed through the provider
    // fallback chain. Covers the whole Bitcoin family (BTC, LTC, DOGE, DASH, BCH).
    // Providers that don't expose status (BlockCypher, WhatsOnChain, ActorForth,
    // SoChain) are skipped by FallbackUtxoProvider, falling through to one that
    // does (Esplora, Blockchair). Reports unconfirmed rather than throwing so the
    // UI keeps polling an already-broadcast tx instead of surfacing an error.
    // ---------------------------------------------------------------------------
    async getTransactionStatus(txHash, rpcUrl) {
        const provider = this.getProvider({ rpcUrl });
        if (!provider.getTransactionStatus) {
            return { confirmed: false, error: 'No configured provider supports status lookup' };
        }
        try {
            return await provider.getTransactionStatus(txHash);
        }
        catch (e) {
            return { confirmed: false, error: e instanceof Error ? e.message : String(e) };
        }
    }
    // ---------------------------------------------------------------------------
    // Max transferable amount
    // ---------------------------------------------------------------------------
    async getMaxTransferableAmount(address, rpcUrl, currentBalance, utxoRpcConfig) {
        const provider = this.getProvider({ rpcUrl, utxoRpcConfig });
        const isSegwit = this.detectAddressType(address) === 'segwit';
        const [utxos, feeRates] = await Promise.all([
            provider.getUTXOs(address),
            provider.getFeeRates(),
        ]);
        if (utxos.length === 0) {
            const bal = currentBalance ?? '0';
            return { maxAmount: bal, displayAmount: (Number(bal) / 1e8).toFixed(8) };
        }
        const totalSat = utxos.reduce((sum, u) => sum + BigInt(u.value), 0n);
        // Sweep: 1 output (no change), all UTXOs as inputs
        const fee = BigInt((0, utxoTx_1.estimateFee)(utxos.length, 1, isSegwit, Math.max(feeRates.fast, this.minFeeRate)));
        const maxAmount = totalSat > fee ? totalSat - fee : 0n;
        const displayAmount = (Number(maxAmount) / 1e8).toFixed(8).replace(/\.?0+$/, '');
        return { maxAmount: maxAmount.toString(), displayAmount };
    }
}
exports.BitcoinAdapter = BitcoinAdapter;
