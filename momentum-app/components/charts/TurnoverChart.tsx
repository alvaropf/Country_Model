"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TurnoverPoint } from "@/lib/types";
export default function TurnoverChart({ data }: { data: TurnoverPoint[] }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">Rolling annualised turnover (fraction of portfolio traded per year).</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{top:4,right:20,bottom:0,left:10}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937"/>
          <XAxis dataKey="date" tick={{fontSize:9,fill:"#6b7280"}} tickFormatter={d=>d.slice(0,7)} interval="preserveStartEnd"/>
          <YAxis tick={{fontSize:9,fill:"#6b7280"}} domain={[0,"auto"]} tickFormatter={v=>`${(v*100).toFixed(0)}%`}/>
          <Tooltip contentStyle={{background:"#111827",border:"1px solid #374151",borderRadius:8,fontSize:11}}
            formatter={(v:any)=>[`${(Number(v)*100).toFixed(1)}%`,"Turnover"]}/>
          <Area type="monotone" dataKey="turnover" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} dot={false} strokeWidth={1.5}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
