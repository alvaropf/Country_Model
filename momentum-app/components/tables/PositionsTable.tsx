"use client";
import { useState, useMemo } from "react";
import { exportToCsv } from "@/lib/utils";
export default function PositionsTable({ positions }: { positions: Record<string,unknown>[] }) {
  const [page, setPage] = useState(0);
  const PAGE = 60;
  const cols = useMemo(()=>!positions.length?[]:Object.keys(positions[0]),[positions]);
  const paged = positions.slice(page*PAGE,(page+1)*PAGE);
  const total = Math.ceil(positions.length/PAGE);
  const fmt=(col:string,v:unknown)=>{
    if(v==null)return{text:"—",cls:"text-gray-600"};
    const n=Number(v);
    if(col.includes("value"))return{text:Math.abs(n)>=1000?`$${(n/1000).toFixed(1)}K`:`$${n.toFixed(0)}`,cls:n>0?"text-emerald-400":"text-gray-400"};
    if(col==="date")return{text:String(v),cls:"text-gray-300 font-medium"};
    if(!isNaN(n)&&n>0&&n<1)return{text:`${(n*100).toFixed(1)}%`,cls:"text-blue-400"};
    return{text:String(v),cls:"text-gray-300"};
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={()=>exportToCsv(positions as any[],"historical_positions.csv")} className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg">⬇ Export CSV</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="data-table" style={{minWidth:"max-content"}}>
          <thead><tr>{cols.map(c=><th key={c} className="whitespace-nowrap">{c.replace(/_/g," ")}</th>)}</tr></thead>
          <tbody>
            {paged.map((row,i)=>(
              <tr key={i}>{cols.map(c=>{const{text,cls}=fmt(c,row[c]);return<td key={c} className={`font-mono ${cls} whitespace-nowrap`}>{text}</td>;})}</tr>
            ))}
          </tbody>
        </table>
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
