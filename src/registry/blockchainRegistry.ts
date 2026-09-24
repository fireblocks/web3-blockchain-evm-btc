import type { BlockchainAdapter } from "../core/adapter";
import { EVMAdapter } from "../chains/ethereum";
import {
  NATIVE_ASSETS,
  getAssetConfig,
  type NativeAssetConfig,
} from "@fireblocks-recovery/assets-evm-btc";
import { registerNonEVMAdapters } from "./blockchainRegistry.generated";

export const BLOCKCHAIN_REGISTRY: Record<string, BlockchainAdapter> = {};

// Auto-register EVM chains from assets package.
// Requires evmChainId to be set - coinType:60 alone isn't sufficient (e.g. Injective
// uses Ethereum-style key derivation but is a Cosmos chain with its own adapter).
NATIVE_ASSETS.filter(
  (asset) =>
    asset.algorithm === "ECDSA" &&
    asset.evmChainId !== undefined &&
    (asset.coinType === 60 || asset.coinType === 1),
).forEach((asset) => {
  BLOCKCHAIN_REGISTRY[asset.id] = new EVMAdapter(asset);
});

// Register non-EVM chains from generated registry
registerNonEVMAdapters(BLOCKCHAIN_REGISTRY);

// Legacy adapters for non-standard EVM coinTypes
import { LegacySgbAdapter } from "../chains/legacySgb";
import { BitcoinAdapter } from "../chains/bitcoin";

const sgbAsset = getAssetConfig("SGB");
if (sgbAsset && sgbAsset.type === "native") {
  BLOCKCHAIN_REGISTRY.SGB = new LegacySgbAdapter(sgbAsset);
}

// ETC mainnet uses the SLIP-44 standard coinType 61, so it isn't picked up by
// the coinType 60/1 auto-register filter above. It's a plain EVM chain otherwise.
// (ETC_TEST uses coinType 1 and auto-registers like other testnets.)
const etcAsset = getAssetConfig("ETC");
if (etcAsset && etcAsset.type === "native") {
  BLOCKCHAIN_REGISTRY.ETC = new EVMAdapter(etcAsset);
}

const flareAsset = getAssetConfig("FLR");
if (flareAsset && flareAsset.type === "native") {
  BLOCKCHAIN_REGISTRY.FLR = new EVMAdapter(flareAsset);
}

// The directory-based auto-registration above only maps ONE asset id per
// adapter file (its CHAIN_CONFIG.id, e.g. "BTC"). Testnet variants share the
// same adapter class but need their own registry entry (constructed with the
// testnet asset config so RPC URL / network detection resolve correctly).
// Without this, getBlockchainAdapter(id) throws "Unsupported blockchain" even
// though the asset shows up in the UI (its NativeAssetConfig exists).
const testnetReuseMap: Array<
  [string, (asset: NativeAssetConfig) => BlockchainAdapter]
> = [["BTC_TEST", (a) => new BitcoinAdapter(a)]];

for (const [id, build] of testnetReuseMap) {
  const asset = getAssetConfig(id);
  if (asset && asset.type === "native") {
    BLOCKCHAIN_REGISTRY[id] = build(asset);
  }
}

export function getBlockchainAdapter(chainId: string): BlockchainAdapter {
  const adapter = BLOCKCHAIN_REGISTRY[chainId];
  if (!adapter) {
    throw new Error(`Unsupported blockchain: ${chainId}`);
  }
  return adapter;
}

export function getAllBlockchains(): BlockchainAdapter[] {
  return Object.values(BLOCKCHAIN_REGISTRY);
}

export function isBlockchainSupported(chainId: string): boolean {
  return chainId in BLOCKCHAIN_REGISTRY;
}
