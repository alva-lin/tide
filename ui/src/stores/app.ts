import { atom } from "nanostores";
import { MARKETS, MARKET_MAP } from "../lib/constants";
import type { ActivityRedeem } from "../lib/types";

/* ---------- Market selection (synced with URL hash) ---------- */

function marketIdFromHash(): string {
  if (typeof window === "undefined") return MARKETS[0].marketId;
  const label = decodeURIComponent(window.location.hash.replace("#", ""));
  if (!label) return MARKETS[0].marketId;
  const found = MARKETS.find((m) => m.label === label);
  return found ? found.marketId : MARKETS[0].marketId;
}

export const $selectedMarketId = atom(marketIdFromHash());

$selectedMarketId.listen((id) => {
  const config = MARKET_MAP.get(id);
  if (config) {
    window.location.hash = encodeURIComponent(config.label);
  }
});

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const id = marketIdFromHash();
    if (id !== $selectedMarketId.get()) {
      $selectedMarketId.set(id);
    }
  });
}

/* ---------- Theme ---------- */

export type Theme = "light" | "dark";

const stored =
  typeof window !== "undefined"
    ? (localStorage.getItem("tide-theme") as Theme | null)
    : null;

export const $theme = atom<Theme>(stored ?? "light");

$theme.listen((theme) => {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("tide-theme", theme);
});

if (typeof window !== "undefined") {
  document.documentElement.classList.toggle("dark", $theme.get() === "dark");
}

/* ---------- Local redeem events (optimistic, pre-indexer) ---------- */

export const $localRedeems = atom<ActivityRedeem[]>([]);
