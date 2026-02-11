import { useQuery } from "@tanstack/react-query";
import { PYTH_HERMES_URL } from "../lib/constants";

export interface PythPriceData {
  price: number;
  publishTime: number;
}

export function usePythPrice(priceFeedId: string | undefined) {
  return useQuery({
    queryKey: ["pythPrice", priceFeedId],
    queryFn: async (): Promise<PythPriceData | null> => {
      if (!priceFeedId) return null;
      const id = priceFeedId.startsWith("0x")
        ? priceFeedId.slice(2)
        : priceFeedId;
      const resp = await fetch(
        `${PYTH_HERMES_URL}/v2/updates/price/latest?ids[]=${id}`,
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      const parsed = data.parsed?.[0];
      if (!parsed) return null;
      const p = parsed.price;
      return {
        price: Number(p.price) * Math.pow(10, Number(p.expo)),
        publishTime: Number(p.publish_time),
      };
    },
    enabled: !!priceFeedId,
    refetchInterval: 3_000,
    staleTime: 2_000,
  });
}
