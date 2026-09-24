export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  contractAddress?: string;
  mintAddress?: string;
}

export interface TokenAddress {
  address: string;
  tokenAddress?: string;
}

export interface TokenStandard {
  readonly id: string;
  readonly name: string;
  readonly blockchainId: string;
  readonly usesSameAddress: boolean;

  generateTokenAddress(
    baseAddress: string,
    tokenMetadata: TokenMetadata
  ): TokenAddress;

  validateTokenAddress(address: string): boolean;
}
