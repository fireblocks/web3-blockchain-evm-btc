"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FallbackUtxoProvider = exports.SoChainProvider = exports.ActorForthProvider = exports.BitailsProvider = exports.WhatsOnChainProvider = exports.BlockCypherProvider = exports.BlockchairProvider = exports.EsploraProvider = void 0;
exports.createUtxoProvider = createUtxoProvider;
// ---------------------------------------------------------------------------
// EsploraProvider - covers Blockstream (blockstream.info/api) and
// Mempool.space (mempool.space/api). Both expose the same Esplora HTTP API.
// ---------------------------------------------------------------------------
class EsploraProvider {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async getBalance(address) {
        const res = await fetch(`${this.baseUrl}/address/${address}`);
        if (!res.ok)
            throw new Error(`Esplora getBalance failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        const confirmed = BigInt(data.chain_stats.funded_txo_sum) -
            BigInt(data.chain_stats.spent_txo_sum);
        return confirmed;
    }
    async getUTXOs(address) {
        const res = await fetch(`${this.baseUrl}/address/${address}/utxo`);
        if (!res.ok)
            throw new Error(`Esplora getUTXOs failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        // Only use confirmed UTXOs for signing safety
        return data
            .filter((u) => u.status.confirmed)
            .map((u) => ({ txid: u.txid, vout: u.vout, value: u.value }));
    }
    async getFeeRates() {
        // Esplora /fee-estimates returns { "1": sat/vbyte, "3": ..., "6": ..., ... }
        const res = await fetch(`${this.baseUrl}/fee-estimates`);
        if (!res.ok)
            throw new Error(`Esplora getFeeRates failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return {
            fast: Math.ceil(data["1"] ?? data["2"] ?? 20),
            medium: Math.ceil(data["3"] ?? data["6"] ?? 10),
            slow: Math.ceil(data["6"] ?? data["144"] ?? 5),
        };
    }
    async broadcastTx(txHex) {
        const res = await fetch(`${this.baseUrl}/tx`, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: txHex,
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Esplora broadcastTx failed: ${res.status} ${body}`);
        }
        return (await res.text()).trim();
    }
    async getBlockHeight() {
        const res = await fetch(`${this.baseUrl}/blocks/tip/height`);
        if (!res.ok)
            throw new Error(`Esplora getBlockHeight failed: ${res.status} ${res.statusText}`);
        const height = parseInt((await res.text()).trim(), 10);
        if (!Number.isFinite(height))
            throw new Error("Esplora getBlockHeight: invalid height");
        return height;
    }
    async getTransactionStatus(txHash) {
        const res = await fetch(`${this.baseUrl}/tx/${txHash}/status`);
        if (!res.ok)
            throw new Error(`Esplora getTransactionStatus failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return { confirmed: data.confirmed, blockNumber: data.block_height };
    }
}
exports.EsploraProvider = EsploraProvider;
// ---------------------------------------------------------------------------
// BlockchairProvider - supports BTC, LTC, DOGE, DASH, ZEC, BCH.
// Requires an API key for production use (free tier is heavily rate-limited).
// The key is passed at construction time, injected from secure runtime settings.
// ---------------------------------------------------------------------------
class BlockchairProvider {
    baseUrl;
    apiKey;
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }
    keyParam(sep = "?") {
        return this.apiKey ? `${sep}key=${encodeURIComponent(this.apiKey)}` : "";
    }
    async getBalance(address) {
        const url = `${this.baseUrl}/dashboards/address/${address}?limit=0,0${this.keyParam("&")}`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Blockchair getBalance failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        const info = data.data[address];
        if (!info)
            throw new Error(`Blockchair: no data for address ${address}`);
        return BigInt(info.address.balance);
    }
    async getUTXOs(address) {
        const url = `${this.baseUrl}/dashboards/address/${address}?limit=0,10000${this.keyParam("&")}`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Blockchair getUTXOs failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        const info = data.data[address];
        if (!info)
            throw new Error(`Blockchair: no UTXO data for address ${address}`);
        return info.utxo.map((u) => ({
            txid: u.transaction_hash,
            vout: u.index,
            value: u.value,
            scriptPubKey: u.script_hex,
        }));
    }
    async getFeeRates() {
        const url = `${this.baseUrl}/stats${this.keyParam()}`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Blockchair getFeeRates failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        const fee = data.data.suggested_transaction_fee_per_byte_sat ?? 10;
        return {
            fast: fee * 2,
            medium: fee,
            slow: Math.max(1, Math.floor(fee / 2)),
        };
    }
    async broadcastTx(txHex) {
        const url = `${this.baseUrl}/push/transaction${this.keyParam()}`;
        const body = new URLSearchParams({ data: txHex });
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Blockchair broadcastTx failed: ${res.status} ${text}`);
        }
        const result = (await res.json());
        return result.data.transaction_hash;
    }
    async getBlockHeight() {
        const url = `${this.baseUrl}/stats${this.keyParam()}`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Blockchair getBlockHeight failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        const height = data.data?.blocks;
        if (typeof height !== "number" || height <= 0)
            throw new Error("Blockchair getBlockHeight: invalid height");
        return height;
    }
    async getTransactionStatus(txHash) {
        const url = `${this.baseUrl}/dashboards/transaction/${txHash}${this.keyParam()}`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Blockchair getTransactionStatus failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        const tx = data.data?.[txHash]?.transaction;
        if (!tx)
            throw new Error(`Blockchair: no data for transaction ${txHash}`);
        // block_id === -1 while a tx is still in the mempool.
        const blockId = tx.block_id;
        if (typeof blockId === "number" && blockId > 0) {
            return { confirmed: true, blockNumber: blockId };
        }
        return { confirmed: false };
    }
}
exports.BlockchairProvider = BlockchairProvider;
// ---------------------------------------------------------------------------
// BlockCypherProvider - free tier (no key needed), covers LTC and DOGE.
// Base URL examples: https://api.blockcypher.com/v1/ltc/main
//                    https://api.blockcypher.com/v1/doge/main
// ---------------------------------------------------------------------------
class BlockCypherProvider {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async getBalance(address) {
        const res = await fetch(`${this.baseUrl}/addrs/${address}/balance`);
        if (!res.ok)
            throw new Error(`BlockCypher getBalance failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return BigInt(data.balance);
    }
    async getUTXOs(address) {
        const res = await fetch(`${this.baseUrl}/addrs/${address}?unspentOnly=true&includeScript=true`);
        if (!res.ok)
            throw new Error(`BlockCypher getUTXOs failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return (data.txrefs ?? []).map((u) => ({
            txid: u.tx_hash,
            vout: u.tx_output_n,
            value: u.value,
            scriptPubKey: u.script,
        }));
    }
    async getFeeRates() {
        const res = await fetch(this.baseUrl);
        if (!res.ok)
            throw new Error(`BlockCypher getFeeRates failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        const toSatVbyte = (feePerKb) => Math.max(1, Math.ceil(feePerKb / 1000));
        return {
            fast: toSatVbyte(data.high_fee_per_kb ?? 20000),
            medium: toSatVbyte(data.medium_fee_per_kb ?? 10000),
            slow: toSatVbyte(data.low_fee_per_kb ?? 5000),
        };
    }
    async broadcastTx(txHex) {
        const res = await fetch(`${this.baseUrl}/txs/push`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tx: txHex }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`BlockCypher broadcastTx failed: ${res.status} ${text}`);
        }
        const data = (await res.json());
        return data.tx.hash;
    }
}
exports.BlockCypherProvider = BlockCypherProvider;
// ---------------------------------------------------------------------------
// WhatsOnChainProvider - BSV mainnet. Free, no key needed.
// Base URL: https://api.whatsonchain.com/v1/bsv/main
// ---------------------------------------------------------------------------
class WhatsOnChainProvider {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async getBalance(address) {
        // Correct endpoint: returns { confirmed: N, unconfirmed: N }
        const res = await fetch(`${this.baseUrl}/address/${address}/balance`);
        if (!res.ok)
            throw new Error(`WhatsOnChain getBalance failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return BigInt(data.confirmed ?? 0);
    }
    async getUTXOs(address) {
        const res = await fetch(`${this.baseUrl}/address/${address}/unspent`);
        if (!res.ok)
            throw new Error(`WhatsOnChain getUTXOs failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return data.map((u) => ({
            txid: u.tx_hash,
            vout: u.tx_pos,
            value: u.value,
        }));
    }
    async getFeeRates() {
        // WhatsOnChain doesn't expose a fee endpoint; use sensible BSV defaults (BSV fees are very low)
        return { fast: 1, medium: 1, slow: 1 };
    }
    async broadcastTx(txHex) {
        const res = await fetch(`${this.baseUrl}/tx/raw`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txhex: txHex }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`WhatsOnChain broadcastTx failed: ${res.status} ${text}`);
        }
        const txHash = (await res.json());
        // A 2xx response with no usable txid must not be mistaken for success -
        // callers (and the UI's status poller) treat a resolved promise as "broadcast".
        if (typeof txHash !== "string" || txHash.length === 0) {
            throw new Error(`WhatsOnChain broadcastTx: unexpected response shape: ${JSON.stringify(txHash)}`);
        }
        return txHash;
    }
}
exports.WhatsOnChainProvider = WhatsOnChainProvider;
// ---------------------------------------------------------------------------
// BitailsProvider - BSV. Free REST API, fallback for WhatsOnChain rate limits.
// Base URL: https://api.bitails.io
// Note: runs in pruned mode - very old UTXOs may be missing from /unspent.
// ---------------------------------------------------------------------------
class BitailsProvider {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async getBalance(address) {
        const res = await fetch(`${this.baseUrl}/address/${address}/balance`);
        if (!res.ok)
            throw new Error(`Bitails getBalance failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return BigInt(data.confirmed ?? 0);
    }
    async getUTXOs(address) {
        const res = await fetch(`${this.baseUrl}/address/${address}/unspent`);
        if (!res.ok)
            throw new Error(`Bitails getUTXOs failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return (data.unspent ?? []).map((u) => ({
            txid: u.txid,
            vout: u.vout,
            value: u.satoshis,
        }));
    }
    async getFeeRates() {
        // No fee endpoint; BSV fees are effectively fixed and very low
        return { fast: 1, medium: 1, slow: 1 };
    }
    async broadcastTx(txHex) {
        const res = await fetch(`${this.baseUrl}/tx/broadcast`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw: txHex }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Bitails broadcastTx failed: ${res.status} ${text}`);
        }
        const data = (await res.json());
        // Undocumented API - accept whichever id field the response actually uses
        // rather than silently resolving with undefined on a shape mismatch.
        const txid = data.txid ?? data.txId ?? data.hash ?? data.id;
        if (typeof txid !== "string" || txid.length === 0) {
            throw new Error(`Bitails broadcastTx: unexpected response shape: ${JSON.stringify(data)}`);
        }
        return txid;
    }
}
exports.BitailsProvider = BitailsProvider;
// ---------------------------------------------------------------------------
// ActorForthProvider - BCH. Free REST API.
// Base URL: https://rest.bch.actorforth.org/v2
// ---------------------------------------------------------------------------
class ActorForthProvider {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
    async getBalance(address) {
        const res = await fetch(`${this.baseUrl}/address/details/${address}`);
        if (!res.ok)
            throw new Error(`ActorForth getBalance failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return BigInt(data.balanceSat);
    }
    async getUTXOs(address) {
        const res = await fetch(`${this.baseUrl}/address/utxo/${address}`);
        if (!res.ok)
            throw new Error(`ActorForth getUTXOs failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        return data.map((u) => ({
            txid: u.txid,
            vout: u.vout,
            value: u.satoshis,
            scriptPubKey: u.scriptPubKey,
        }));
    }
    async getFeeRates() {
        // ActorForth doesn't expose fee estimates; BCH fees are generally very low
        return { fast: 2, medium: 1, slow: 1 };
    }
    async broadcastTx(txHex) {
        const res = await fetch(`${this.baseUrl}/rawtransactions/sendRawTransaction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hexstring: txHex }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`ActorForth broadcastTx failed: ${res.status} ${text}`);
        }
        const txHash = (await res.json());
        return txHash;
    }
}
exports.ActorForthProvider = ActorForthProvider;
// ---------------------------------------------------------------------------
// SoChainProvider - free, no API key. Supports LTC, DOGE, DASH, ZEC, BCH.
// URL convention: https://sochain.com/api/v2/{NETWORK}  (network appended to base)
// e.g. https://sochain.com/api/v2/LTC  or  https://sochain.com/api/v2/DASH
// SoChain returns amounts in coin units (not satoshis); we convert with * 1e8.
// ---------------------------------------------------------------------------
class SoChainProvider {
    network;
    soBase = "https://sochain.com/api/v2";
    constructor(baseUrl) {
        // Extract network code from trailing path segment: ".../LTC" → "LTC"
        this.network = baseUrl.split("/").pop()?.toUpperCase() ?? "";
        if (!this.network)
            throw new Error("SoChainProvider: network code missing from URL");
    }
    toSatoshis(value) {
        return Math.round(parseFloat(String(value)) * 1e8);
    }
    async getBalance(address) {
        const res = await fetch(`${this.soBase}/address/${this.network}/${address}`);
        if (!res.ok)
            throw new Error(`SoChain getBalance failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        if (data.status !== "success")
            throw new Error(`SoChain getBalance: unexpected status ${data.status}`);
        return BigInt(this.toSatoshis(data.data.balance));
    }
    async getUTXOs(address) {
        const res = await fetch(`${this.soBase}/get_utxos/${this.network}/${address}`);
        if (!res.ok)
            throw new Error(`SoChain getUTXOs failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        if (data.status !== "success")
            throw new Error(`SoChain getUTXOs: unexpected status ${data.status}`);
        return (data.data.txs ?? [])
            .filter((u) => u.confirmations > 0)
            .map((u) => ({
            txid: u.txid,
            vout: u.output_no,
            value: this.toSatoshis(u.value),
            scriptPubKey: u.script_hex || undefined,
        }));
    }
    async getFeeRates() {
        // SoChain returns a total fee for a given tx_size; convert to sat/vbyte.
        const txSize = 250;
        const res = await fetch(`${this.soBase}/estimate_tx_fee/${this.network}?tx_size=${txSize}`);
        if (!res.ok)
            throw new Error(`SoChain getFeeRates failed: ${res.status} ${res.statusText}`);
        const data = (await res.json());
        if (data.status !== "success")
            throw new Error(`SoChain getFeeRates: unexpected status ${data.status}`);
        const satPerVbyte = Math.max(1, Math.ceil(this.toSatoshis(data.data.fee) / txSize));
        return {
            fast: satPerVbyte * 2,
            medium: satPerVbyte,
            slow: Math.max(1, Math.floor(satPerVbyte / 2)),
        };
    }
    async broadcastTx(txHex) {
        const res = await fetch(`${this.soBase}/send_transaction/${this.network}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tx_hex: txHex }),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`SoChain broadcastTx failed: ${res.status} ${text}`);
        }
        const result = (await res.json());
        return result.data.txid;
    }
}
exports.SoChainProvider = SoChainProvider;
// ---------------------------------------------------------------------------
// FallbackUtxoProvider - tries providers in order; moves to the next on error.
// This is the resilience core: if Blockstream is down, Mempool.space is tried,
// then Blockchair (if an API key is configured), etc.
// ---------------------------------------------------------------------------
class FallbackUtxoProvider {
    providers;
    constructor(providers) {
        this.providers = providers;
        if (providers.length === 0)
            throw new Error("FallbackUtxoProvider requires at least one provider");
    }
    async tryAll(fn) {
        const errors = [];
        for (const provider of this.providers) {
            try {
                return await fn(provider);
            }
            catch (e) {
                errors.push(e instanceof Error ? e.message : String(e));
            }
        }
        throw new Error(`All UTXO providers failed:\n${errors.join("\n")}`);
    }
    getBalance(address) {
        return this.tryAll((p) => p.getBalance(address));
    }
    getUTXOs(address) {
        return this.tryAll((p) => p.getUTXOs(address));
    }
    getFeeRates() {
        return this.tryAll((p) => p.getFeeRates());
    }
    broadcastTx(txHex) {
        return this.tryAll((p) => p.broadcastTx(txHex));
    }
    getBlockHeight() {
        return this.tryAll((p) => {
            if (!p.getBlockHeight)
                throw new Error(`${p.constructor.name} does not support getBlockHeight`);
            return p.getBlockHeight();
        });
    }
    getTransactionStatus(txHash) {
        return this.tryAll((p) => {
            if (!p.getTransactionStatus)
                throw new Error(`${p.constructor.name} does not support getTransactionStatus`);
            return p.getTransactionStatus(txHash);
        });
    }
}
exports.FallbackUtxoProvider = FallbackUtxoProvider;
// ---------------------------------------------------------------------------
// createUtxoProvider - factory that builds the right provider from config.
// A single endpoint gets a direct provider; multiple get FallbackUtxoProvider.
// ---------------------------------------------------------------------------
function createUtxoProvider(endpoints) {
    if (endpoints.length === 0)
        throw new Error("createUtxoProvider: no endpoints provided");
    const providers = endpoints.map((e) => {
        switch (e.providerType) {
            case "esplora":
            case "mempool":
                return new EsploraProvider(e.url);
            case "blockchair":
                return new BlockchairProvider(e.url, e.apiKey);
            case "blockcypher":
                return new BlockCypherProvider(e.url);
            case "whatsonchain":
                return new WhatsOnChainProvider(e.url);
            case "actorforth":
                return new ActorForthProvider(e.url);
            case "sochain":
                return new SoChainProvider(e.url);
            case "bitails":
                return new BitailsProvider(e.url);
            default:
                throw new Error(`createUtxoProvider: unknown providerType "${e.providerType}"`);
        }
    });
    return providers.length === 1
        ? providers[0]
        : new FallbackUtxoProvider(providers);
}
