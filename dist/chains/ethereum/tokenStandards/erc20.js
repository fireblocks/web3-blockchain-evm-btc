"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERC20Standard = void 0;
const ethers_1 = require("ethers");
class ERC20Standard {
    id = 'ERC20';
    name = 'ERC-20';
    blockchainId = 'ETH';
    usesSameAddress = true;
    generateTokenAddress(baseAddress, _tokenMetadata) {
        return {
            address: baseAddress,
            tokenAddress: baseAddress,
        };
    }
    validateTokenAddress(address) {
        try {
            return ethers_1.ethers.isAddress(address);
        }
        catch {
            return false;
        }
    }
}
exports.ERC20Standard = ERC20Standard;
