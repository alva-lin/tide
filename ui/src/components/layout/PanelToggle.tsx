import { useStore } from "@nanostores/react";
import { $activePanel } from "../../stores/app";
import { cn } from "../../lib/utils";

export function PanelToggle() {
  const panel = useStore($activePanel);

  return (
    <div className="flex border">
      <button
        onClick={() => $activePanel.set("market")}
        className={cn(
          "px-4 py-1.5 text-sm font-medium transition-colors",
          panel === "market"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Market
      </button>
      <button
        onClick={() => $activePanel.set("records")}
        className={cn(
          "px-4 py-1.5 text-sm font-medium transition-colors border-l",
          panel === "records"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        My Records
      </button>
    </div>
  );
}
