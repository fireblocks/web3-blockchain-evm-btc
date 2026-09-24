import type { TokenStandard, TokenMetadata, TokenAddress } from '../../../core/tokenStandard';
import { ethers } from 'ethers';

export class ERC20Standard implements TokenStandard {
  readonly id = 'ERC20';
  readonly name = 'ERC-20';
  readonly blockchainId = 'ETH';
  readonly usesSameAddress = true;

  generateTokenAddress(
    baseAddress: string,
    _tokenMetadata: TokenMetadata
  ): TokenAddress {
    return {
      address: baseAddress,
      tokenAddress: baseAddress,
    };
  }

  validateTokenAddress(address: string): boolean {
    try {
      return ethers.isAddress(address);
    } catch {
      return false;
    }
  }
}
