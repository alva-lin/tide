const MIST_PER_SUI = 1_000_000_000;

export function mistToSui(mist: number): string {
  const sui = mist / MIST_PER_SUI;
  if (sui >= 1000) return sui.toFixed(0);
  return sui.toFixed(4);
}

export function suiToMist(sui: string): number {
  return Math.round(parseFloat(sui) * MIST_PER_SUI);
}

export function formatPrice(
  magnitude: string | null,
  expo: string | null,
): string {
  if (magnitude === null || expo === null) return "--";
  // Pyth stores expo as negative (e.g. -8), but on-chain it's stored as u8
  // so gRPC JSON gives us "8" meaning 10^(-8)
  const price = Number(magnitude) * Math.pow(10, -Number(expo));
  return price.toFixed(4);
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
