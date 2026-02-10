// Direction
export const DIRECTION_UP = 0;
export const DIRECTION_DOWN = 1;

// Market status
export const MARKET_ACTIVE = 0;
export const MARKET_PAUSED = 1;

// Round status
export const ROUND_UPCOMING = 0;
export const ROUND_LIVE = 1;
export const ROUND_SETTLED = 2;
export const ROUND_CANCELLED = 3;

// Round result
export const RESULT_UP = 0;
export const RESULT_DOWN = 1;
export const RESULT_DRAW = 2;

export interface MarketState {
  status: number;
  currentRound: number;
  upcomingRound: number;
  roundCount: number;
  intervalMs: number;
  tableId: string;
}

export interface RoundData {
  roundNumber: number;
  status: number;
  startTimeMs: number;
  openPrice: string | null;
  openPriceExpo: string | null;
  closePrice: string | null;
  closePriceExpo: string | null;
  openTimestampMs: number | null;
  closeTimestampMs: number | null;
  upAmount: number;
  downAmount: number;
  upCount: number;
  downCount: number;
  poolValue: number;
  prizePool: number;
  result: number | null;
}

export interface TicketData {
  objectId: string;
  marketId: string;
  roundNumber: number;
  direction: number;
  amount: number;
}
