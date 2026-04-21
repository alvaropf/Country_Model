"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { DashboardData, StrategyParams } from "@/lib/types";
import Dashboard from "@/components/Dashboard";

const DEFAULT_PARAMS: StrategyParams = {
  weighting: "ATR", rebalance: "W",
  trend_filter: false, trend_threshold: 0.0,
  regime_filter: false, regime_ma_type: "SMA", regime_period: 200,
  asset_min_weights: {}, asset_max_weights: {},
  region_min: {}, region_max: {},
};

const CACHE_KEY = (p: StrategyParams) =>
  `momentum_v2_${btoa(JSON.stringify(p)).slice(0, 32)}`;
const CACHE_TTL = 6 * 60 * 60 * 1000;

export default function Home() {
  const [params, setParams]       = useState<StrategyParams>(DEFAULT_PARAMS);
  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [progress, setProgress]   = useState("Initialising strategy engine…");
  const [error, setError]         = useState<string | null>(null);
  const [cacheAge, setCacheAge]   = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (p: StrategyParams, forceRefresh = false) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true); setError(null); setData(null);

    if (!forceRefresh) {
      try {
        const raw = localStorage.getItem(CACHE_KEY(p));
        if (raw) {
          const { ts, payload } = JSON.parse(raw);
          if (Date.now() - ts < CACHE_TTL) {
            setData(payload);
            const mins = Math.round((Date.now() - ts) / 60000);
            setCacheAge(mins < 2 ? "just now" : `${mins}m ago`);
            setLoading(false); return;
          }
        }
      } catch {}
    }

    const steps = [
      "Loading market data…",
      p.weighting === "ATR" ? "Running ATR weighting…" : "Running equal weighting…",
      p.trend_filter ? "Applying trend filter…" : "Selecting top assets…",
      p.regime_filter ? "Applying regime filter…" : "Simulating rebalancing…",
      "Computing performance metrics…", "Building charts…",
    ];
    let si = 0; setProgress(steps[0]);
    const ticker = setInterval(() => { si = (si+1)%steps.length; setProgress(steps[si]); }, 5000);

    try {
      const res = await fetch("/api/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
        signal: abortRef.current.signal,
      });
      clearInterval(ticker);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json: DashboardData = await res.json();
      if ((json as any).error) throw new Error((json as any).error);
      localStorage.setItem(CACHE_KEY(p), JSON.stringify({ ts: Date.now(), payload: json }));
      setCacheAge("just now"); setData(json);
    } catch (e: any) {
      clearInterval(ticker);
      if (e.name !== "AbortError") setError(e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(params); }, []);

  const handleRun = (newParams: StrategyParams) => { setParams(newParams); load(newParams); };
  const refresh   = () => load(params, true);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{background:"#0a0e1a"}}>
      <div className="relative">
        <div className="w-20 h-20 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin"/>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl">📈</span></div>
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Momentum ETF Rotation</h1>
        <p className="text-blue-400 text-sm animate-pulse">{progress}</p>
        <p className="text-gray-500 text-xs mt-2">First load may take 2–3 minutes · Results cached 6h</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:"#0a0e1a"}}>
      <div className="bg-red-950/50 border border-red-800 rounded-xl p-8 max-w-lg text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-red-400 mb-2">Strategy Error</h2>
        <pre className="text-red-300 text-xs text-left bg-black/40 p-4 rounded-lg overflow-auto max-h-60 mb-4">{error}</pre>
        <button onClick={refresh} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-medium">Retry</button>
      </div>
    </div>
  );

  return <Dashboard data={data!} cacheAge={cacheAge} params={params} onRun={handleRun} onRefresh={refresh}/>;
}
