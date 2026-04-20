"use client";
import { useEffect, useState, useCallback } from "react";
import { DashboardData } from "@/lib/types";
import Dashboard from "@/components/Dashboard";

type Weighting = "ATR" | "EW";

const CACHE_KEY = (w: Weighting) => `momentum_dashboard_${w}_v1`;
const CACHE_TTL = 6 * 60 * 60 * 1000;

export default function Home() {
  const [weighting, setWeighting]   = useState<Weighting>("ATR");
  const [data, setData]             = useState<DashboardData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [progress, setProgress]     = useState("Initialising strategy engine…");
  const [error, setError]           = useState<string | null>(null);
  const [cacheAge, setCacheAge]     = useState<string | null>(null);

  const load = useCallback(async (w: Weighting, forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setData(null);

    // Check localStorage cache
    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(CACHE_KEY(w));
        if (raw) {
          const { ts, payload } = JSON.parse(raw);
          if (Date.now() - ts < CACHE_TTL) {
            setData(payload);
            const mins = Math.round((Date.now() - ts) / 60000);
            setCacheAge(mins < 2 ? "just now" : `${mins}m ago`);
            setLoading(false);
            return;
          }
        }
      } catch {}
    }

    const steps = [
      "Downloading 66 ETFs from Yahoo Finance…",
      "Computing momentum scores…",
      w === "ATR" ? "Running ATR weighting…" : "Running equal weighting…",
      "Simulating weekly rebalancing…",
      "Computing performance metrics…",
      "Building charts…",
    ];
    let si = 0;
    setProgress(steps[0]);
    const ticker = setInterval(() => { si = (si + 1) % steps.length; setProgress(steps[si]); }, 5000);

    try {
      const res = await fetch(`/api/strategy?w=${w}`);
      clearInterval(ticker);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json: DashboardData = await res.json();
      if ((json as any).error) throw new Error((json as any).error);
      localStorage.setItem(CACHE_KEY(w), JSON.stringify({ ts: Date.now(), payload: json }));
      setCacheAge("just now");
      setData(json);
    } catch (e: any) {
      clearInterval(ticker);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount and on weighting change
  useEffect(() => { load(weighting); }, [weighting, load]);

  const handleToggle = (w: Weighting) => {
    if (w !== weighting) setWeighting(w);
  };

  const refresh = () => {
    localStorage.removeItem(CACHE_KEY(weighting));
    load(weighting, true);
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ background: "#0a0e1a" }}>
      <div className="relative">
        <div className="w-20 h-20 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl">📈</span></div>
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Momentum Strategy Dashboard</h1>
        <p className="text-blue-400 text-sm animate-pulse">{progress}</p>
        <p className="text-gray-500 text-xs mt-2">First load may take 2–3 minutes · Results cached 6 hours</p>
        <div className="flex gap-2 justify-center mt-4">
          {(["ATR", "EW"] as Weighting[]).map(w => (
            <button key={w} onClick={() => handleToggle(w)} disabled={w === weighting}
              className={`px-4 py-1.5 text-xs rounded-lg font-medium border transition-colors ${
                w === weighting
                  ? "bg-blue-600 text-white border-blue-500"
                  : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700"
              }`}>
              {w === "ATR" ? "ATR Weighted" : "Equal Weighted"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0e1a" }}>
      <div className="bg-red-950/50 border border-red-800 rounded-xl p-8 max-w-lg text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-red-400 mb-2">Strategy Error</h2>
        <pre className="text-red-300 text-xs text-left bg-black/40 p-4 rounded-lg overflow-auto max-h-60 mb-4">{error}</pre>
        <button onClick={refresh} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-medium">Retry</button>
      </div>
    </div>
  );

  return (
    <Dashboard
      data={data!}
      cacheAge={cacheAge}
      weighting={weighting}
      onToggleWeighting={handleToggle}
      onRefresh={refresh}
    />
  );
}
