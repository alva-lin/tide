import { useStore } from "@nanostores/react";
import { $activePanel } from "./stores/app";
import { Header } from "./components/layout/Header";
import { MarketPanel } from "./components/market/MarketPanel";
import { MyRecords } from "./components/records/MyRecords";

function App() {
  const panel = useStore($activePanel);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-6">
        {panel === "market" ? <MarketPanel /> : <MyRecords />}
      </main>
    </div>
  );
}

export default App;
