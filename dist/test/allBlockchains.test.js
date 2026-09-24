"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const ethers_1 = require("ethers");
const blockchainRegistry_1 = require("../registry/blockchainRegistry");
// ─── Static test keys ────────────────────────────────────────────────────────
// ECDSA: derived from all-0x01 private key, compressed 33-byte secp256k1 pubkey
const ECDSA_PRIV_KEY = "0x" + "01".repeat(32);
const ECDSA_WALLET = new ethers_1.ethers.Wallet(ECDSA_PRIV_KEY);
const ECDSA_PUB_KEY = ECDSA_WALLET.signingKey.compressedPublicKey; // 0x02... or 0x03...
// ─── Chain groupings ──────────────────────────────────────────────────────────
const EVM_CHAINS = [
    "ETH",
    "AVAX",
    "BASE",
    "BNB",
    "MATIC_POLYGON",
    "ETH-AETH",
    "ETH-OPT",
    "FLR",
    "FTM_FANTOM",
    "CELO",
    "CELO_ALFAJORES",
    "CORE_COREDAO",
    "ETHW",
    "EVMOS",
    "GLMR_GLMR",
    "MOVR_MOVR",
    "RON",
    "RBTC",
    "SMARTBCH",
    "VLX_VLX",
    "XDC",
    "CHZ_$CHZ",
    "AURORA_DEV",
    "AVAXTEST",
    "BASECHAIN_ETH_TEST5",
    "ETH-AETH_SEPOLIA",
    "ETH-OPT-SEPOLIA",
    "POLYGON_TEST_MUMBAI",
    "AMOY_POLYGON_TEST",
    "RBTC_TEST",
    "CORE_COREDAO_TEST",
];
const LEGACY_EVM_CHAINS = ["SGB", "ETC"];
const MULTI_ADDR_UTXO = {
    BTC: ["legacy", "segwit"],
};
// ─── Mock ethers provider for offline EVM tx tests ───────────────────────────
vitest_1.vi.mock("ethers", async (importOriginal) => {
    const actual = await importOriginal();
    class MockProvider {
        async getTransactionCount() {
            return 5;
        }
        async estimateGas() {
            return 21000n;
        }
        async getFeeData() {
            return {
                maxFeePerGas: actual.ethers.parseUnits("50", "gwei"),
                maxPriorityFeePerGas: actual.ethers.parseUnits("2", "gwei"),
                gasPrice: null,
            };
        }
        async getBalance() {
            return actual.ethers.parseEther("1");
        }
        async broadcastTransaction() {
            return { hash: "0x" + "ab".repeat(32) };
        }
    }
    return {
        ...actual,
        ethers: {
            ...actual.ethers,
            JsonRpcProvider: MockProvider,
        },
    };
});
// ─── Registry Integrity ───────────────────────────────────────────────────────
(0, vitest_1.describe)("Blockchain Registry - completeness", () => {
    (0, vitest_1.it)("all EVM chains are registered", () => {
        for (const id of EVM_CHAINS) {
            (0, vitest_1.expect)((0, blockchainRegistry_1.isBlockchainSupported)(id), `${id} missing from registry`).toBe(true);
        }
    });
    (0, vitest_1.it)("non-standard EVM chains are registered", () => {
        for (const id of LEGACY_EVM_CHAINS) {
            (0, vitest_1.expect)((0, blockchainRegistry_1.isBlockchainSupported)(id), `${id} missing from registry`).toBe(true);
        }
    });
    (0, vitest_1.it)("BTC is registered", () => {
        for (const id of Object.keys(MULTI_ADDR_UTXO)) {
            (0, vitest_1.expect)((0, blockchainRegistry_1.isBlockchainSupported)(id), `${id} missing from registry`).toBe(true);
        }
    });
    (0, vitest_1.it)("registry has no unexpected undefined entries", () => {
        for (const [id, adapter] of Object.entries(blockchainRegistry_1.BLOCKCHAIN_REGISTRY)) {
            (0, vitest_1.expect)(adapter, `adapter for ${id} is undefined`).toBeDefined();
            (0, vitest_1.expect)(adapter.assetConfig, `${id} missing assetConfig`).toBeDefined();
        }
    });
});
// ─── Address Derivation - EVM ─────────────────────────────────────────────────
(0, vitest_1.describe)("Address Derivation - EVM chains", () => {
    for (const id of [...EVM_CHAINS, ...LEGACY_EVM_CHAINS]) {
        (0, vitest_1.describe)(id, () => {
            (0, vitest_1.it)("generateAddress() returns a non-empty string", () => {
                const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
                (0, vitest_1.expect)(adapter.generateAddress).toBeDefined();
                const addr = adapter.generateAddress(ECDSA_PUB_KEY);
                (0, vitest_1.expect)(typeof addr).toBe("string");
                (0, vitest_1.expect)(addr.length).toBeGreaterThan(0);
            });
            (0, vitest_1.it)("generated address starts with 0x", () => {
                const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
                const addr = adapter.generateAddress(ECDSA_PUB_KEY);
                (0, vitest_1.expect)(addr.startsWith("0x")).toBe(true);
            });
            (0, vitest_1.it)("validateAddress() accepts its own output", () => {
                const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
                if (!adapter.validateAddress)
                    return;
                const addr = adapter.generateAddress(ECDSA_PUB_KEY);
                (0, vitest_1.expect)(adapter.validateAddress(addr)).toBe(true);
            });
            (0, vitest_1.it)("all EVM adapters produce the same address (shared coinType 60)", () => {
                // EVM chains sharing coinType 60 all derive from the same master key path
                // so they produce identical addresses
                const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
                const addr = adapter.generateAddress(ECDSA_PUB_KEY);
                const ethAdapter = (0, blockchainRegistry_1.getBlockchainAdapter)("ETH");
                const ethAddr = ethAdapter.generateAddress(ECDSA_PUB_KEY);
                if (id === "ETC") {
                    // ETC uses Fireblocks coinType 1 (not 60/61), so its derivation path
                    // differs from ETH. Address format is still EVM 0x-prefixed.
                    (0, vitest_1.expect)(addr.startsWith("0x")).toBe(true);
                }
                else {
                    (0, vitest_1.expect)(addr).toBe(ethAddr);
                }
            });
        });
    }
});
(0, vitest_1.describe)("Address Derivation - BTC", () => {
    (0, vitest_1.it)("legacy address starts with 1", () => {
        const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)("BTC");
        const addr = adapter.generateAddress(ECDSA_PUB_KEY, {
            addressType: "legacy",
        });
        (0, vitest_1.expect)(addr.startsWith("1")).toBe(true);
    });
    (0, vitest_1.it)("segwit address starts with bc1", () => {
        const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)("BTC");
        const addr = adapter.generateAddress(ECDSA_PUB_KEY, {
            addressType: "segwit",
        });
        (0, vitest_1.expect)(addr.startsWith("bc1")).toBe(true);
    });
    (0, vitest_1.it)("validateAddress() accepts legacy address", () => {
        const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)("BTC");
        const addr = adapter.generateAddress(ECDSA_PUB_KEY, {
            addressType: "legacy",
        });
        (0, vitest_1.expect)(adapter.validateAddress(addr)).toBe(true);
    });
    (0, vitest_1.it)("validateAddress() accepts segwit address", () => {
        const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)("BTC");
        const addr = adapter.generateAddress(ECDSA_PUB_KEY, {
            addressType: "segwit",
        });
        (0, vitest_1.expect)(adapter.validateAddress(addr)).toBe(true);
    });
    (0, vitest_1.it)("legacy and segwit addresses are different", () => {
        const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)("BTC");
        const legacy = adapter.generateAddress(ECDSA_PUB_KEY, {
            addressType: "legacy",
        });
        const segwit = adapter.generateAddress(ECDSA_PUB_KEY, {
            addressType: "segwit",
        });
        (0, vitest_1.expect)(legacy).not.toBe(segwit);
    });
});
// ─── Transaction Creation - EVM (fully offline via mock provider) ─────────────
(0, vitest_1.describe)("Transaction Creation - EVM chains (offline)", () => {
    const TX_TEST_CHAINS = ["ETH", "AVAX", "BASE", "ETH-AETH", "ETH-OPT", "MATIC_POLYGON"];
    const TO_ADDRESS = "0x0987654321098765432109876543210987654321";
    const AMOUNT = ethers_1.ethers.parseEther("0.1").toString();
    for (const id of TX_TEST_CHAINS) {
        (0, vitest_1.describe)(id, () => {
            (0, vitest_1.it)("builds an unsigned transaction", async () => {
                const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
                (0, vitest_1.expect)(adapter.buildUnsignedTransaction).toBeDefined();
                const unsignedTx = await adapter.buildUnsignedTransaction({
                    from: ECDSA_WALLET.address,
                    to: TO_ADDRESS,
                    amount: AMOUNT,
                    rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
                });
                (0, vitest_1.expect)(unsignedTx).toBeDefined();
                (0, vitest_1.expect)(unsignedTx.chainId).toBe(id);
                (0, vitest_1.expect)(unsignedTx.type).toBe("native");
                (0, vitest_1.expect)(unsignedTx.metadata?.from).toBe(ECDSA_WALLET.address);
                (0, vitest_1.expect)(unsignedTx.metadata?.to).toBe(TO_ADDRESS);
                (0, vitest_1.expect)(unsignedTx.estimatedFee).toBeDefined();
                (0, vitest_1.expect)(unsignedTx.estimatedFee?.displayAmount).toBeDefined();
            });
            (0, vitest_1.it)("signs the transaction", async () => {
                const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
                const unsignedTx = await adapter.buildUnsignedTransaction({
                    from: ECDSA_WALLET.address,
                    to: TO_ADDRESS,
                    amount: AMOUNT,
                    rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
                });
                const signature = await adapter.signTransaction(unsignedTx, ECDSA_PRIV_KEY);
                (0, vitest_1.expect)(signature).toBeDefined();
                (0, vitest_1.expect)(signature.r).toBeDefined();
                (0, vitest_1.expect)(signature.s).toBeDefined();
                (0, vitest_1.expect)(signature.v).toBeDefined();
                (0, vitest_1.expect)(typeof signature.raw).toBe("string");
            });
            (0, vitest_1.it)("embeds signature and produces a valid tx hash", async () => {
                const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
                const unsignedTx = await adapter.buildUnsignedTransaction({
                    from: ECDSA_WALLET.address,
                    to: TO_ADDRESS,
                    amount: AMOUNT,
                    rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
                });
                const signature = await adapter.signTransaction(unsignedTx, ECDSA_PRIV_KEY);
                const signedTx = await adapter.embedSignature(unsignedTx, signature);
                (0, vitest_1.expect)(signedTx).toBeDefined();
                (0, vitest_1.expect)(signedTx.raw).toBeDefined();
                (0, vitest_1.expect)(signedTx.txHash).toBeDefined();
                (0, vitest_1.expect)(signedTx.txHash.startsWith("0x")).toBe(true);
                (0, vitest_1.expect)(signedTx.txHash.length).toBe(66); // 0x + 64 hex chars
            });
            (0, vitest_1.it)("each chain produces a different tx hash (different chainId)", async () => {
                const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
                const unsignedTx = await adapter.buildUnsignedTransaction({
                    from: ECDSA_WALLET.address,
                    to: TO_ADDRESS,
                    amount: AMOUNT,
                    rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
                });
                const signature = await adapter.signTransaction(unsignedTx, ECDSA_PRIV_KEY);
                const signedTx = await adapter.embedSignature(unsignedTx, signature);
                // ETH mainnet (evmChainId: 1) vs others must produce different hashes
                if (id !== "ETH") {
                    const ethAdapter = (0, blockchainRegistry_1.getBlockchainAdapter)("ETH");
                    const ethUnsigned = await ethAdapter.buildUnsignedTransaction({
                        from: ECDSA_WALLET.address,
                        to: TO_ADDRESS,
                        amount: AMOUNT,
                        rpcUrl: ethAdapter.assetConfig.rpcUrl || "http://localhost:8545",
                    });
                    const ethSig = await ethAdapter.signTransaction(ethUnsigned, ECDSA_PRIV_KEY);
                    const ethSigned = await ethAdapter.embedSignature(ethUnsigned, ethSig);
                    (0, vitest_1.expect)(signedTx.txHash).not.toBe(ethSigned.txHash);
                }
            });
        });
    }
});
// ─── Transaction Creation - ERC20 token (ETH) ────────────────────────────────
(0, vitest_1.describe)("Transaction Creation - ERC20 token transfer (ETH)", () => {
    (0, vitest_1.it)("builds, signs and embeds a USDC transfer", async () => {
        const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)("ETH");
        const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC mainnet
        const unsignedTx = await adapter.buildUnsignedTransaction({
            from: ECDSA_WALLET.address,
            to: "0x0987654321098765432109876543210987654321",
            amount: ethers_1.ethers.parseUnits("100", 6).toString(),
            token: {
                contractAddress: usdcAddress,
                decimals: 6,
            },
            rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
        });
        (0, vitest_1.expect)(unsignedTx.type).toBe("token");
        (0, vitest_1.expect)(unsignedTx.metadata?.tokenAddress).toBe(usdcAddress);
        const signature = await adapter.signTransaction(unsignedTx, ECDSA_PRIV_KEY);
        const signedTx = await adapter.embedSignature(unsignedTx, signature);
        (0, vitest_1.expect)(signedTx.txHash.startsWith("0x")).toBe(true);
        (0, vitest_1.expect)(signedTx.type).toBe("token");
    });
});
// ─── Adapter getSupportedAddressTypes ────────────────────────────────────────
(0, vitest_1.describe)("getSupportedAddressTypes()", () => {
    (0, vitest_1.it)("BTC returns legacy and segwit types", () => {
        const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)("BTC");
        if (!adapter.getSupportedAddressTypes)
            return;
        const types = adapter.getSupportedAddressTypes();
        const ids = types.map((t) => t.id);
        (0, vitest_1.expect)(ids).toContain("legacy");
        (0, vitest_1.expect)(ids).toContain("segwit");
    });
    (0, vitest_1.it)("EVM chains return at least one address type", () => {
        for (const id of ["ETH", "AVAX", "BASE"]) {
            const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
            if (!adapter.getSupportedAddressTypes)
                continue;
            const types = adapter.getSupportedAddressTypes();
            (0, vitest_1.expect)(types.length).toBeGreaterThan(0);
        }
    });
});
// ─── Address validation - reject invalid addresses ────────────────────────────
(0, vitest_1.describe)("validateAddress() - rejects malformed inputs", () => {
    const INVALID_INPUTS = ["", "not-an-address", "0x123", "AAAA", "1234567890"];
    for (const id of ["ETH", "BTC"]) {
        (0, vitest_1.it)(`${id} rejects obviously invalid addresses`, () => {
            const adapter = (0, blockchainRegistry_1.getBlockchainAdapter)(id);
            if (!adapter.validateAddress)
                return;
            for (const bad of INVALID_INPUTS) {
                (0, vitest_1.expect)(adapter.validateAddress(bad), `${id} should reject "${bad}"`).toBe(false);
            }
        });
    }
});
