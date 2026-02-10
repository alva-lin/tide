// Deployed contract addresses and object IDs (Sui Testnet)

export const PACKAGE_ID =
  "0x0a76de200415689e73b53498a4cef8cba2c6befd92f779fcfbc4a566321e14f7";

export const REGISTRY_ID =
  "0x102f49591cccd726dd6604c1e0a2cca041c981a47100dc0081b551f59d06d4ee";

export const ADMIN_CAP_ID =
  "0xd6f88b87e982774e584fefda4f8e3f39b7ad71028007b410d64d7b352410d1ae";

// Markets (shared objects)
export const MARKETS = {
  SUI_1M: "0x1120621fda74cf655077faf9014f4b2d78b661f0583527127c8cebbc08078103",
  SUI_5M: "0x33eda2039bbb052c3d5c13c56615a167a113f20933ba0926e4a8bb9b955714bf",
  BTC_5M: "0x1e5b0e56ac03e828f0bc83e5853608b81b3c9acde1040edcf41fec0b8b1f558f",
  ETH_5M: "0xfe327c8165a9ce518e641579095898bdd6a4ca51640a368a1245ccf1a37ac5c3",
  WAL_5M: "0x0f5514c7599f6410d7f4b9ff10495e5a4a9c69873fd1a6fe3f6f3fd315728337",
} as const;

// Pyth price feed IDs
export const PYTH_FEED_IDS = {
  SUI_USD: "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
  BTC_USD: "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b",
  ETH_USD: "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6",
  WAL_USD: "0xa6ba0195b5364be116059e401fb71484ed3400d4d9bfbdf46bd11eab4f9b7cea",
} as const;

// Pyth infrastructure (Sui Testnet)
export const PYTH_STATE_ID =
  "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c";

export const WORMHOLE_STATE_ID =
  "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790";

// Sui system objects
export const CLOCK_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000006";

export const SUI_COIN_TYPE = "0x2::sui::SUI";

// Market name → { marketId, feedId } mapping
export const MARKET_REGISTRY: Record<string, { marketId: string; feedId: string }> = {
  SUI_1M: { marketId: MARKETS.SUI_1M, feedId: PYTH_FEED_IDS.SUI_USD },
  SUI_5M: { marketId: MARKETS.SUI_5M, feedId: PYTH_FEED_IDS.SUI_USD },
  BTC_5M: { marketId: MARKETS.BTC_5M, feedId: PYTH_FEED_IDS.BTC_USD },
  ETH_5M: { marketId: MARKETS.ETH_5M, feedId: PYTH_FEED_IDS.ETH_USD },
  WAL_5M: { marketId: MARKETS.WAL_5M, feedId: PYTH_FEED_IDS.WAL_USD },
};

/**
 * Resolve a market name (e.g. "SUI_1M") or raw object ID to { marketId, feedId }.
 * Throws if the name is unknown and doesn't look like an object ID.
 */
export function resolveMarket(nameOrId: string): { marketId: string; feedId: string } {
  const upper = nameOrId.toUpperCase();
  if (MARKET_REGISTRY[upper]) return MARKET_REGISTRY[upper];
  // Treat as raw object ID — caller must provide feedId separately
  if (nameOrId.startsWith("0x")) return { marketId: nameOrId, feedId: "" };
  const names = Object.keys(MARKET_REGISTRY).join(", ");
  throw new Error(`Unknown market "${nameOrId}". Available: ${names}`);
}

/** Convert SUI amount (e.g. "0.5") to MIST integer. */
export function suiToMist(sui: string): number {
  return Math.round(parseFloat(sui) * 1_000_000_000);
}

/** Calculate next aligned start time for a given interval. */
export function nextAlignedStartTime(intervalMs: number): number {
  const bufferMs = 5_000;
  const now = Date.now();
  return Math.ceil((now + bufferMs) / intervalMs) * intervalMs + intervalMs;
}