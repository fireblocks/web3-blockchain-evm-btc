"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BLOCKCHAIN_REGISTRY = void 0;
exports.getBlockchainAdapter = getBlockchainAdapter;
exports.getAllBlockchains = getAllBlockchains;
exports.isBlockchainSupported = isBlockchainSupported;
const ethereum_1 = require("../chains/ethereum");
const assets_evm_btc_1 = require("@fireblocks-recovery/assets-evm-btc");
const blockchainRegistry_generated_1 = require("./blockchainRegistry.generated");
exports.BLOCKCHAIN_REGISTRY = {};
// Auto-register EVM chains from assets package.
// Requires evmChainId to be set - coinType:60 alone isn't sufficient (e.g. Injective
// uses Ethereum-style key derivation but is a Cosmos chain with its own adapter).
assets_evm_btc_1.NATIVE_ASSETS.filter((asset) => asset.algorithm === "ECDSA" &&
    asset.evmChainId !== undefined &&
    (asset.coinType === 60 || asset.coinType === 1)).forEach((asset) => {
    exports.BLOCKCHAIN_REGISTRY[asset.id] = new ethereum_1.EVMAdapter(asset);
});
// Register non-EVM chains from generated registry
(0, blockchainRegistry_generated_1.registerNonEVMAdapters)(exports.BLOCKCHAIN_REGISTRY);
// Legacy adapters for non-standard EVM coinTypes
const legacySgb_1 = require("../chains/legacySgb");
const bitcoin_1 = require("../chains/bitcoin");
const sgbAsset = (0, assets_evm_btc_1.getAssetConfig)("SGB");
if (sgbAsset && sgbAsset.type === "native") {
    exports.BLOCKCHAIN_REGISTRY.SGB = new legacySgb_1.LegacySgbAdapter(sgbAsset);
}
// ETC mainnet uses the SLIP-44 standard coinType 61, so it isn't picked up by
// the coinType 60/1 auto-register filter above. It's a plain EVM chain otherwise.
// (ETC_TEST uses coinType 1 and auto-registers like other testnets.)
const etcAsset = (0, assets_evm_btc_1.getAssetConfig)("ETC");
if (etcAsset && etcAsset.type === "native") {
    exports.BLOCKCHAIN_REGISTRY.ETC = new ethereum_1.EVMAdapter(etcAsset);
}
const flareAsset = (0, assets_evm_btc_1.getAssetConfig)("FLR");
if (flareAsset && flareAsset.type === "native") {
    exports.BLOCKCHAIN_REGISTRY.FLR = new ethereum_1.EVMAdapter(flareAsset);
}
// The directory-based auto-registration above only maps ONE asset id per
// adapter file (its CHAIN_CONFIG.id, e.g. "BTC"). Testnet variants share the
// same adapter class but need their own registry entry (constructed with the
// testnet asset config so RPC URL / network detection resolve correctly).
// Without this, getBlockchainAdapter(id) throws "Unsupported blockchain" even
// though the asset shows up in the UI (its NativeAssetConfig exists).
const testnetReuseMap = [["BTC_TEST", (a) => new bitcoin_1.BitcoinAdapter(a)]];
for (const [id, build] of testnetReuseMap) {
    const asset = (0, assets_evm_btc_1.getAssetConfig)(id);
    if (asset && asset.type === "native") {
        exports.BLOCKCHAIN_REGISTRY[id] = build(asset);
    }
}
function getBlockchainAdapter(chainId) {
    const adapter = exports.BLOCKCHAIN_REGISTRY[chainId];
    if (!adapter) {
        throw new Error(`Unsupported blockchain: ${chainId}`);
    }
    return adapter;
}
function getAllBlockchains() {
    return Object.values(exports.BLOCKCHAIN_REGISTRY);
}
function isBlockchainSupported(chainId) {
    return chainId in exports.BLOCKCHAIN_REGISTRY;
}
