import type { NativeAssetConfig } from '@fireblocks-recovery/assets-evm-btc';
import { EVMAdapter } from './ethereum';
export declare class LegacySgbAdapter extends EVMAdapter {
    constructor(assetConfig: NativeAssetConfig);
}
