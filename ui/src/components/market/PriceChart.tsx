import { useEffect, useRef } from "react";
import { MARKET_MAP } from "../../lib/constants";
import { useStore } from "@nanostores/react";
import { $theme } from "../../stores/app";

export function PriceChart({ marketId }: { marketId: string }) {
  const config = MARKET_MAP.get(marketId);
  const theme = useStore($theme);
  const containerRef = useRef<HTMLDivElement>(null);

  const tvSymbol = config?.tvSymbol ?? "BINANCE:SUIUSDT";
  const interval = String((config?.intervalMs ?? 60_000) / 60_000);
  const isDark = theme === "dark";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container";
    wrapper.style.height = "100%";
    wrapper.style.width = "100%";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "calc(100% - 32px)";
    widgetDiv.style.width = "100%";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval,
      timezone: "Etc/UTC",
      theme: isDark ? "dark" : "light",
      style: "1",
      locale: "en",
      allow_symbol_change: false,
      calendar: false,
      hide_side_toolbar: true,
      hide_volume: true,
      support_host: "https://www.tradingview.com",
    });

    wrapper.appendChild(widgetDiv);
    wrapper.appendChild(script);
    el.appendChild(wrapper);

    return () => {
      el.innerHTML = "";
    };
  }, [tvSymbol, interval, isDark]);

  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-[280px] lg:h-[340px]"
      />
    </div>
  );
}
