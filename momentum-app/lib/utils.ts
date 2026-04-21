export const fmt = {
  pct: (v: number | null, d = 2) => v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`,
  num: (v: number | null, d = 2) => v == null ? "—" : v.toFixed(d),
  money: (v: number | null) => {
    if (v == null) return "—";
    const abs = Math.abs(v), sign = v < 0 ? "-" : "";
    if (abs >= 1e9)  return `${sign}$${(abs/1e9).toFixed(2)}B`;
    if (abs >= 1e6)  return `${sign}$${(abs/1e6).toFixed(2)}M`;
    if (abs >= 1000) return `${sign}$${(abs/1000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  },
};

export function colorForReturnStyle(v: number, max = 0.1): string {
  const intensity = Math.min(Math.abs(v) / max, 1);
  if (v > 0) return `rgba(16,${185},${129},${0.15 + intensity * 0.65})`;
  return `rgba(${180 + Math.round(60*intensity)},${30},${30},${0.15 + intensity * 0.65})`;
}

export function exportToCsv(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join(","), ...data.map(r => keys.map(k => JSON.stringify(r[k] ?? "")).join(","))];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Distinct colors for up to 20 assets
export const ASSET_PALETTE = [
  "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
  "#14b8a6","#f97316","#06b6d4","#84cc16","#ec4899",
  "#6366f1","#22d3ee","#a3e635","#fb923c","#e879f9",
  "#34d399","#fbbf24","#60a5fa","#f87171","#a78bfa",
];
export function assetColor(i: number) { return ASSET_PALETTE[i % ASSET_PALETTE.length]; }
