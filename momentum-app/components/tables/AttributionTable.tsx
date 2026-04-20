"use client";
import { AttributionMetrics } from "@/lib/types";
function Row({label,strat,bench,isPct=true,isInverse=false,decimals=2,suffix=""}:{label:string;strat:number|null;bench:number|null;isPct?:boolean;isInverse?:boolean;decimals?:number;suffix?:string}) {
  const fmtV=(v:number|null)=>v==null?"—":isPct?`${v>=0?"+":""}${(v*100).toFixed(decimals)}%`:v.toFixed(decimals)+suffix;
  const better=strat!=null&&bench!=null?(isInverse?strat<=bench:strat>=bench):null;
  const sc=better===null?"text-gray-300":better?"text-emerald-400":"text-red-400";
  const alpha=strat!=null&&bench!=null?(isPct?`${strat-bench>=0?"+":""}${((strat-bench)*100).toFixed(decimals)}%`:(strat-bench).toFixed(decimals)):"—";
  const ac=strat!=null&&bench!=null?(strat-bench)*(isInverse?-1:1)>=0?"text-emerald-400":"text-red-400":"text-gray-600";
  return (
    <tr className="hover:bg-gray-800/30 transition-colors">
      <td className="py-2 px-3 text-gray-300 text-left text-sm">{label}</td>
      <td className={`py-2 px-3 text-right font-mono text-sm font-semibold ${sc}`}>{fmtV(strat)}</td>
      <td className="py-2 px-3 text-right font-mono text-sm text-gray-400">{fmtV(bench)}</td>
      <td className={`py-2 px-3 text-right font-mono text-sm ${ac}`}>{alpha}</td>
    </tr>
  );
}
function Section({title}:{title:string}) {
  return <tr><td colSpan={4} className="pt-5 pb-1 px-3"><span className="text-xs text-blue-400 font-semibold uppercase tracking-widest">{title}</span></td></tr>;
}
export default function AttributionTable({strategy,benchmark}:{strategy:AttributionMetrics;benchmark:AttributionMetrics}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead><tr className="border-b border-gray-800">
          <th className="py-2 px-3 text-left text-xs text-gray-500 uppercase tracking-wide font-medium">Metric</th>
          <th className="py-2 px-3 text-right text-xs text-blue-400 uppercase tracking-wide font-medium">Strategy</th>
          <th className="py-2 px-3 text-right text-xs text-gray-500 uppercase tracking-wide font-medium">SPY</th>
          <th className="py-2 px-3 text-right text-xs text-gray-500 uppercase tracking-wide font-medium">Alpha</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-900">
          <Section title="Short-Term Returns"/>
          <Row label="1 Day"   strat={strategy["1d"]}  bench={benchmark["1d"]}/>
          <Row label="1 Week"  strat={strategy["1wk"]} bench={benchmark["1wk"]}/>
          <Row label="1 Month" strat={strategy["1m"]}  bench={benchmark["1m"]}/>
          <Row label="3 Month" strat={strategy["3m"]}  bench={benchmark["3m"]}/>
          <Section title="Long-Term Returns (Annualised)"/>
          <Row label="YTD"             strat={strategy.ytd}          bench={benchmark.ytd}/>
          <Row label="1 Year"          strat={strategy["1yr"]}       bench={benchmark["1yr"]}/>
          <Row label="3 Years"         strat={strategy["3yr"]}       bench={benchmark["3yr"]}/>
          <Row label="5 Years"         strat={strategy["5yr"]}       bench={benchmark["5yr"]}/>
          <Row label="10 Years"        strat={strategy["10yr"]}      bench={benchmark["10yr"]}/>
          <Row label="Since Inception" strat={strategy.cagr}         bench={benchmark.cagr}/>
          <Row label="Total Return"    strat={strategy.total_return} bench={benchmark.total_return}/>
          <Section title="Risk"/>
          <Row label="Volatility (Ann.)" strat={strategy.volatility} bench={benchmark.volatility} isInverse/>
          <Row label="Sharpe Ratio"      strat={strategy.sharpe}     bench={benchmark.sharpe}     isPct={false}/>
          <Row label="Sortino Ratio"     strat={strategy.sortino}    bench={benchmark.sortino}    isPct={false}/>
          <Row label="MAR Ratio"         strat={strategy.mar}        bench={benchmark.mar}        isPct={false}/>
          <Section title="Drawdown"/>
          <Row label="Max Drawdown"          strat={strategy.max_dd}    bench={benchmark.max_dd}    isInverse/>
          <Row label="Max DD (calendar days)" strat={strategy.max_dd_days} bench={benchmark.max_dd_days} isPct={false} decimals={0} suffix="d" isInverse/>
          <Row label="2nd Max Drawdown"      strat={strategy.dd2}       bench={benchmark.dd2}       isInverse/>
          <Row label="2nd DD (calendar days)" strat={strategy.dd2_days}  bench={benchmark.dd2_days}  isPct={false} decimals={0} suffix="d" isInverse/>
          <Row label="3rd Max Drawdown"      strat={strategy.dd3}       bench={benchmark.dd3}       isInverse/>
          <Row label="3rd DD (calendar days)" strat={strategy.dd3_days}  bench={benchmark.dd3_days}  isPct={false} decimals={0} suffix="d" isInverse/>
          <Section title="Correlation vs SPY"/>
          <Row label="Return Correlation"   strat={strategy.corr_ret} bench={null} isPct={false} decimals={3}/>
          <Row label="Drawdown Correlation" strat={strategy.corr_dd}  bench={null} isPct={false} decimals={3}/>
        </tbody>
      </table>
    </div>
  );
}
