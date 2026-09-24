"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAIN_CONFIG = exports.BitcoinAdapter = void 0;
var adapter_1 = require("./adapter");
Object.defineProperty(exports, "BitcoinAdapter", { enumerable: true, get: function () { return adapter_1.BitcoinAdapter; } });
exports.CHAIN_CONFIG = {
    id: 'BTC',
    name: 'Bitcoin',
    algorithm: 'ECDSA',
    coinType: 0,
};
