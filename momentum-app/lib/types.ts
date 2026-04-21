export interface PortfolioPoint {
  date: string; value: number; benchmark: number | null;
  drawdown: number | null; benchmark_drawdown: number | null;
}
export interface AttributionMetrics {
  cagr: number | null; total_return: number | null; ytd: number | null;
  "1d": number | null; "1wk": number | null; "1m": number | null; "3m": number | null;
  "1yr": number | null; "3yr": number | null; "5yr": number | null; "10yr": number | null;
  volatility: number | null; sharpe: number | null; sortino: number | null;
  max_dd: number | null; max_dd_days: number | null; max_dd_rec: string | null;
  dd2: number | null; dd2_days: number | null; dd3: number | null; dd3_days: number | null;
  mar: number | null; corr_ret: number | null; corr_dd: number | null;
}
export interface HoldingPoint { date: string; [key: string]: string | number | undefined; }
export interface CurrentHolding {
  symbol: string; current_weight: number | null; target_weight: number | null; delta: number | null;
}
export interface RebalanceEvent {
  symbol: string; prev_weight: number | null; new_weight: number | null;
  delta: number | null; action: string; est_value: number | null;
}
export interface RebalanceDay { date: string; events: RebalanceEvent[]; n_changes: number; }
export interface TurnoverPoint { date: string; turnover: number | null; }
export interface AssetInfo { symbol: string; region: string; }

export interface StrategyParams {
  weighting: "ATR" | "EW";
  rebalance: "W" | "M";
  trend_filter: boolean;
  trend_threshold: number;
  regime_filter: boolean;
  regime_ma_type: "SMA" | "EMA";
  regime_period: number;
  asset_min_weights: Record<string, number>;
  asset_max_weights: Record<string, number>;
  region_min: Record<string, number>;
  region_max: Record<string, number>;
}

export interface DashboardData {
  computed_at: string;
  params: StrategyParams;
  config: {
    start_date: string; end_date: string; initial_capital: number;
    n_assets: number; rebalance: string; weighting: string;
    percentile_rank: number; weight_cap: number;
  };
  available_assets: AssetInfo[];
  all_regions: string[];
  portfolio_ts: PortfolioPoint[];
  attribution: { strategy: AttributionMetrics; benchmark: AttributionMetrics };
  monthly_returns: {
    strategy: Record<string, Record<string, number | null>>;
    benchmark: Record<string, Record<string, number | null>>;
    relative: Record<string, Record<string, number | null>>;
  };
  holdings_ts: HoldingPoint[];
  holdings_assets: string[];
  current_holdings: CurrentHolding[];
  next_rebalance: CurrentHolding[];
  turnover_ts: TurnoverPoint[];
  rebalance_log: RebalanceDay[];
  historical_positions: Record<string, unknown>[];
  summary_table: Record<string, number>;
}
