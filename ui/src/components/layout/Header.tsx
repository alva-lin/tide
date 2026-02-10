import { ConnectButton } from "@mysten/dapp-kit-react";
import { PanelToggle } from "./PanelToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
        <span className="text-lg font-bold tracking-tight">Tide</span>
        <PanelToggle />
        <ConnectButton />
      </div>
    </header>
  );
}
