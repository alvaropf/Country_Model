"use client";
import { useMemo, useState } from "react";
import { colorForReturnStyle } from "@/lib/utils";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
type Mode = "strategy"|"benchmark"|"relative";
function HeatTable({ data, maxAbs }: { data: Record<string,Record<string,number|null>>; maxAbs: number }) {
  const years = useMemo(()=>Object.keys(data).sort((a,b)=>Number(b)-Number(a)),[data]);
  if (!years.length) return <p className="text-gray-500 text-sm">No data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full border-collapse">
        <thead><tr>
          <th className="text-left text-gray-500 font-medium py-1.5 pr-3 w-12">Year</th>
          {MONTHS.map(m=><th key={m} className="text-center text-gray-500 font-medium py-1.5 px-0.5 min-w-[42px]">{m}</th>)}
          <th className="text-center text-gray-500 font-medium py-1.5 px-2">Year</th>
        </tr></thead>
        <tbody>
          {years.map(year=>(
            <tr key={year}>
              <td className="text-gray-400 font-medium pr-3 py-0.5">{year}</td>
              {MONTHS.map(m=>{
                const v=data[year]?.[m];
                const bg=v!=null?colorForReturnStyle(v,maxAbs):"transparent";
                return <td key={m} className="py-0.5 px-0.5"><div className="rounded px-1 py-1 text-center font-mono" style={{background:bg,color:"#f9fafb",fontSize:"0.7rem"}}>{v!=null?`${v>=0?"+":""}${(v*100).toFixed(1)}`:""}</div></td>;
              })}
              <td className="py-0.5 px-2">{(()=>{const yv=data[year]?.["Year"];const bg=yv!=null?colorForReturnStyle(yv,maxAbs):"transparent";return<div className="rounded px-1 py-1 font-mono font-bold text-center" style={{background:bg,color:"#f9fafb",fontSize:"0.7rem"}}>{yv!=null?`${yv>=0?"+":""}${(yv*100).toFixed(1)}`:""}</div>;})()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default function MonthlyHeatmap({strategy,benchmark,relative}:{strategy:Record<string,Record<string,number|null>>;benchmark:Record<string,Record<string,number|null>>;relative:Record<string,Record<string,number|null>>}) {
  const [mode,setMode]=useState<Mode>("strategy");
  const active=mode==="strategy"?strategy:mode==="benchmark"?benchmark:relative;
  const allVals=Object.values(active).flatMap(yr=>[...MONTHS,"Year"].map(m=>yr[m]??null).filter(v=>v!=null)) as number[];
  const maxAbs=Math.max(...allVals.map(Math.abs),0.01);
  return (
    <div>
      <div className="flex gap-1 mb-3">
        {([["strategy","Strategy"],["benchmark","Benchmark (SPY)"],["relative","vs SPY (Alpha)"]] as [Mode,string][]).map(([k,label])=>(
          <button key={k} onClick={()=>setMode(k)} className={`px-3 py-1 text-xs rounded font-medium transition-colors ${mode===k?"bg-blue-600 text-white":"bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>{label}</button>
        ))}
      </div>
      <HeatTable data={active} maxAbs={maxAbs}/>
    </div>
  );
}
