"use client";
import { CurrentHolding } from "@/lib/types";
import { exportToCsv } from "@/lib/utils";

interface Props { data: CurrentHolding[]; title?: string; showActions?: boolean }

const ACTION_STYLE: Record<string,string> = {
  BUY:      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  SELL:     "bg-red-500/15 text-red-400 border-red-500/30",
  INCREASE: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  DECREASE: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  HOLD:     "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

export default function CurrentHoldingsTable({ data, showActions = false }: Props) {
  if (!data.length) return <p className="text-gray-500 text-sm">No positions.</p>;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={()=>exportToCsv(data as any[], "holdings.csv")}
          className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg">⬇ Export CSV</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="data-table">
          <thead><tr>
            <th>Symbol</th>
            <th>Current %</th>
            <th>Target %</th>
            <th>Δ</th>
            {showActions && <th>Action</th>}
          </tr></thead>
          <tbody>
            {data.map((h,i)=>(
              <tr key={i}>
                <td className="font-bold text-white">{h.symbol}</td>
                <td className="font-mono">{h.current_weight!=null?`${(h.current_weight*100).toFixed(2)}%`:"—"}</td>
                <td className="font-mono">{h.target_weight!=null?`${(h.target_weight*100).toFixed(2)}%`:"—"}</td>
                <td className={`font-mono font-semibold ${(h.delta||0)>0.005?"text-emerald-400":(h.delta||0)<-0.005?"text-red-400":"text-gray-400"}`}>
                  {h.delta!=null?`${h.delta>=0?"+":""}${(h.delta*100).toFixed(2)}%`:"—"}
                </td>
                {showActions && (
                  <td>{(()=>{const action=(h.delta||0)>0.01?"INCREASE":(h.delta||0)<-0.01?"DECREASE":(h.target_weight||0)<0.001&&(h.current_weight||0)>0?"SELL":(h.current_weight||0)<0.001&&(h.target_weight||0)>0?"BUY":"HOLD";return<span className={`inline-flex px-2 py-0.5 rounded border text-xs font-bold ${ACTION_STYLE[action]||ACTION_STYLE.HOLD}`}>{action}</span>})()}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
