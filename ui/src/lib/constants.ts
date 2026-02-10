export const PACKAGE_ID =
  "0x0a76de200415689e73b53498a4cef8cba2c6befd92f779fcfbc4a566321e14f7";

export const REGISTRY_ID =
  "0x102f49591cccd726dd6604c1e0a2cca041c981a47100dc0081b551f59d06d4ee";

export const CLOCK_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000006";

export const TICKET_TYPE = `${PACKAGE_ID}::bet::Ticket`;

export interface MarketConfig {
  label: string;
  asset: string;
  marketId: string;
  intervalMs: number;
}

export const MARKETS: MarketConfig[] = [
  {
    label: "SUI 1m",
    asset: "SUI/USD",
    marketId:
      "0x1120621fda74cf655077faf9014f4b2d78b661f0583527127c8cebbc08078103",
    intervalMs: 60_000,
  },
  {
    label: "SUI 5m",
    asset: "SUI/USD",
    marketId:
      "0x33eda2039bbb052c3d5c13c56615a167a113f20933ba0926e4a8bb9b955714bf",
    intervalMs: 300_000,
  },
  {
    label: "BTC 5m",
    asset: "BTC/USD",
    marketId:
      "0x1e5b0e56ac03e828f0bc83e5853608b81b3c9acde1040edcf41fec0b8b1f558f",
    intervalMs: 300_000,
  },
  {
    label: "ETH 5m",
    asset: "ETH/USD",
    marketId:
      "0xfe327c8165a9ce518e641579095898bdd6a4ca51640a368a1245ccf1a37ac5c3",
    intervalMs: 300_000,
  },
  {
    label: "WAL 5m",
    asset: "WAL/USD",
    marketId:
      "0x0f5514c7599f6410d7f4b9ff10495e5a4a9c69873fd1a6fe3f6f3fd315728337",
    intervalMs: 300_000,
  },
];
