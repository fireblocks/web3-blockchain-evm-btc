import bs58check from 'bs58check';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import type { NativeAssetConfig } from '@fireblocks-recovery/assets-evm-btc';
import type {
  BlockchainAdapter,
  AddressOptions,
  TransferParams,
  UnsignedTransaction,
  TransactionSignature,
  SignedTransaction,
  BroadcastResult,
  BalanceInfo,
} from '../../core/adapter';
import {
  createUtxoProvider,
  EsploraProvider,
  BlockchairProvider,
  BlockCypherProvider,
  WhatsOnChainProvider,
  ActorForthProvider,
  BitailsProvider,
} from '../../utils/utxoProviders';
import type { UtxoProvider } from '../../utils/utxoProviders';
import {
  selectUTXOs,
  buildUnsignedTx,
  signSighashes,
  serializeSignedTx,
  estimateFee,
  addressToScriptPubKey,
} from './utxoTx';
import type { UtxoUnsignedTxRaw, UtxoNetworkParams } from './utxoTx';

// ---------------------------------------------------------------------------
// Address generation helpers (moved to module level, shared by subclasses)
// ---------------------------------------------------------------------------

function hash160(buffer: Buffer): Buffer {
  const sha = sha256(buffer);
  const hash = ripemd160(sha);
  return Buffer.from(hash);
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
  let acc = 0, bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) { bits -= toBits; ret.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits > 0) ret.push((acc << (toBits - bits)) & maxv); }
  else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) return null;
  return ret;
}

function bech32Encode(hrp: string, data: number[]): string {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

  function polymod(values: number[]): number {
    let chk = 1;
    for (const v of values) {
      const top = chk >> 25;
      chk = (chk & 0x1ffffff) << 5 ^ v;
      for (let i = 0; i < 5; i++) { if ((top >> i) & 1) chk ^= GENERATOR[i]; }
    }
    return chk;
  }

  function hrpExpand(h: string): number[] {
    const ret: number[] = [];
    for (let i = 0; i < h.length; i++) ret.push(h.charCodeAt(i) >> 5);
    ret.push(0);
    for (let i = 0; i < h.length; i++) ret.push(h.charCodeAt(i) & 31);
    return ret;
  }

  const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod = polymod(values) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> 5 * (5 - i)) & 31);
  const combined = data.concat(checksum);
  let result = hrp + '1';
  for (const d of combined) result += CHARSET.charAt(d);
  return result;
}

// ---------------------------------------------------------------------------
// BitcoinAdapter
// ---------------------------------------------------------------------------

export class BitcoinAdapter implements BlockchainAdapter {
  readonly assetConfig: NativeAssetConfig;

  // Subclasses may override to change the bech32 HRP (e.g. 'ltc', 'tltc', 'tb')
  protected readonly bech32Hrp: string = 'bc';
  // P2PKH version byte (0x00 = BTC mainnet, 0x6f = testnet, 0x30 = LTC, etc.)
  protected readonly p2pkhVersion: number = 0x00;
  // P2SH version byte (0x05 = BTC mainnet, 0xc4 = BTC testnet, 0x32 = LTC, etc.)
  protected readonly p2shVersion: number = 0x05;
  // Whether this chain supports native SegWit (P2WPKH) destinations/addresses.
  // BTC and LTC do; DOGE, DASH, BSV, and BCH's legacy encoding do not.
  protected readonly supportsSegwit: boolean = true;
  // Minimum fee rate (sat/vByte) floor for withdrawals, so a lowball provider
  // estimate can't produce a stuck-slow sweep. Subclasses may raise it.
  protected readonly minFeeRate: number = 2;
  // BCH requires SIGHASH_ALL|SIGHASH_FORKID (0x41) with BIP143 preimage.
  // BTC, LTC, DOGE, DASH, BSV all use standard SIGHASH_ALL (0x01).
  protected readonly useForkId: boolean = false;

  constructor(assetConfig: NativeAssetConfig) {
    this.assetConfig = assetConfig;
    if (this.assetConfig.id.includes('TEST')) {
      (this as unknown as { bech32Hrp: string }).bech32Hrp = 'tb';
      (this as unknown as { p2pkhVersion: number }).p2pkhVersion = 0x6f;
      (this as unknown as { p2shVersion: number }).p2shVersion = 0xc4;
    }
  }

  // Network parameters passed to the shared UTXO address-decoding logic so it
  // can validate a destination address's version byte / bech32 HRP against
  // *this* chain, rather than silently accepting any Bitcoin-family address
  // (see addressToScriptPubKey in utxoTx.ts).
  protected get networkParams(): UtxoNetworkParams {
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
  private static providerFromUrl(url: string): UtxoProvider {
    if (url.includes('blockchair.com'))   return new BlockchairProvider(url);
    if (url.includes('blockcypher.com'))  return new BlockCypherProvider(url);
    if (url.includes('whatsonchain.com')) return new WhatsOnChainProvider(url);
    if (url.includes('actorforth.org'))   return new ActorForthProvider(url);
    if (url.includes('bitails.io'))       return new BitailsProvider(url);
    return new EsploraProvider(url); // Blockstream, Mempool.space, or any Esplora instance
  }

  protected getProvider(params: { rpcUrl: string; utxoRpcConfig?: TransferParams['utxoRpcConfig'] }): UtxoProvider {
    // 1. Caller-supplied endpoints (carry the runtime API key)
    if (params.utxoRpcConfig?.endpoints && params.utxoRpcConfig.endpoints.length > 0) {
      return createUtxoProvider(params.utxoRpcConfig.endpoints);
    }
    // 2. The asset's own configured endpoint list — gives the full fallback chain
    //    even for calls that only receive an rpcUrl (e.g. status polling).
    const configured = this.assetConfig.utxoRpcEndpoints;
    if (configured && configured.length > 0) {
      return createUtxoProvider(configured);
    }
    // 3. Last resort: infer a single provider from the URL.
    return BitcoinAdapter.providerFromUrl(params.rpcUrl);
  }

  // ---------------------------------------------------------------------------
  // Address generation
  // ---------------------------------------------------------------------------

  generateAddress(publicKey: string, options?: AddressOptions): string {
    const addressType = options?.addressType ?? 'segwit';
    const pubKeyBuffer = Buffer.from(publicKey.replace('0x', ''), 'hex');
    const pubKeyHash = hash160(pubKeyBuffer);

    if (addressType === 'legacy') {
      const payload = Buffer.concat([Buffer.from([this.p2pkhVersion]), pubKeyHash]);
      return bs58check.encode(payload);
    }

    // Native segwit (P2WPKH bech32)
    const words = convertBits(Array.from(pubKeyHash), 8, 5, true);
    if (!words) throw new Error('Failed to convert bits for bech32 encoding');
    return bech32Encode(this.bech32Hrp, [0].concat(words));
  }

  validateAddress(address: string): boolean {
    try {
      // Reuses the same checksum + network-version validation as the actual
      // transaction-building path, so "valid" here means "buildable" there.
      addressToScriptPubKey(address, this.networkParams);
      return true;
    } catch {
      return false;
    }
  }

  getSupportedAddressTypes() {
    return this.assetConfig.addressCapabilities?.addressTypes ?? [
      { id: 'legacy', name: 'Legacy (P2PKH)', description: `Base58 addresses starting with 1` },
      { id: 'segwit', name: 'Native SegWit (P2WPKH)', description: `Bech32 addresses starting with ${this.bech32Hrp}1` },
    ];
  }

  detectAddressType(address: string): string | undefined {
    const lower = address.toLowerCase();
    if (lower.startsWith(`${this.bech32Hrp}1p`)) return 'taproot';
    if (lower.startsWith(`${this.bech32Hrp}1q`) || lower.startsWith(`${this.bech32Hrp}1`)) return 'segwit';
    if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) return 'legacy';
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Balance
  // ---------------------------------------------------------------------------

  async getBalance(address: string, rpcUrl: string, utxoRpcConfig?: TransferParams['utxoRpcConfig']): Promise<BalanceInfo> {
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

  async buildUnsignedTransaction(params: TransferParams): Promise<UnsignedTransaction> {
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
    const senderScript = Buffer.from(addressToScriptPubKey(from, this.networkParams)).toString('hex');
    const enrichedUtxos = utxos.map(u => ({
      ...u,
      scriptPubKey: u.scriptPubKey ?? senderScript,
    }));

    const { selected, fee, change } = selectUTXOs(enrichedUtxos, amountSat, feeRates, isSegwit, 'fast', this.minFeeRate);

    const outputs: Array<{ address: string; valueSat: bigint }> = [
      { address: to, valueSat: amountSat },
    ];
    if (change > 0n) {
      outputs.push({ address: from, valueSat: change });
    }

    const raw = buildUnsignedTx(
      selected.map(u => ({ utxo: u })),
      outputs,
      isSegwit,
      this.networkParams,
      2,
      0,
      this.useForkId,
    );

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

  async signTransaction(
    unsignedTx: UnsignedTransaction,
    privateKey: string,
  ): Promise<TransactionSignature> {
    const raw = unsignedTx.raw as UtxoUnsignedTxRaw;
    if (!raw.sighashes || !Array.isArray(raw.sighashes)) {
      throw new Error('Invalid unsigned transaction: missing sighashes');
    }

    const hashType = raw.useForkId ? 0x41 : 0x01;
    const signatures = signSighashes(raw.sighashes, privateKey, hashType);

    return {
      r: '', s: '', // Not used for UTXO chains — full signature lives in `raw`
      raw: JSON.stringify(signatures),
    };
  }

  // ---------------------------------------------------------------------------
  // Embed signature (offline — no network call)
  // ---------------------------------------------------------------------------

  async embedSignature(
    unsignedTx: UnsignedTransaction,
    signature: TransactionSignature,
  ): Promise<SignedTransaction> {
    const raw = unsignedTx.raw as UtxoUnsignedTxRaw;
    if (!signature.raw) throw new Error('Missing signature data');

    const signatures = JSON.parse(signature.raw) as Array<{ der: string; pubKey: string }>;
    const txHex = serializeSignedTx(raw, signatures);

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

  async broadcastTransaction(
    signedTx: SignedTransaction,
    rpcUrl: string,
    options?: { timeout?: number; utxoRpcConfig?: TransferParams['utxoRpcConfig'] },
  ): Promise<BroadcastResult> {
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

  async getTransactionStatus(
    txHash: string,
    rpcUrl: string,
  ): Promise<{ confirmed: boolean; blockNumber?: number; failed?: boolean; error?: string }> {
    const provider = this.getProvider({ rpcUrl });
    if (!provider.getTransactionStatus) {
      return { confirmed: false, error: 'No configured provider supports status lookup' };
    }
    try {
      return await provider.getTransactionStatus(txHash);
    } catch (e) {
      return { confirmed: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // ---------------------------------------------------------------------------
  // Max transferable amount
  // ---------------------------------------------------------------------------

  async getMaxTransferableAmount(
    address: string,
    rpcUrl: string,
    currentBalance?: string,
    utxoRpcConfig?: TransferParams['utxoRpcConfig'],
  ): Promise<{ maxAmount: string; displayAmount: string }> {
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
    const fee = BigInt(estimateFee(utxos.length, 1, isSegwit, Math.max(feeRates.fast, this.minFeeRate)));
    const maxAmount = totalSat > fee ? totalSat - fee : 0n;
    const displayAmount = (Number(maxAmount) / 1e8).toFixed(8).replace(/\.?0+$/, '');

    return { maxAmount: maxAmount.toString(), displayAmount };
  }
}
