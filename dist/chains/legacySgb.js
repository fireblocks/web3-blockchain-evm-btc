"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacySgbAdapter = void 0;
const ethereum_1 = require("./ethereum");
class LegacySgbAdapter extends ethereum_1.EVMAdapter {
    constructor(assetConfig) {
        // Songbird uses coinType 554 instead of the default 60, and chainId 19
        super(assetConfig);
    }
}
exports.LegacySgbAdapter = LegacySgbAdapter;
