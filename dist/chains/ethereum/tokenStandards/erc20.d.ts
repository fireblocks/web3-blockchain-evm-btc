import type { TokenStandard, TokenMetadata, TokenAddress } from '../../../core/tokenStandard';
export declare class ERC20Standard implements TokenStandard {
    readonly id = "ERC20";
    readonly name = "ERC-20";
    readonly blockchainId = "ETH";
    readonly usesSameAddress = true;
    generateTokenAddress(baseAddress: string, _tokenMetadata: TokenMetadata): TokenAddress;
    validateTokenAddress(address: string): boolean;
}
