from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import sys
import os
import traceback
import hashlib

_HERE = os.path.dirname(os.path.abspath(__file__))
_LIB  = os.path.join(_HERE, "_lib")
if _LIB not in sys.path:
    sys.path.insert(0, _LIB)

import numpy as np
import pandas as pd
from datetime import datetime

# Cache keyed by params hash
_cache: dict = {}
CACHE_SECONDS = 21600

def _cache_key(params: dict) -> str:
    return hashlib.md5(json.dumps(params, sort_keys=True).encode()).hexdigest()

def _cache_valid(key: str) -> bool:
    c = _cache.get(key, {})
    if not c.get("data") or not c.get("ts"): return False
    return (datetime.utcnow() - c["ts"]).total_seconds() < CACHE_SECONDS

class _Enc(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return None if (np.isnan(obj) or np.isinf(obj)) else float(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        if isinstance(obj, (pd.Timestamp, datetime)): return obj.strftime("%Y-%m-%d")
        if isinstance(obj, pd.Series): return obj.tolist()
        return super().default(obj)

def _s(v):
    if v is None: return None
    try:
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)): return None
        if isinstance(v, np.integer): return int(v)
        if isinstance(v, np.floating): return None if (np.isnan(v) or np.isinf(v)) else float(v)
    except: return None
    return v

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
            records.append({"dd": float(group.min()), "days": cal_days,
                             "start": str(peak_date.date()), "trough": str(group.idxmin().date()),
                             "recovery": str(recovery[0].date()) if len(recovery) > 0 else "Not yet recovered"})
        if not records: return []
        records.sort(key=lambda x: x["dd"])
        return [{k: (None if isinstance(v, float) and np.isnan(v) else v) for k,v in r.items()} for r in records[:3]]
    except: return []

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
        def _pr(d): return None if n < d else _s((values.iloc[-1] / values.iloc[-d]) - 1)
        def _pa(d): 
            if n < d: return None
            r = (values.iloc[-1] / values.iloc[-d]) - 1
            return _s((1 + r) ** (252 / d) - 1)
        today = values.index[-1]
        ytd_v = values[values.index >= datetime(today.year, 1, 1)]
        ytd   = _s((ytd_v.iloc[-1] / ytd_v.iloc[0]) - 1) if len(ytd_v) > 1 else None
        corr_ret = corr_dd = None
        if bench is not None:
            try:
                br = bench.pct_change().fillna(0); bdd = (bench - bench.cummax()) / bench.cummax()
                comm = ret.index.intersection(br.index); commd = dd_s.index.intersection(bdd.index)
                if len(comm) > 30:  corr_ret = _s(float(ret.loc[comm].corr(br.loc[comm])))
                if len(commd) > 30: corr_dd  = _s(float(dd_s.loc[commd].corr(bdd.loc[commd])))
            except: pass
        return {
            "cagr": _s(cagr), "total_return": _s(tr), "ytd": ytd,
            "1d": _pr(1), "1wk": _pr(5), "1m": _pr(21), "3m": _pr(63),
            "1yr": _pa(252), "3yr": _pa(756), "5yr": _pa(1260), "10yr": _pa(2520),
            "volatility": _s(vol), "sharpe": sh, "sortino": so, "max_dd": _s(mdd),
            "max_dd_days": top3[0]["days"] if top3 else None,
            "max_dd_rec":  top3[0].get("recovery") if top3 else None,
            "dd2": _s(top3[1]["dd"]) if len(top3) > 1 else None, "dd2_days": top3[1]["days"] if len(top3) > 1 else None,
            "dd3": _s(top3[2]["dd"]) if len(top3) > 2 else None, "dd3_days": top3[2]["days"] if len(top3) > 2 else None,
            "mar": _s(cagr / abs(mdd)) if mdd != 0 else None,
            "corr_ret": corr_ret, "corr_dd": corr_dd,
        }
    except: return {}

def _monthly(values: pd.Series) -> dict:
    try:
        MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        mo = values.resample("ME").last(); ret = mo.pct_change().fillna(0); out: dict = {}
        for ts, r in ret.items():
            y, m = str(ts.year), MONTHS[ts.month - 1]
            out.setdefault(y, {})[m] = _s(float(r))
        for y in out:
            yv = values[values.index.year == int(y)]
            if len(yv) > 1: out[y]["Year"] = _s((yv.iloc[-1] / yv.iloc[0]) - 1)
        return out
    except: return {}

def _monthly_relative(strat, bench):
    COLS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Year"]
    out = {}
    for y in set(strat) | set(bench):
        out[y] = {}
        for m in COLS:
            sv = strat.get(y, {}).get(m); bv = bench.get(y, {}).get(m)
            if sv is not None and bv is not None: out[y][m] = _s(sv - bv)
    return out

def _holdings_ts(pw, top_n=15, max_pts=600):
    try:
        avg_w = pw.mean().sort_values(ascending=False)
        assets = avg_w[avg_w > 0.001].head(top_n).index.tolist()
        sub = pw[assets].fillna(0); step = max(1, len(sub) // max_pts)
        rows = []
        for i, (idx, row) in enumerate(sub.iterrows()):
            if i % step != 0 and i != len(sub) - 1: continue
            r = {"date": str(idx.date())}
            for a in assets: r[a] = _s(float(row[a]))
            rows.append(r)
        return {"ts": rows, "assets": assets}
    except: return {"ts": [], "assets": []}

def _current_holdings(pw, tw):
    try:
        la = pw.iloc[-1].dropna(); lt = tw.iloc[-1].dropna() if tw is not None else pd.Series(dtype=float)
        assets = la[la > 0.001].index.union(lt[lt > 0.001].index)
        rows = [{"symbol": a, "current_weight": _s(float(la.get(a, 0))),
                 "target_weight": _s(float(lt.get(a, 0))),
                 "delta": _s(float(lt.get(a, 0) - la.get(a, 0)))} for a in sorted(assets)]
        rows.sort(key=lambda x: -(x["target_weight"] or 0))
        return rows
    except: return []

def _next_rebalance(pw, tw, date_index):
    try:
        la = pw.iloc[-1].fillna(0); lt = tw.iloc[-1].fillna(0)
        all_a = sorted(set(la[la > 0.001].index) | set(lt[lt > 0.001].index))
        rows = []
        for a in all_a:
            curr = float(la.get(a, 0)); tgt = float(lt.get(a, 0)); delta = tgt - curr
            action = ("BUY" if tgt > 0 and curr < 0.001 else "SELL" if tgt < 0.001 and curr > 0
                      else "INCREASE" if delta > 0.01 else "DECREASE" if delta < -0.01 else "HOLD")
            rows.append({"symbol": a, "current_weight": _s(curr), "target_weight": _s(tgt),
                         "delta": _s(delta), "action": action})
        rows.sort(key=lambda x: -(abs(x["delta"] or 0)))
        return rows
    except: return []

def _turnover_ts(turnover, max_pts=400):
    try:
        step = max(1, len(turnover) // max_pts)
        return [{"date": str(idx.date()), "turnover": _s(float(v))}
                for i, (idx, v) in enumerate(turnover.items()) if i % step == 0 or i == len(turnover) - 1]
    except: return []

def _rebal_log(tw, pv):
    try:
        rows = []; prev_tw = pd.Series(0.0, index=tw.columns)
        for d, row in tw.iterrows():
            pv_val = float(pv.loc[d]) if d in pv.index else 0
            delta = row - prev_tw
            events = [{"symbol": a, "prev_weight": _s(float(prev_tw.get(a,0))),
                       "new_weight": _s(float(row.get(a,0))), "delta": _s(float(delta.get(a,0))),
                       "action": "BUY" if delta.get(a,0) > 0 else "SELL",
                       "est_value": _s(float(delta.get(a,0)) * pv_val)}
                      for a in tw.columns if abs(float(delta.get(a,0))) > 0.005]
            if events: rows.append({"date": str(d.date()), "events": events, "n_changes": len(events)})
            prev_tw = row.copy()
        return rows
    except: return []

def _hist_positions(pw, pv):
    try:
        rows = []
        for m_idx in pv.resample("ME").last().index:
            cands = pv.index[pv.index <= m_idx]
            if cands.empty: continue
            idx = cands[-1]
            row = {"date": str(idx.date()), "portfolio_value": _s(float(pv.loc[idx]))}
            for col in pw.columns:
                v = pw.loc[idx, col] if idx in pw.index else 0
                if v and v > 0.001: row[col] = _s(float(v))
            rows.append(row)
        return rows
    except: return []


# ── Global data (downloaded once per lambda warm start) ──────────────────────
_market_data = {"Close": None, "High": None, "Low": None, "score": None, "ATRs": None, "ts": None}
DATA_CACHE_SECONDS = 21600

def _data_valid():
    return (_market_data["Close"] is not None and _market_data["ts"] is not None and
            (datetime.utcnow() - _market_data["ts"]).total_seconds() < DATA_CACHE_SECONDS)

def _load_market_data():
    import yfinance as yf
    from trading_utils import MoMFactor, calculate_atr

    ASSETS = [
        "XLI","QQQ","SPY","XLF","XLV","XLY","XLP","XLU","ITA","ITB",
        "IAT","RSP","SMH","IWM","MAGS","AAPL","AMZN","GOOG","TSLA","NVDA",
        "META","MSFT","SPMO","VOOG","VOOV","SPHQ","PRN",
        "EWL","EWG","EWU","EWC","EWA","EWQ","EWP","EWN","EWD","EWI",
        "EWJ","EWS","FEZ","IEFA","EIS",
        "EPU","EIDO","EPOL","EWM","EWT","EWW","EWY","EWZ","ILF","EZA",
        "GREK","TUR","UAE","KSA","ARGT","THD","EPHE","ECH","VNM","QAT","EMXC",
        "CNYA","MCHI","KWEB",
        "COPX","DBC","PICK","MOO","XLB","XLE",
        "INDA","SHY","IBIT","GLD","IAUM",
    ]
    print("Downloading market data...")
    raw = yf.download(tickers=ASSETS, start="2002-12-31",
                      end=datetime.now().strftime("%Y-%m-%d"),
                      auto_adjust=True, progress=False)
    Close = raw["Close"].ffill().dropna(axis=1, how="all")
    High  = raw["High"].ffill()[Close.columns]
    Low   = raw["Low"].ffill()[Close.columns]

    print("Computing factors...")
    score = MoMFactor(Close)
    ATRs  = calculate_atr(High, Low, Close, 21).div(Close)

    _market_data["Close"] = Close
    _market_data["High"]  = High
    _market_data["Low"]   = Low
    _market_data["score"] = score
    _market_data["ATRs"]  = ATRs
    _market_data["ts"]    = datetime.utcnow()
    print("Market data ready.")


def compute(params: dict) -> dict:
    from portfolio_strategy_lib import portfolio_strategy, REGION_MAP, ALL_REGIONS

    if not _data_valid():
        _load_market_data()

    Close = _market_data["Close"]
    score = _market_data["score"]
    ATRs  = _market_data["ATRs"]

    weighting       = params.get("weighting", "ATR")
    rebalance       = params.get("rebalance", "W")
    trend_filter    = bool(params.get("trend_filter", False))
    trend_threshold = float(params.get("trend_threshold", 0.0))
    regime_filter   = bool(params.get("regime_filter", False))
    regime_ma_type  = params.get("regime_ma_type", "SMA")
    regime_period   = int(params.get("regime_period", 200))
    asset_min       = params.get("asset_min_weights", {})
    asset_max       = params.get("asset_max_weights", {})
    region_min      = params.get("region_min", {})
    region_max      = params.get("region_max", {})

    market_regime = (Close["SPY"].div(Close["SPY"].rolling(200).mean()) - 1).loc["2004":]
    market_regime = market_regime.where(market_regime >= 0, 0).where(market_regime <= 0, 1)

    print(f"Running strategy: weighting={weighting} rebalance={rebalance} trend={trend_filter} regime={regime_filter}")
    result = portfolio_strategy(
        score=score, Close=Close, ATRs=ATRs,
        market_regime=market_regime,
        use_market_regime=False,
        percentile_rank=15,
        weighting=weighting,
        rebalance=rebalance,
        initial_cash=100_000_000.0,
        StartingYear="2004",
        safe_asset="SHY", M=3, S=0.15,
        trend_filter=trend_filter,
        trend_threshold=trend_threshold,
        regime_filter=regime_filter,
        regime_ma_type=regime_ma_type,
        regime_period=regime_period,
        asset_min_weights=asset_min,
        asset_max_weights=asset_max,
        region_min=region_min,
        region_max=region_max,
    )

    pv = result["portfolio_value"]; pw = result["portfolio_weights"]
    tw = result["target_weights"];   turnover = result["turnover"]
    date_index = result["date_index"]

    spy_prices = Close["SPY"].reindex(pv.index).ffill()
    spy_value  = spy_prices / spy_prices.iloc[0] * float(pv.iloc[0])

    step = max(1, len(pv) // 1200)
    pv_dd = (pv - pv.cummax()) / pv.cummax()
    spy_dd = (spy_value - spy_value.cummax()) / spy_value.cummax()
    port_ts = [
        {"date": str(idx.date()), "value": _s(float(pv.loc[idx])),
         "benchmark": _s(float(spy_value.loc[idx])),
         "drawdown": _s(float(pv_dd.loc[idx])),
         "benchmark_drawdown": _s(float(spy_dd.loc[idx]))}
        for i, idx in enumerate(pv.index) if i % step == 0 or i == len(pv) - 1
    ]

    strat_monthly = _monthly(pv); bench_monthly = _monthly(spy_value)
    holdings_data = _holdings_ts(pw, top_n=15)
    rebal_events  = _rebal_log(tw, pv)

    rebal_label = "Weekly" if rebalance in ("W","w") else "Monthly"
    w_label     = "ATR-Weighted" if weighting == "ATR" else "Equal-Weighted"

    # Build available assets list with regions for frontend
    available_assets = [{"symbol": a, "region": REGION_MAP.get(a, "OTHER")}
                        for a in sorted(Close.columns)]

    return {
        "computed_at":  datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "params":       params,
        "config": {
            "start_date": "2004-01-01", "end_date": datetime.now().strftime("%Y-%m-%d"),
            "initial_capital": 100_000_000.0, "n_assets": len(Close.columns),
            "rebalance": rebal_label, "weighting": w_label,
            "percentile_rank": 15, "weight_cap": 0.15,
        },
        "available_assets":     available_assets,
        "all_regions":          ALL_REGIONS,
        "portfolio_ts":         port_ts,
        "attribution":          {"strategy": _metrics(pv, spy_value), "benchmark": _metrics(spy_value)},
        "monthly_returns":      {"strategy": strat_monthly, "benchmark": bench_monthly,
                                 "relative": _monthly_relative(strat_monthly, bench_monthly)},
        "holdings_ts":          holdings_data["ts"],
        "holdings_assets":      holdings_data["assets"],
        "current_holdings":     _current_holdings(pw, tw),
        "next_rebalance":       _next_rebalance(pw, tw, date_index),
        "turnover_ts":          _turnover_ts(turnover),
        "rebalance_log":        rebal_events,
        "historical_positions": _hist_positions(pw, pv),
        "summary_table":        result["table"],
    }


DEFAULT_PARAMS = {
    "weighting": "ATR", "rebalance": "W",
    "trend_filter": False, "trend_threshold": 0.0,
    "regime_filter": False, "regime_ma_type": "SMA", "regime_period": 200,
    "asset_min_weights": {}, "asset_max_weights": {},
    "region_min": {}, "region_max": {},
}


class handler(BaseHTTPRequestHandler):
    def _run(self, params):
        key = _cache_key(params)
        try:
            if not _cache_valid(key):
                _cache[key] = {"data": compute(params), "ts": datetime.utcnow()}
            body   = json.dumps(_cache[key]["data"], cls=_Enc)
            status = 200
        except Exception as e:
            body   = json.dumps({"error": str(e), "traceback": traceback.format_exc()})
            status = 500
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body.encode())

    def do_GET(self):
        parsed = urlparse(self.path)
        qs     = parse_qs(parsed.query)
        params = dict(DEFAULT_PARAMS)
        if "w" in qs:    params["weighting"]  = qs["w"][0].upper()
        if "r" in qs:    params["rebalance"]  = qs["r"][0].upper()
        self._run(params)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)
        try:
            incoming = json.loads(body)
            params   = {**DEFAULT_PARAMS, **incoming}
        except Exception:
            params = dict(DEFAULT_PARAMS)
        self._run(params)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, *args): pass
