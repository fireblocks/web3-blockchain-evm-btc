# @fireblocks-recovery/blockchain-evm-btc

**EVM + Bitcoin-only subset** of
Covers all EVM chains (auto-registered, mainnet + testnet, including legacy non-standard-coinType chains
SGB/ETC/FLR) plus BTC/BTC_TEST. 

```ts
import { getBlockchainAdapter } from '@fireblocks-recovery/blockchain-evm-btc';

const adapter = getBlockchainAdapter('ETH');
const address = adapter.generateAddress(publicKey);
```

Each adapter implements a 4-phase transaction flow: `buildUnsignedTransaction` →
`signTransaction` → `embedSignature` → `broadcastTransaction`, plus `getBalance`.

## Installation

This package has no registry entry - install directly from GitHub (once pushed) or reference it
as a local `file:` dependency:

```bash
pnpm add github:fireblocks/web3-blockchain-evm-btc
# or: npm install github:fireblocks/web3-blockchain-evm-btc
# or: yarn add github:fireblocks/web3-blockchain-evm-btc
```

This pulls in `@fireblocks-recovery/assets-evm-btc` automatically as a regular git dependency.
The compiled `dist/` output is committed to both repos, so there's no build step on install -
works identically with npm, yarn, and pnpm.

Pin to a specific commit (`#<sha>`) instead of `main` if you want a stable, reproducible
install for a real application - and note that `assets-evm-btc` is pulled at whatever commit
*its* `main` branch is at when you install, since plain git dependencies don't support pinning
a transitive dependency's version independently.

## Local development

```bash
pnpm install
pnpm run build
pnpm run type-check
pnpm run test
```

For local development, this package's `dependencies` already point at
`file:../assets-evm-btc` (sibling directory) rather than a git URL, since neither subset package
has been pushed anywhere yet. Switch to a `github:` dependency once/if this is published.

## Contributing

**Whenever you change `src/`, rebuild and commit the updated `dist/` output** (`pnpm run
build`) as part of the same change - `dist/` is committed and is what consumers actually
install, so a PR that only changes `src/` won't take effect for anyone installing via git.
There's no CI pipeline wired up yet, so running `build`/`type-check`/`test` locally before
opening a PR is currently the only verification gate.

- **New chain adapter**: `src/chains/<chain>/adapter.ts` implementing `BlockchainAdapter`,
  exported from `src/chains/index.ts`.
- **New token standard**: `src/chains/<chain>/tokenStandards/<standard>.ts`.
- EVM chains auto-register via `EVMAdapter` - no manual registration needed, just an `assets`
  config entry.
- Like `assets`, the registry files under `src/registry/*.generated.ts` are auto-generated -
  don't hand-edit them.
- Add tests for new adapters in `src/test/allBlockchains.test.ts`.
