import type { NativeAssetConfig } from '@fireblocks-recovery/assets-evm-btc';
import { EVMAdapter } from './ethereum';

export class LegacySgbAdapter extends EVMAdapter {
  constructor(assetConfig: NativeAssetConfig) {
    // Songbird uses coinType 554 instead of the default 60, and chainId 19
    super(assetConfig);
  }
}
