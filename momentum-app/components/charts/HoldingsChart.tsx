"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { HoldingPoint } from "@/lib/types";
import { assetColor } from "@/lib/utils";
import { useMemo } from "react";

interface Props { data: HoldingPoint[]; assets: string[] }

function TTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a,b) => b.value - a.value);
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl max-h-72 overflow-y-auto">
      <p className="text-gray-400 mb-2 font-medium">{label}</p>
      {sorted.map((p: any) => p.value > 0.001 && (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{color:p.color}}>{p.name}</span>
          <span className="font-mono text-white">{(p.value*100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function HoldingsChart({ data, assets }: Props) {
  const sampled = useMemo(() => {
    if (data.length <= 600) return data;
    const s = Math.ceil(data.length/600);
    return data.filter((_,i)=>i%s===0||i===data.length-1);
  }, [data]);

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">Top holdings by average weight. Each band = % of portfolio.</p>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={sampled} stackOffset="expand" margin={{top:4,right:20,bottom:0,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
          <XAxis dataKey="date" tick={{fontSize:9,fill:"#6b7280"}} tickFormatter={d=>d.slice(0,7)} interval="preserveStartEnd"/>
          <YAxis tick={{fontSize:9,fill:"#6b7280"}} tickFormatter={v=>`${(v*100).toFixed(0)}%`} domain={[0,"auto"]}/>
          <Tooltip content={<TTip/>}/>
          <Legend wrapperStyle={{fontSize:9,paddingTop:8}}/>
          {assets.map((a,i) => (
            <Area key={a} type="monotone" dataKey={a} name={a}
              stroke={assetColor(i)} fill={assetColor(i)} fillOpacity={0.7}
              stackId="1" dot={false} strokeWidth={0}/>
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
