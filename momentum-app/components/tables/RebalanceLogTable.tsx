"use client";
import { useState } from "react";
import { RebalanceDay } from "@/lib/types";
import { exportToCsv } from "@/lib/utils";

const ACTION_STYLE: Record<string,string> = {
  BUY:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  SELL: "bg-red-500/15 text-red-400 border-red-500/30",
};

export default function RebalanceLogTable({ data }: { data: RebalanceDay[] }) {
  const [expanded, setExpanded] = useState<string|null>(null);
  const [page, setPage]         = useState(0);
  const PAGE = 20;
  const sorted = [...data].reverse();
  const paged  = sorted.slice(page*PAGE,(page+1)*PAGE);
  const total  = Math.ceil(sorted.length/PAGE);

  const flat = data.flatMap(d=>d.events.map(e=>({date:d.date,...e})));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">{data.length} rebalancing events</span>
        <button onClick={()=>exportToCsv(flat as any[],"rebalance_log.csv")}
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg">⬇ Export CSV</button>
      </div>
      <div className="space-y-2">
        {paged.map(day=>(
          <div key={day.date} className="rounded-xl border border-gray-800 overflow-hidden">
            <button className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors text-left"
              onClick={()=>setExpanded(expanded===day.date?null:day.date)}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-white">{day.date}</span>
                <span className="text-xs text-gray-400">{day.n_changes} changes</span>
              </div>
              <span className="text-gray-400">{expanded===day.date?"▲":"▼"}</span>
            </button>
            {expanded===day.date&&(
              <div className="border-t border-gray-800 overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>Symbol</th><th>Action</th><th>From %</th><th>To %</th><th>Δ %</th><th>Est. Value</th></tr></thead>
                  <tbody>
                    {day.events.map((e,i)=>(
                      <tr key={i}>
                        <td className="font-bold text-white">{e.symbol}</td>
                        <td><span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold ${ACTION_STYLE[e.action]||""}`}>{e.action}</span></td>
                        <td className="font-mono">{e.prev_weight!=null?`${(e.prev_weight*100).toFixed(2)}%`:"—"}</td>
                        <td className="font-mono">{e.new_weight!=null?`${(e.new_weight*100).toFixed(2)}%`:"—"}</td>
                        <td className={`font-mono font-semibold ${(e.delta||0)>0?"text-emerald-400":"text-red-400"}`}>
                          {e.delta!=null?`${e.delta>=0?"+":""}${(e.delta*100).toFixed(2)}%`:"—"}
                        </td>
                        <td className="font-mono text-gray-300">
                          {e.est_value!=null?`${e.est_value>=0?"$":"-$"}${Math.abs(e.est_value/1000).toFixed(0)}K`:"—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      {total>1&&(
        <div className="flex items-center justify-between">
          <button disabled={page===0} onClick={()=>setPage(p=>p-1)} className="px-3 py-1 text-xs bg-gray-800 rounded-lg text-gray-300 disabled:opacity-40">← Prev</button>
          <span className="text-xs text-gray-400">Page {page+1}/{total}</span>
          <button disabled={page>=total-1} onClick={()=>setPage(p=>p+1)} className="px-3 py-1 text-xs bg-gray-800 rounded-lg text-gray-300 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
