import { ConnectButton } from "@mysten/dapp-kit-react";
import { useStore } from "@nanostores/react";
import { $theme } from "../../stores/app";
import { Sun, Moon } from "lucide-react";

export function Header() {
  const theme = useStore($theme);

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="/icon.png" alt="Tide" className="h-7 w-7" />
          <span className="text-lg font-bold tracking-tight">Tide</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => $theme.set(theme === "dark" ? "light" : "dark")}
            className="rounded-md p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
