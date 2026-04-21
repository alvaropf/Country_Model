"use client";
import { useState, useEffect } from "react";
import { StrategyParams, AssetInfo } from "@/lib/types";

interface Props {
  params: StrategyParams;
  availableAssets: AssetInfo[];
  allRegions: string[];
  onRun: (p: StrategyParams) => void;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer" onClick={() => onChange(!checked)}>
      <div className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-gray-700"}`}>
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? "left-5" : "left-0.5"}`}/>
      </div>
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  );
}

function NumInput({ label, value, onChange, min=0, max=1, step=0.01, pct=true }:
  { label: string; value: number; onChange: (v:number)=>void; min?:number; max?:number; step?:number; pct?:boolean }) {
  const display = pct ? +(value*100).toFixed(2) : value;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-16 shrink-0">{label}</span>
      <input type="number" value={display}
        min={pct?min*100:min} max={pct?max*100:max} step={pct?step*100:step}
        onChange={e => onChange(pct ? +e.target.value/100 : +e.target.value)}
        className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 font-mono text-right"/>
      {pct && <span className="text-xs text-gray-500">%</span>}
    </div>
  );
}

const RC: Record<string,string> = {
  US:"bg-blue-500/20 text-blue-300", DM:"bg-emerald-500/20 text-emerald-300",
  EM:"bg-yellow-500/20 text-yellow-300", CHINA:"bg-red-500/20 text-red-300",
  COMMODITIES:"bg-orange-500/20 text-orange-300", MAGS7:"bg-purple-500/20 text-purple-300",
  INDIA:"bg-pink-500/20 text-pink-300", CASH:"bg-gray-500/20 text-gray-300",
  BITCOIN:"bg-amber-500/20 text-amber-300", GOLD:"bg-yellow-600/20 text-yellow-200",
  OTHER:"bg-gray-500/20 text-gray-400",
};

export default function ConstraintsTab({ params, availableAssets, allRegions, onRun }: Props) {
  const [local, setLocal] = useState<StrategyParams>({...params});
  const [assetQ, setAssetQ] = useState("");
  const [regFilter, setRegFilter] = useState("ALL");

  useEffect(() => { setLocal({...params}); }, [params]);

  const up = (patch: Partial<StrategyParams>) => setLocal(p => ({...p, ...patch}));

  const filtered = availableAssets.filter(a =>
    (regFilter === "ALL" || a.region === regFilter) &&
    a.symbol.toLowerCase().includes(assetQ.toLowerCase())
  );

  return (
    <div className="space-y-6">

      {/* Strategy toggles */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Strategy Parameters</h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          {/* Weighting */}
          <div className="space-y-2">
            <p className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-3">Weighting</p>
            <div className="flex rounded-lg border border-gray-700 overflow-hidden w-fit">
              {(["ATR","EW"] as const).map(w => (
                <button key={w} onClick={() => up({weighting:w})}
                  className={`px-4 py-2 text-xs font-semibold transition-colors ${local.weighting===w?"bg-blue-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  {w==="ATR"?"ATR Weighted":"Equal Weighted"}
                </button>
              ))}
            </div>
          </div>

          {/* Rebalance */}
          <div className="space-y-2">
            <p className="text-xs text-blue-400 font-semibold uppercase tracking-widest mb-3">Rebalance</p>
            <div className="flex rounded-lg border border-gray-700 overflow-hidden w-fit">
              {(["W","M"] as const).map(r => (
                <button key={r} onClick={() => up({rebalance:r})}
                  className={`px-4 py-2 text-xs font-semibold transition-colors ${local.rebalance===r?"bg-blue-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  {r==="W"?"Weekly":"Monthly"}
                </button>
              ))}
            </div>
          </div>

          {/* Trend filter */}
          <div className="space-y-3">
            <p className="text-xs text-blue-400 font-semibold uppercase tracking-widest">Trend Filter</p>
            <Toggle label="MomFactor &gt; threshold" checked={local.trend_filter} onChange={v => up({trend_filter:v})}/>
            {local.trend_filter && (
              <NumInput label="Threshold" value={local.trend_threshold}
                onChange={v => up({trend_threshold:v})} min={-1} max={1} step={0.05} pct={false}/>
            )}
            <p className="text-xs text-gray-500">Exclude assets with MomFactor below threshold</p>
          </div>

          {/* Regime filter */}
          <div className="space-y-3">
            <p className="text-xs text-blue-400 font-semibold uppercase tracking-widest">Regime Filter</p>
            <Toggle label="SPY above moving avg." checked={local.regime_filter} onChange={v => up({regime_filter:v})}/>
            {local.regime_filter && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-16">MA Type</span>
                  <div className="flex rounded border border-gray-700 overflow-hidden">
                    {(["SMA","EMA"] as const).map(t => (
                      <button key={t} onClick={() => up({regime_ma_type:t})}
                        className={`px-3 py-1 text-xs font-medium transition-colors ${local.regime_ma_type===t?"bg-blue-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <NumInput label="Period" value={local.regime_period}
                  onChange={v => up({regime_period:Math.round(v)})} min={10} max={400} step={1} pct={false}/>
              </div>
            )}
            <p className="text-xs text-gray-500">Go to cash when SPY is below its moving avg.</p>
          </div>
        </div>
      </div>

      {/* Region constraints */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Region Min / Max Allocation</h3>
          <p className="text-xs text-gray-500 mt-0.5">Constrain total exposure per region</p>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {allRegions.map(region => (
            <div key={region} className="bg-gray-800/50 rounded-xl p-3 space-y-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded inline-block ${RC[region]??RC.OTHER}`}>{region}</span>
              <NumInput label="Min" value={local.region_min[region]??0}
                onChange={v => setLocal(p => ({...p, region_min:{...p.region_min,[region]:v}}))}/>
              <NumInput label="Max" value={local.region_max[region]??1}
                onChange={v => setLocal(p => ({...p, region_max:{...p.region_max,[region]:v}}))}/>
            </div>
          ))}
        </div>
      </div>

      {/* Per-asset constraints */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Per-Asset Weight Constraints</h3>
          <input value={assetQ} onChange={e => setAssetQ(e.target.value)} placeholder="Search…"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-32"/>
          <div className="flex gap-1 flex-wrap">
            {["ALL",...allRegions].map(r => (
              <button key={r} onClick={() => setRegFilter(r)}
                className={`px-2 py-0.5 text-xs rounded font-medium ${regFilter===r?"bg-blue-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map(a => (
              <div key={a.symbol} className="bg-gray-800/40 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-sm text-white">{a.symbol}</span>
                  <span className={`text-xs px-1 py-0.5 rounded ${RC[a.region]??RC.OTHER}`}>{a.region}</span>
                </div>
                <NumInput label="Min" value={local.asset_min_weights[a.symbol]??0}
                  onChange={v => setLocal(p => ({...p, asset_min_weights:{...p.asset_min_weights,[a.symbol]:v}}))}
                  min={0} max={0.5}/>
                <NumInput label="Max" value={local.asset_max_weights[a.symbol]??0.15}
                  onChange={v => setLocal(p => ({...p, asset_max_weights:{...p.asset_max_weights,[a.symbol]:v}}))}
                  min={0} max={1}/>
              </div>
            ))}
            {!filtered.length && <p className="text-gray-500 text-sm col-span-5 py-4 text-center">No assets found.</p>}
          </div>
        </div>
      </div>

      {/* Run */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Changes take effect when you click Run Strategy. Results are cached per parameter set.</p>
        <button onClick={() => onRun(local)}
          className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors shadow-lg shadow-blue-600/20">
          ▶ Run Strategy
        </button>
      </div>
    </div>
  );
}
