import { atom } from "nanostores";
import { MARKETS } from "../lib/constants";

export const $selectedMarketId = atom(MARKETS[0].marketId);
export const $activePanel = atom<"market" | "records">("market");
