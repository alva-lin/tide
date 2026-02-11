export const PACKAGE_ID =
  "0x0a76de200415689e73b53498a4cef8cba2c6befd92f779fcfbc4a566321e14f7";

export const REGISTRY_ID =
  "0x102f49591cccd726dd6604c1e0a2cca041c981a47100dc0081b551f59d06d4ee";

export const CLOCK_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000006";

export const TICKET_TYPE = `${PACKAGE_ID}::bet::Ticket`;

export const EVENT_BET_PLACED = `${PACKAGE_ID}::events::BetPlaced`;
export const EVENT_REDEEMED = `${PACKAGE_ID}::events::Redeemed`;

export const PYTH_HERMES_URL = "https://hermes-beta.pyth.network";

export interface MarketConfig {
  label: string;
  asset: string;
  marketId: string;
  intervalMs: number;
  priceFeedId: string;
  tvSymbol: string;
}

export const MARKETS: MarketConfig[] = [
  // {
  //   label: "SUI 1m",
  //   asset: "SUI/USD",
  //   marketId:
  //     "0x1120621fda74cf655077faf9014f4b2d78b661f0583527127c8cebbc08078103",
  //   intervalMs: 60_000,
  //   priceFeedId:
  //     "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
  //   tvSymbol: "BINANCE:SUIUSDT",
  // },
  {
    label: "SUI",
    asset: "SUI/USD",
    marketId:
      "0x33eda2039bbb052c3d5c13c56615a167a113f20933ba0926e4a8bb9b955714bf",
    intervalMs: 300_000,
    priceFeedId:
      "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
    tvSymbol: "BINANCE:SUIUSDT",
  },
  {
    label: "BTC",
    asset: "BTC/USD",
    marketId:
      "0x1e5b0e56ac03e828f0bc83e5853608b81b3c9acde1040edcf41fec0b8b1f558f",
    intervalMs: 300_000,
    priceFeedId:
      "0xf9c0172ba10dfa4d19088d94f5bf61d3b54d5bd7483a322a982e1373ee8ea31b",
    tvSymbol: "BINANCE:BTCUSDT",
  },
  {
    label: "ETH",
    asset: "ETH/USD",
    marketId:
      "0xfe327c8165a9ce518e641579095898bdd6a4ca51640a368a1245ccf1a37ac5c3",
    intervalMs: 300_000,
    priceFeedId:
      "0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6",
    tvSymbol: "BINANCE:ETHUSDT",
  },
  {
    label: "WAL",
    asset: "WAL/USD",
    marketId:
      "0x0f5514c7599f6410d7f4b9ff10495e5a4a9c69873fd1a6fe3f6f3fd315728337",
    intervalMs: 300_000,
    priceFeedId:
      "0xa6ba0195b5364be116059e401fb71484ed3400d4d9bfbdf46bd11eab4f9b7cea",
    tvSymbol: "BYBIT:WALUSDT",
  },
];

export const MARKET_MAP = new Map(MARKETS.map((m) => [m.marketId, m]));
