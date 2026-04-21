from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import sys
import os
import traceback

_HERE = os.path.dirname(os.path.abspath(__file__))
_LIB  = os.path.join(_HERE, "_lib")
if _LIB not in sys.path:
    sys.path.insert(0, _LIB)

import numpy as np
import pandas as pd
from datetime import datetime

# Two separate caches — one per weighting mode
_cache: dict = {
    "ATR": {"data": None, "ts": None},
    "EW":  {"data": None, "ts": None},
}
CACHE_SECONDS = 21600

def _cache_valid(mode: str) -> bool:
    c = _cache.get(mode, {})
    if c.get("data") is None or c.get("ts") is None:
        return False
    return (datetime.utcnow() - c["ts"]).total_seconds() < CACHE_SECONDS

class _Enc(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating):
            return None if (np.isnan(obj) or np.isinf(obj)) else float(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        if isinstance(obj, (pd.Timestamp, datetime)): return obj.strftime("%Y-%m-%d")
        if isinstance(obj, pd.Series): return obj.tolist()
        return super().default(obj)

def _s(v):
    if v is None: return None
    try:
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)): return None
        if isinstance(v, np.integer): return int(v)
        if isinstance(v, np.floating):
            return None if (np.isnan(v) or np.isinf(v)) else float(v)
    except Exception: return None
    return v

# ── Drawdown episodes ─────────────────────────────────────────────────────────
def _top3_drawdowns(values: pd.Series):
    try:
        cumret  = (1 + values.pct_change()).cumprod().dropna()
        dd      = cumret.div(cumret.cummax()).sub(1)
        is_high = dd == 0
        ep_id   = (is_high & ~is_high.shift(1, fill_value=True)).cumsum().astype(float)
        ep_id[is_high] = np.nan
        records = []
        for eid, group in dd.groupby(ep_id):
            peak_date = group.index[0]
            after     = dd[group.index[-1]:]
            recovery  = after[after >= 0].index
            cal_days  = int((recovery[0] - peak_date).days) if len(recovery) > 0 else None
            records.append({
                "dd":       float(group.min()),
                "days":     cal_days,
                "start":    str(peak_date.date()),
                "trough":   str(group.idxmin().date()),
                "recovery": str(recovery[0].date()) if len(recovery) > 0 else "Not yet recovered",
            })
        if not records: return []
        records.sort(key=lambda x: x["dd"])
        return [{k: (None if isinstance(v, float) and np.isnan(v) else v)
                 for k, v in r.items()} for r in records[:3]]
    except Exception: return []

def _metrics(values: pd.Series, bench: pd.Series = None) -> dict:
    try:
        ret  = values.pct_change().fillna(0)
        n    = len(values)
        yrs  = n / 252
        tr   = (values.iloc[-1] / values.iloc[0]) - 1
        cagr = (1 + tr) ** (1 / yrs) - 1 if yrs > 0 else 0
        vol  = float(ret.std() * np.sqrt(252))
        sh   = _s(cagr / vol) if vol > 0 else None
        dn   = ret[ret < 0].std() * np.sqrt(252)
        so   = _s(cagr / dn) if dn > 0 else None
        dd_s = (values - values.cummax()) / values.cummax()
        mdd  = float(dd_s.min())
        top3 = _top3_drawdowns(values)

        def _pr(days):
            if n < days: return None
            return _s((values.iloc[-1] / values.iloc[-days]) - 1)
        def _pr_ann(days):
            if n < days: return None
            r = (values.iloc[-1] / values.iloc[-days]) - 1
            return _s((1 + r) ** (252 / days) - 1)

        today = values.index[-1]
        ytd_v = values[values.index >= datetime(today.year, 1, 1)]
        ytd   = _s((ytd_v.iloc[-1] / ytd_v.iloc[0]) - 1) if len(ytd_v) > 1 else None

        corr_ret = corr_dd = None
        if bench is not None:
            try:
                br   = bench.pct_change().fillna(0)
                bdd  = (bench - bench.cummax()) / bench.cummax()
                comm = ret.index.intersection(br.index)
                commd= dd_s.index.intersection(bdd.index)
                if len(comm)  > 30: corr_ret = _s(float(ret.loc[comm].corr(br.loc[comm])))
                if len(commd) > 30: corr_dd  = _s(float(dd_s.loc[commd].corr(bdd.loc[commd])))
            except Exception: pass

        return {
            "cagr": _s(cagr), "total_return": _s(tr), "ytd": ytd,
            "1d": _pr(1), "1wk": _pr(5), "1m": _pr(21), "3m": _pr(63),
            "1yr": _pr_ann(252), "3yr": _pr_ann(756),
            "5yr": _pr_ann(1260), "10yr": _pr_ann(2520),
            "volatility": _s(vol), "sharpe": sh, "sortino": so,
            "max_dd": _s(mdd),
            "max_dd_days": top3[0]["days"]        if top3          else None,
            "max_dd_rec":  top3[0].get("recovery") if top3         else None,
            "dd2":         _s(top3[1]["dd"])       if len(top3) > 1 else None,
            "dd2_days":    top3[1]["days"]         if len(top3) > 1 else None,
            "dd3":         _s(top3[2]["dd"])       if len(top3) > 2 else None,
            "dd3_days":    top3[2]["days"]         if len(top3) > 2 else None,
            "mar": _s(cagr / abs(mdd)) if mdd != 0 else None,
            "corr_ret": corr_ret, "corr_dd": corr_dd,
        }
    except Exception: return {}

def _monthly(values: pd.Series) -> dict:
    try:
        MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        mo  = values.resample("ME").last()
        ret = mo.pct_change().fillna(0)
        out: dict = {}
        for ts, r in ret.items():
            y, m = str(ts.year), MONTHS[ts.month - 1]
            out.setdefault(y, {})[m] = _s(float(r))
        for y in out:
            yv = values[values.index.year == int(y)]
            if len(yv) > 1:
                out[y]["Year"] = _s((yv.iloc[-1] / yv.iloc[0]) - 1)
        return out
    except Exception: return {}

def _monthly_relative(strat: dict, bench: dict) -> dict:
    COLS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Year"]
    out = {}
    for y in set(strat) | set(bench):
        out[y] = {}
        for m in COLS:
            sv = strat.get(y, {}).get(m)
            bv = bench.get(y, {}).get(m)
            if sv is not None and bv is not None:
                out[y][m] = _s(sv - bv)
    return out

def _holdings_ts(pw: pd.DataFrame, top_n=15, max_pts=600) -> dict:
    try:
        avg_w  = pw.mean().sort_values(ascending=False)
        assets = avg_w[avg_w > 0.001].head(top_n).index.tolist()
        sub    = pw[assets].fillna(0)
        step   = max(1, len(sub) // max_pts)
        rows   = []
        for i, (idx, row) in enumerate(sub.iterrows()):
            if i % step != 0 and i != len(sub) - 1: continue
            r = {"date": str(idx.date())}
            for a in assets: r[a] = _s(float(row[a]))
            rows.append(r)
        return {"ts": rows, "assets": assets}
    except Exception: return {"ts": [], "assets": []}

def _current_holdings(pw: pd.DataFrame, tw: pd.DataFrame) -> list:
    try:
        last_actual = pw.iloc[-1].dropna()
        last_target = tw.iloc[-1].dropna() if tw is not None else pd.Series(dtype=float)
        assets = last_actual[last_actual > 0.001].index.union(
                 last_target[last_target > 0.001].index)
        rows = [{"symbol": a,
                 "current_weight": _s(float(last_actual.get(a, 0))),
                 "target_weight":  _s(float(last_target.get(a, 0))),
                 "delta": _s(float(last_target.get(a, 0) - last_actual.get(a, 0)))}
                for a in sorted(assets)]
        rows.sort(key=lambda x: -(x["target_weight"] or 0))
        return rows
    except Exception: return []

def _next_rebalance(pw: pd.DataFrame, tw: pd.DataFrame, date_index: list) -> list:
    try:
        last_actual = pw.iloc[-1].fillna(0)
        last_target = tw.iloc[-1].fillna(0)
        all_assets  = sorted(set(last_actual[last_actual > 0.001].index) |
                             set(last_target[last_target > 0.001].index))
        rows = []
        for a in all_assets:
            curr  = float(last_actual.get(a, 0))
            tgt   = float(last_target.get(a, 0))
            delta = tgt - curr
            if   tgt > 0 and curr < 0.001:  action = "BUY"
            elif tgt < 0.001 and curr > 0:  action = "SELL"
            elif delta >  0.01:             action = "INCREASE"
            elif delta < -0.01:             action = "DECREASE"
            else:                           action = "HOLD"
            rows.append({"symbol": a, "current_weight": _s(curr),
                         "target_weight": _s(tgt), "delta": _s(delta), "action": action})
        rows.sort(key=lambda x: -(abs(x["delta"] or 0)))
        return rows
    except Exception: return []

def _turnover_ts(turnover: pd.Series, max_pts=400) -> list:
    try:
        step = max(1, len(turnover) // max_pts)
        return [{"date": str(idx.date()), "turnover": _s(float(v))}
                for i, (idx, v) in enumerate(turnover.items())
                if i % step == 0 or i == len(turnover) - 1]
    except Exception: return []

def _rebal_log(tw: pd.DataFrame, pv: pd.Series) -> list:
    try:
        rows = []
        prev_tw = pd.Series(0.0, index=tw.columns)
        for d, row in tw.iterrows():
            port_val = float(pv.loc[d]) if d in pv.index else 0
            delta    = row - prev_tw
            events   = [{"symbol": a,
                          "prev_weight": _s(float(prev_tw.get(a, 0))),
                          "new_weight":  _s(float(row.get(a, 0))),
                          "delta":       _s(float(delta.get(a, 0))),
                          "action":      "BUY" if delta.get(a, 0) > 0 else "SELL",
                          "est_value":   _s(float(delta.get(a, 0)) * port_val)}
                         for a in tw.columns if abs(float(delta.get(a, 0))) > 0.005]
            if events:
                rows.append({"date": str(d.date()), "events": events, "n_changes": len(events)})
            prev_tw = row.copy()
        return rows
    except Exception: return []

def _hist_positions(pw: pd.DataFrame, pv: pd.Series) -> list:
    try:
        monthly_idx = pv.resample("ME").last().index
        rows = []
        for m_idx in monthly_idx:
            candidates = pv.index[pv.index <= m_idx]
            if candidates.empty: continue
            idx = candidates[-1]
            row = {"date": str(idx.date()), "portfolio_value": _s(float(pv.loc[idx]))}
            for col in pw.columns:
                v = pw.loc[idx, col] if idx in pw.index else 0
                if v and v > 0.001: row[col] = _s(float(v))
            rows.append(row)
        return rows
    except Exception: return []


# ── Main compute ──────────────────────────────────────────────────────────────
def compute(weighting: str = "ATR") -> dict:
    import yfinance as yf
    from portfolio_strategy_lib import portfolio_strategy
    from trading_utils import MoMFactor, calculate_atr

    ASSETS = [
        "PRN","QQQ","SPY","XLF","XLV","XLY","XLP","XLU","ITA","ITB",
        "IAT","RSP","SMH","IWM","EWL","EWG","EWU","EWC","EWA","EWQ",
        "EWP","EWN","EWD","EWI","EWJ","EWS","FEZ","IEFA","EIDO","EPOL",
        "EWM","EWT","EWW","EWY","EWZ","ILF","EZA","GREK","TUR","UAE",
        "KSA","ARGT","THD","EPHE","ECH","VNM","QAT","EMXC","CNYA",
        "MCHI","KWEB","COPX","PICK","MOO","DBC","XLB","XLE",
        "INDA","SHY","GBTC","SPMO","VOOG","VOOV","SPHQ","MAGS","IAUM",
    ]

    print(f"Downloading market data for weighting={weighting}...")
    raw = yf.download(
        tickers=ASSETS, start="2002-12-31",
        end=datetime.now().strftime("%Y-%m-%d"),
        auto_adjust=True, progress=False,
    )
    Close = raw["Close"].ffill()
    High  = raw["High"].ffill()
    Low   = raw["Low"].ffill()
    Close = Close.dropna(axis=1, how="all")
    High  = High[Close.columns]
    Low   = Low[Close.columns]

    print("Computing factors...")
    score = MoMFactor(Close)
    ATRs  = calculate_atr(High, Low, Close, 21).div(Close)

    market_regime = (
        Close["SPY"].div(Close["SPY"].rolling(200).mean()) - 1
    ).loc["2004":]
    market_regime = market_regime.where(market_regime >= 0, 0).where(market_regime <= 0, 1)

    print(f"Running {weighting} strategy...")
    result = portfolio_strategy(
        score=score,
        Close=Close,
        ATRs=ATRs,
        market_regime=market_regime,
        use_market_regime=False,
        percentile_rank=15,
        weighting=weighting,       # ← ATR or EW
        rebalance="W",
        initial_cash=100_000_000.0,
        StartingYear="2004",
        safe_asset="SHY",
        M=3,
        S=0.15,
    )

    pv  = result["portfolio_value"]
    pw  = result["portfolio_weights"]
    tw  = result["target_weights"]
    turnover   = result["turnover"]
    date_index = result["date_index"]

    spy_prices = Close["SPY"].reindex(pv.index).ffill()
    spy_value  = spy_prices / spy_prices.iloc[0] * float(pv.iloc[0])

    step   = max(1, len(pv) // 1200)
    pv_dd  = (pv - pv.cummax()) / pv.cummax()
    spy_dd = (spy_value - spy_value.cummax()) / spy_value.cummax()
    port_ts = [
        {"date": str(idx.date()),
         "value":              _s(float(pv.loc[idx])),
         "benchmark":          _s(float(spy_value.loc[idx])),
         "drawdown":           _s(float(pv_dd.loc[idx])),
         "benchmark_drawdown": _s(float(spy_dd.loc[idx]))}
        for i, idx in enumerate(pv.index)
        if i % step == 0 or i == len(pv) - 1
    ]

    strat_monthly = _monthly(pv)
    bench_monthly = _monthly(spy_value)
    rel_monthly   = _monthly_relative(strat_monthly, bench_monthly)

    strat_attr = _metrics(pv, spy_value)
    bench_attr = _metrics(spy_value)

    holdings_data = _holdings_ts(pw, top_n=15, max_pts=600)
    rebal_events  = _rebal_log(tw, pv)

    label = "ATR-Weighted" if weighting == "ATR" else "Equal-Weighted"

    return {
        "computed_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "weighting":   weighting,
        "config": {
            "start_date":      "2004-01-01",
            "end_date":        datetime.now().strftime("%Y-%m-%d"),
            "initial_capital": 100_000_000.0,
            "n_assets":        len(Close.columns),
            "rebalance":       "Weekly",
            "weighting":       label,
            "percentile_rank": 15,
            "weight_cap":      0.15,
        },
        "portfolio_ts":         port_ts,
        "attribution":          {"strategy": strat_attr, "benchmark": bench_attr},
        "monthly_returns":      {"strategy": strat_monthly, "benchmark": bench_monthly, "relative": rel_monthly},
        "holdings_ts":          holdings_data["ts"],
        "holdings_assets":      holdings_data["assets"],
        "current_holdings":     _current_holdings(pw, tw),
        "next_rebalance":       _next_rebalance(pw, tw, date_index),
        "turnover_ts":          _turnover_ts(turnover),
        "rebalance_log":        rebal_events,
        "historical_positions": _hist_positions(pw, pv),
        "summary_table":        result["table"],
    }


# ── Vercel HTTP handler ────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse ?w=ATR or ?w=EW from query string
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        mode   = params.get("w", ["ATR"])[0].upper()
        if mode not in ("ATR", "EW"):
            mode = "ATR"

        try:
            if not _cache_valid(mode):
                _cache[mode]["data"] = compute(mode)
                _cache[mode]["ts"]   = datetime.utcnow()
            body   = json.dumps(_cache[mode]["data"], cls=_Enc)
            status = 200
        except Exception as e:
            body   = json.dumps({"error": str(e), "traceback": traceback.format_exc()})
            status = 500

        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=21600")
        self.end_headers()
        self.wfile.write(body.encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def log_message(self, *args): pass
