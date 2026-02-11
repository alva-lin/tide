import { Header } from "./components/layout/Header";
import { MarketPanel } from "./components/market/MarketPanel";

function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <MarketPanel />
      </main>
    </div>
  );
}

export default App;
