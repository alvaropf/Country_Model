"use client";
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { PortfolioPoint } from "@/lib/types";
import { useMemo, useState } from "react";
type Range = "1Y"|"3Y"|"5Y"|"All";
function TTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl">
      <p className="text-gray-400 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{color:p.color}}>{p.name}</span>
          <span className="text-white font-mono">{p.dataKey.includes("drawdown") ? `${(p.value*100).toFixed(2)}%` : p.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
export default function PerformanceChart({ data }: { data: PortfolioPoint[] }) {
  const [range, setRange] = useState<Range>("All");
  const [log, setLog]     = useState(true);
  const chartData = useMemo(() => {
    let slice = data;
    if (range !== "All") {
      const c = new Date();
      if (range==="1Y") c.setFullYear(c.getFullYear()-1);
      if (range==="3Y") c.setFullYear(c.getFullYear()-3);
      if (range==="5Y") c.setFullYear(c.getFullYear()-5);
      slice = data.filter(d => d.date >= c.toISOString().slice(0,10));
    }
    if (!slice.length) return [];
    const bv = slice[0].value, bb = slice[0].benchmark ?? bv;
    return slice.map(d => {
      const v  = d.value/bv*100;
      const bm = d.benchmark != null ? d.benchmark/bb*100 : null;
      return {...d, value: log&&v>0?Math.log10(v):v, benchmark: bm!=null&&log&&bm>0?Math.log10(bm):bm};
    });
  }, [data,range,log]);
  const step = Math.max(1,Math.ceil(chartData.length/800));
  const sampled = chartData.filter((_,i)=>i%step===0||i===chartData.length-1);
  const ddData  = useMemo(()=>{
    let slice=data;
    if(range!=="All"){const c=new Date();if(range==="1Y")c.setFullYear(c.getFullYear()-1);if(range==="3Y")c.setFullYear(c.getFullYear()-3);if(range==="5Y")c.setFullYear(c.getFullYear()-5);slice=data.filter(d=>d.date>=c.toISOString().slice(0,10));}
    const s=Math.max(1,Math.ceil(slice.length/800));return slice.filter((_,i)=>i%s===0||i===slice.length-1);
  },[data,range]);
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-xs text-gray-500">{log?"log₁₀(indexed)":"Indexed (100=start)"}</span>
        <div className="flex gap-1">
          <button onClick={()=>setLog(l=>!l)} className={`px-3 py-1 text-xs rounded font-medium ${log?"bg-blue-600 text-white":"bg-gray-800 text-gray-400"}`}>{log?"Log":"Linear"}</button>
          <div className="w-px bg-gray-700 mx-1"/>
          {(["1Y","3Y","5Y","All"] as Range[]).map(r=>(
            <button key={r} onClick={()=>setRange(r)} className={`px-3 py-1 text-xs rounded font-medium ${range===r?"bg-blue-600 text-white":"bg-gray-800 text-gray-400"}`}>{r}</button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={sampled} margin={{top:4,right:20,bottom:0,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
          <XAxis dataKey="date" tick={{fontSize:10,fill:"#6b7280"}} tickFormatter={d=>d.slice(0,7)} interval="preserveStartEnd"/>
          <YAxis tick={{fontSize:10,fill:"#6b7280"}} domain={["auto","auto"]} tickFormatter={v=>log?`${Math.pow(10,v).toFixed(0)}`:`${v.toFixed(0)}`}/>
          <Tooltip content={<TTip/>}/>
          <Legend wrapperStyle={{fontSize:11,paddingTop:8}}/>
          <Line type="monotone" dataKey="value" name="Strategy" stroke="#3b82f6" dot={false} strokeWidth={2}/>
          <Line type="monotone" dataKey="benchmark" name="SPY" stroke="#6b7280" dot={false} strokeWidth={1.5} strokeDasharray="4 3"/>
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 font-medium">Drawdown</p>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={ddData} margin={{top:0,right:20,bottom:0,left:10}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
            <XAxis dataKey="date" tick={{fontSize:9,fill:"#6b7280"}} tickFormatter={d=>d.slice(0,7)} interval="preserveStartEnd"/>
            <YAxis tick={{fontSize:9,fill:"#6b7280"}} domain={["auto",0]} tickFormatter={v=>`${(v*100).toFixed(0)}%`}/>
            <Tooltip content={<TTip/>}/>
            <ReferenceLine y={0} stroke="#374151"/>
            <Area type="monotone" dataKey="drawdown" name="Strategy DD" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} dot={false} strokeWidth={1}/>
            <Area type="monotone" dataKey="benchmark_drawdown" name="SPY DD" stroke="#6b7280" fill="#6b7280" fillOpacity={0.15} dot={false} strokeWidth={1}/>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
