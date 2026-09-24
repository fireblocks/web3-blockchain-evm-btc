import { describe, it, expect, vi } from "vitest";
import { ethers } from "ethers";
import {
  BLOCKCHAIN_REGISTRY,
  getBlockchainAdapter,
  isBlockchainSupported,
} from "../registry/blockchainRegistry";

// ─── Static test keys ────────────────────────────────────────────────────────
// ECDSA: derived from all-0x01 private key, compressed 33-byte secp256k1 pubkey
const ECDSA_PRIV_KEY = "0x" + "01".repeat(32);
const ECDSA_WALLET = new ethers.Wallet(ECDSA_PRIV_KEY);
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

const MULTI_ADDR_UTXO: Record<string, string[]> = {
  BTC: ["legacy", "segwit"],
};

// ─── Mock ethers provider for offline EVM tx tests ───────────────────────────
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();

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
describe("Blockchain Registry - completeness", () => {
  it("all EVM chains are registered", () => {
    for (const id of EVM_CHAINS) {
      expect(isBlockchainSupported(id), `${id} missing from registry`).toBe(
        true,
      );
    }
  });

  it("non-standard EVM chains are registered", () => {
    for (const id of LEGACY_EVM_CHAINS) {
      expect(isBlockchainSupported(id), `${id} missing from registry`).toBe(
        true,
      );
    }
  });

  it("BTC is registered", () => {
    for (const id of Object.keys(MULTI_ADDR_UTXO)) {
      expect(isBlockchainSupported(id), `${id} missing from registry`).toBe(
        true,
      );
    }
  });

  it("registry has no unexpected undefined entries", () => {
    for (const [id, adapter] of Object.entries(BLOCKCHAIN_REGISTRY)) {
      expect(adapter, `adapter for ${id} is undefined`).toBeDefined();
      expect(adapter.assetConfig, `${id} missing assetConfig`).toBeDefined();
    }
  });
});

// ─── Address Derivation - EVM ─────────────────────────────────────────────────
describe("Address Derivation - EVM chains", () => {
  for (const id of [...EVM_CHAINS, ...LEGACY_EVM_CHAINS]) {
    describe(id, () => {
      it("generateAddress() returns a non-empty string", () => {
        const adapter = getBlockchainAdapter(id);
        expect(adapter.generateAddress).toBeDefined();
        const addr = adapter.generateAddress!(ECDSA_PUB_KEY);
        expect(typeof addr).toBe("string");
        expect(addr.length).toBeGreaterThan(0);
      });

      it("generated address starts with 0x", () => {
        const adapter = getBlockchainAdapter(id);
        const addr = adapter.generateAddress!(ECDSA_PUB_KEY);
        expect(addr.startsWith("0x")).toBe(true);
      });

      it("validateAddress() accepts its own output", () => {
        const adapter = getBlockchainAdapter(id);
        if (!adapter.validateAddress) return;
        const addr = adapter.generateAddress!(ECDSA_PUB_KEY);
        expect(adapter.validateAddress(addr)).toBe(true);
      });

      it("all EVM adapters produce the same address (shared coinType 60)", () => {
        // EVM chains sharing coinType 60 all derive from the same master key path
        // so they produce identical addresses
        const adapter = getBlockchainAdapter(id);
        const addr = adapter.generateAddress!(ECDSA_PUB_KEY);
        const ethAdapter = getBlockchainAdapter("ETH");
        const ethAddr = ethAdapter.generateAddress!(ECDSA_PUB_KEY);
        if (id === "ETC") {
          // ETC uses Fireblocks coinType 1 (not 60/61), so its derivation path
          // differs from ETH. Address format is still EVM 0x-prefixed.
          expect(addr.startsWith("0x")).toBe(true);
        } else {
          expect(addr).toBe(ethAddr);
        }
      });
    });
  }
});

describe("Address Derivation - BTC", () => {
  it("legacy address starts with 1", () => {
    const adapter = getBlockchainAdapter("BTC");
    const addr = adapter.generateAddress!(ECDSA_PUB_KEY, {
      addressType: "legacy",
    });
    expect(addr.startsWith("1")).toBe(true);
  });

  it("segwit address starts with bc1", () => {
    const adapter = getBlockchainAdapter("BTC");
    const addr = adapter.generateAddress!(ECDSA_PUB_KEY, {
      addressType: "segwit",
    });
    expect(addr.startsWith("bc1")).toBe(true);
  });

  it("validateAddress() accepts legacy address", () => {
    const adapter = getBlockchainAdapter("BTC");
    const addr = adapter.generateAddress!(ECDSA_PUB_KEY, {
      addressType: "legacy",
    });
    expect(adapter.validateAddress!(addr)).toBe(true);
  });

  it("validateAddress() accepts segwit address", () => {
    const adapter = getBlockchainAdapter("BTC");
    const addr = adapter.generateAddress!(ECDSA_PUB_KEY, {
      addressType: "segwit",
    });
    expect(adapter.validateAddress!(addr)).toBe(true);
  });

  it("legacy and segwit addresses are different", () => {
    const adapter = getBlockchainAdapter("BTC");
    const legacy = adapter.generateAddress!(ECDSA_PUB_KEY, {
      addressType: "legacy",
    });
    const segwit = adapter.generateAddress!(ECDSA_PUB_KEY, {
      addressType: "segwit",
    });
    expect(legacy).not.toBe(segwit);
  });
});

// ─── Transaction Creation - EVM (fully offline via mock provider) ─────────────
describe("Transaction Creation - EVM chains (offline)", () => {
  const TX_TEST_CHAINS = ["ETH", "AVAX", "BASE", "ETH-AETH", "ETH-OPT", "MATIC_POLYGON"];
  const TO_ADDRESS = "0x0987654321098765432109876543210987654321";
  const AMOUNT = ethers.parseEther("0.1").toString();

  for (const id of TX_TEST_CHAINS) {
    describe(id, () => {
      it("builds an unsigned transaction", async () => {
        const adapter = getBlockchainAdapter(id);
        expect(adapter.buildUnsignedTransaction).toBeDefined();

        const unsignedTx = await adapter.buildUnsignedTransaction!({
          from: ECDSA_WALLET.address,
          to: TO_ADDRESS,
          amount: AMOUNT,
          rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
        });

        expect(unsignedTx).toBeDefined();
        expect(unsignedTx.chainId).toBe(id);
        expect(unsignedTx.type).toBe("native");
        expect(unsignedTx.metadata?.from).toBe(ECDSA_WALLET.address);
        expect(unsignedTx.metadata?.to).toBe(TO_ADDRESS);
        expect(unsignedTx.estimatedFee).toBeDefined();
        expect(unsignedTx.estimatedFee?.displayAmount).toBeDefined();
      });

      it("signs the transaction", async () => {
        const adapter = getBlockchainAdapter(id);
        const unsignedTx = await adapter.buildUnsignedTransaction!({
          from: ECDSA_WALLET.address,
          to: TO_ADDRESS,
          amount: AMOUNT,
          rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
        });

        const signature = await adapter.signTransaction!(
          unsignedTx,
          ECDSA_PRIV_KEY,
        );
        expect(signature).toBeDefined();
        expect(signature.r).toBeDefined();
        expect(signature.s).toBeDefined();
        expect(signature.v).toBeDefined();
        expect(typeof signature.raw).toBe("string");
      });

      it("embeds signature and produces a valid tx hash", async () => {
        const adapter = getBlockchainAdapter(id);
        const unsignedTx = await adapter.buildUnsignedTransaction!({
          from: ECDSA_WALLET.address,
          to: TO_ADDRESS,
          amount: AMOUNT,
          rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
        });

        const signature = await adapter.signTransaction!(
          unsignedTx,
          ECDSA_PRIV_KEY,
        );
        const signedTx = await adapter.embedSignature!(unsignedTx, signature);

        expect(signedTx).toBeDefined();
        expect(signedTx.raw).toBeDefined();
        expect(signedTx.txHash).toBeDefined();
        expect(signedTx.txHash!.startsWith("0x")).toBe(true);
        expect(signedTx.txHash!.length).toBe(66); // 0x + 64 hex chars
      });

      it("each chain produces a different tx hash (different chainId)", async () => {
        const adapter = getBlockchainAdapter(id);
        const unsignedTx = await adapter.buildUnsignedTransaction!({
          from: ECDSA_WALLET.address,
          to: TO_ADDRESS,
          amount: AMOUNT,
          rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
        });

        const signature = await adapter.signTransaction!(
          unsignedTx,
          ECDSA_PRIV_KEY,
        );
        const signedTx = await adapter.embedSignature!(unsignedTx, signature);

        // ETH mainnet (evmChainId: 1) vs others must produce different hashes
        if (id !== "ETH") {
          const ethAdapter = getBlockchainAdapter("ETH");
          const ethUnsigned = await ethAdapter.buildUnsignedTransaction!({
            from: ECDSA_WALLET.address,
            to: TO_ADDRESS,
            amount: AMOUNT,
            rpcUrl: ethAdapter.assetConfig.rpcUrl || "http://localhost:8545",
          });
          const ethSig = await ethAdapter.signTransaction!(
            ethUnsigned,
            ECDSA_PRIV_KEY,
          );
          const ethSigned = await ethAdapter.embedSignature!(
            ethUnsigned,
            ethSig,
          );
          expect(signedTx.txHash).not.toBe(ethSigned.txHash);
        }
      });
    });
  }
});

// ─── Transaction Creation - ERC20 token (ETH) ────────────────────────────────
describe("Transaction Creation - ERC20 token transfer (ETH)", () => {
  it("builds, signs and embeds a USDC transfer", async () => {
    const adapter = getBlockchainAdapter("ETH");
    const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC mainnet

    const unsignedTx = await adapter.buildUnsignedTransaction!({
      from: ECDSA_WALLET.address,
      to: "0x0987654321098765432109876543210987654321",
      amount: ethers.parseUnits("100", 6).toString(),
      token: {
        contractAddress: usdcAddress,
        decimals: 6,
      },
      rpcUrl: adapter.assetConfig.rpcUrl || "http://localhost:8545",
    });

    expect(unsignedTx.type).toBe("token");
    expect(unsignedTx.metadata?.tokenAddress).toBe(usdcAddress);

    const signature = await adapter.signTransaction!(
      unsignedTx,
      ECDSA_PRIV_KEY,
    );
    const signedTx = await adapter.embedSignature!(unsignedTx, signature);

    expect(signedTx.txHash!.startsWith("0x")).toBe(true);
    expect(signedTx.type).toBe("token");
  });
});

// ─── Adapter getSupportedAddressTypes ────────────────────────────────────────
describe("getSupportedAddressTypes()", () => {
  it("BTC returns legacy and segwit types", () => {
    const adapter = getBlockchainAdapter("BTC");
    if (!adapter.getSupportedAddressTypes) return;
    const types = adapter.getSupportedAddressTypes();
    const ids = types.map((t) => t.id);
    expect(ids).toContain("legacy");
    expect(ids).toContain("segwit");
  });

  it("EVM chains return at least one address type", () => {
    for (const id of ["ETH", "AVAX", "BASE"]) {
      const adapter = getBlockchainAdapter(id);
      if (!adapter.getSupportedAddressTypes) continue;
      const types = adapter.getSupportedAddressTypes();
      expect(types.length).toBeGreaterThan(0);
    }
  });
});

// ─── Address validation - reject invalid addresses ────────────────────────────
describe("validateAddress() - rejects malformed inputs", () => {
  const INVALID_INPUTS = ["", "not-an-address", "0x123", "AAAA", "1234567890"];

  for (const id of ["ETH", "BTC"]) {
    it(`${id} rejects obviously invalid addresses`, () => {
      const adapter = getBlockchainAdapter(id);
      if (!adapter.validateAddress) return;
      for (const bad of INVALID_INPUTS) {
        expect(
          adapter.validateAddress(bad),
          `${id} should reject "${bad}"`,
        ).toBe(false);
      }
    });
  }
});
