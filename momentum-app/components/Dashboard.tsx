"use client";
import { useState } from "react";
import { DashboardData } from "@/lib/types";
import PerformanceChart    from "./charts/PerformanceChart";
import MonthlyHeatmap      from "./charts/MonthlyHeatmap";
import HoldingsChart       from "./charts/HoldingsChart";
import TurnoverChart       from "./charts/TurnoverChart";
import AttributionTable    from "./tables/AttributionTable";
import CurrentHoldingsTable from "./tables/CurrentHoldingsTable";
import RebalanceLogTable   from "./tables/RebalanceLogTable";
import PositionsTable      from "./tables/PositionsTable";

const TABS = [
  {id:"overview",  label:"Overview",   icon:"📊"},
  {id:"holdings",  label:"Holdings",   icon:"🗂"},
  {id:"rebalance", label:"Rebalance",  icon:"⚡"},
  {id:"positions", label:"Positions",  icon:"🏦"},
];

function Card({title,children,className=""}:{title?:string;children:React.ReactNode;className?:string}) {
  return (
    <div className={`rounded-xl border border-gray-800 bg-gray-900 overflow-hidden ${className}`}>
      {title&&<div className="px-5 py-3 border-b border-gray-800"><h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">{title}</h3></div>}
      <div className="p-5">{children}</div>
    </div>
  );
}

function StatPill({label,value,sub}:{label:string;value:string;sub?:string}) {
  return (
    <div className="bg-gray-800/60 rounded-lg px-4 py-3 min-w-[120px]">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
      {sub&&<div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard({data,cacheAge,onRefresh}:{data:DashboardData;cacheAge:string|null;onRefresh:()=>void}) {
  const [tab, setTab] = useState("overview");
  const last  = data.portfolio_ts[data.portfolio_ts.length-1];
  const first = data.portfolio_ts[0];
  const tr    = last&&first?(last.value/first.value-1):0;
  const s     = data.attribution.strategy;
  const p     = (v:number|null)=>v==null?"—":`${v>=0?"+":""}${(v*100).toFixed(2)}%`;

  // Next rebalance changes only
  const changes = data.next_rebalance.filter(h=>Math.abs(h.delta||0)>0.01||(h.current_weight||0)<0.001&&(h.target_weight||0)>0||(h.target_weight||0)<0.001&&(h.current_weight||0)>0);

  return (
    <div className="min-h-screen" style={{background:"#0a0e1a"}}>
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔄</span>
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">Momentum ETF Rotation</h1>
              <p className="text-xs text-gray-400">{data.config.start_date} → {data.config.end_date} · {data.config.rebalance} · {data.config.weighting} · Top {data.config.percentile_rank} assets · {data.config.n_assets} universe</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {cacheAge&&<span className="text-xs text-gray-500">Computed {cacheAge}</span>}
            <button onClick={onRefresh} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700">🔄 Refresh</button>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto px-6 pb-3 flex gap-3 overflow-x-auto">
          <StatPill label="Total Return" value={p(tr)}/>
          <StatPill label="CAGR"         value={p(s.cagr)}/>
          <StatPill label="Sharpe"       value={s.sharpe!=null?s.sharpe.toFixed(2):"—"}/>
          <StatPill label="Sortino"      value={s.sortino!=null?s.sortino.toFixed(2):"—"}/>
          <StatPill label="Max DD"       value={s.max_dd!=null?`${(s.max_dd*100).toFixed(1)}%`:"—"}/>
          <StatPill label="Volatility"   value={p(s.volatility)}/>
          <StatPill label="MAR"          value={s.mar!=null?s.mar.toFixed(2):"—"}/>
          <StatPill label="Capital"      value={`$${(data.config.initial_capital/1e6).toFixed(0)}M`}/>
          {changes.length>0&&<StatPill label="Next Rebal." value={`${changes.length} changes`} sub="pending"/>}
        </div>

        <div className="max-w-[1600px] mx-auto px-6 flex gap-1 pb-0">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-all ${tab===t.id?"border-blue-500 text-blue-400 bg-blue-500/5":"border-transparent text-gray-400 hover:text-gray-200"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">

        {tab==="overview"&&(
          <>
            <Card title="Portfolio Performance vs SPY (Log Scale)">
              <PerformanceChart data={data.portfolio_ts}/>
            </Card>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card title="Performance Attribution">
                <AttributionTable strategy={data.attribution.strategy} benchmark={data.attribution.benchmark}/>
              </Card>
              <div className="space-y-6">
                <Card title="Current Portfolio Holdings">
                  <CurrentHoldingsTable data={data.current_holdings} showActions={false}/>
                </Card>
                <Card title="Annualised Turnover">
                  <TurnoverChart data={data.turnover_ts}/>
                </Card>
              </div>
            </div>
            <Card title="Monthly Returns">
              <MonthlyHeatmap strategy={data.monthly_returns.strategy} benchmark={data.monthly_returns.benchmark} relative={data.monthly_returns.relative}/>
            </Card>
          </>
        )}

        {tab==="holdings"&&(
          <>
            <Card title="Top Holdings Allocation Over Time (Stacked Area)">
              <HoldingsChart data={data.holdings_ts} assets={data.holdings_assets}/>
            </Card>
            <Card title="Current vs Target Weights">
              <CurrentHoldingsTable data={data.next_rebalance} showActions={true}/>
            </Card>
          </>
        )}

        {tab==="rebalance"&&(
          <>
            {changes.length>0?(
              <Card title={`⚡ Next Rebalance — ${changes.length} Changes`}>
                <div className="overflow-x-auto rounded-xl border border-gray-800">
                  <table className="data-table">
                    <thead><tr><th>Symbol</th><th>Action</th><th>Current %</th><th>Target %</th><th>Δ %</th></tr></thead>
                    <tbody>
                      {changes.map((h,i)=>{
                        const action=(h.target_weight||0)<0.001&&(h.current_weight||0)>0?"SELL":(h.current_weight||0)<0.001&&(h.target_weight||0)>0?"BUY":(h.delta||0)>0?"INCREASE":"DECREASE";
                        const styles:Record<string,string>={BUY:"bg-emerald-500/15 text-emerald-400 border-emerald-500/30",SELL:"bg-red-500/15 text-red-400 border-red-500/30",INCREASE:"bg-blue-500/15 text-blue-400 border-blue-500/30",DECREASE:"bg-orange-500/15 text-orange-400 border-orange-500/30"};
                        return (
                          <tr key={i}>
                            <td className="font-bold text-white">{h.symbol}</td>
                            <td><span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold ${styles[action]}`}>{action}</span></td>
                            <td className="font-mono">{h.current_weight!=null?`${(h.current_weight*100).toFixed(2)}%`:"—"}</td>
                            <td className="font-mono">{h.target_weight!=null?`${(h.target_weight*100).toFixed(2)}%`:"—"}</td>
                            <td className={`font-mono font-semibold ${(h.delta||0)>0?"text-emerald-400":"text-red-400"}`}>{h.delta!=null?`${h.delta>=0?"+":""}${(h.delta*100).toFixed(2)}%`:"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ):(
              <Card><p className="text-gray-400 text-sm text-center py-4">✅ Portfolio is aligned with current signals — no changes for next rebalance.</p></Card>
            )}
            <Card title="Historical Rebalancing Log">
              <RebalanceLogTable data={data.rebalance_log}/>
            </Card>
          </>
        )}

        {tab==="positions"&&(
          <Card title="Historical Positions (Monthly Snapshots)">
            <PositionsTable positions={data.historical_positions}/>
          </Card>
        )}
      </main>
    </div>
  );
}
