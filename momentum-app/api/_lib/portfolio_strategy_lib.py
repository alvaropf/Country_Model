"""
Momentum ETF rotation strategy with extended constraints.
"""
import numpy as np
import pandas as pd
from trading_utils import (
    MoMFactor, calculate_atr, CAGR, Annualized,
    volatility, Ratio, max_drawdown, get_period_multiplier
)

REGION_MAP = {
    "XLI": "US", "QQQ": "US", "SPY": "US", "XLF": "US", "XLV": "US",
    "XLY": "US", "XLP": "US", "XLU": "US", "ITA": "US", "ITB": "US",
    "IAT": "US", "RSP": "US", "SMH": "US", "IWM": "US", "SPMO": "US",
    "VOOG": "US", "VOOV": "US", "SPHQ": "US", "PRN": "US",
    "MAGS": "MAGS7", "AAPL": "MAGS7", "AMZN": "MAGS7", "GOOG": "MAGS7",
    "TSLA": "MAGS7", "NVDA": "MAGS7", "META": "MAGS7", "MSFT": "MAGS7",
    "EWL": "DM", "EWG": "DM", "EWU": "DM", "EWC": "DM", "EWA": "DM",
    "EWQ": "DM", "EWP": "DM", "EWN": "DM", "EWD": "DM", "EWI": "DM",
    "EWJ": "DM", "EWS": "DM", "FEZ": "DM", "IEFA": "DM", "EIS": "DM",
    "EPU": "EM", "EIDO": "EM", "EPOL": "EM", "EWM": "EM", "EWT": "EM",
    "EWW": "EM", "EWY": "EM", "EWZ": "EM", "ILF": "EM", "EZA": "EM",
    "GREK": "EM", "TUR": "EM", "UAE": "EM", "KSA": "EM", "ARGT": "EM",
    "THD": "EM", "EPHE": "EM", "ECH": "EM", "VNM": "EM", "QAT": "EM",
    "EMXC": "EM",
    "CNYA": "CHINA", "MCHI": "CHINA", "KWEB": "CHINA", "3110-HK": "CHINA",
    "COPX": "COMMODITIES", "DBC": "COMMODITIES", "PICK": "COMMODITIES",
    "MOO": "COMMODITIES", "XLB": "COMMODITIES", "XLE": "COMMODITIES",
    "INDA": "INDIA",
    "SHY": "CASH",
    "IBIT": "BITCOIN",
    "GLD": "GOLD",
    "IAUM": "GOLD",
}
ALL_REGIONS = sorted(set(REGION_MAP.values()))


def _apply_region_constraints(weights: pd.Series, region_min: dict, region_max: dict,
                               region_map: dict) -> pd.Series:
    """Clip region totals to [min, max] and renormalize."""
    if not region_min and not region_max:
        return weights
    w = weights.copy()
    # Iterative: cap regions that exceed max, then scale up regions below min
    for _ in range(20):
        changed = False
        for region in set(region_map.values()):
            assets_in = [a for a in w.index if region_map.get(a) == region]
            if not assets_in:
                continue
            rw = w[assets_in].sum()
            rmax = region_max.get(region, 1.0)
            rmin = region_min.get(region, 0.0)
            if rw > rmax + 1e-6:
                scale = rmax / rw if rw > 0 else 0
                w[assets_in] = w[assets_in] * scale
                changed = True
            elif rw < rmin - 1e-6 and rw > 0:
                scale = rmin / rw
                w[assets_in] = w[assets_in] * scale
                changed = True
        if not changed:
            break
    # Renormalize
    ws = w.sum()
    if ws > 0:
        w = w / ws
    return w


def portfolio_strategy(
    score,
    Close,
    ATRs,
    market_regime,
    use_market_regime=False,
    percentile_rank=15,
    weighting="ATR",
    Columns_Univ=None,
    rebalance="W",
    rebalanceperiods=12,
    StartingYear="2004",
    M=3,
    S=0.15,
    initial_cash=100_000_000.0,
    safe_asset="SHY",
    # ── New parameters ──────────────────────────────────────────────────
    trend_filter=False,
    trend_threshold=0.0,
    regime_filter=False,
    regime_ma_type="SMA",
    regime_period=200,
    asset_min_weights=None,
    asset_max_weights=None,
    region_min=None,
    region_max=None,
):
    if asset_min_weights is None: asset_min_weights = {}
    if asset_max_weights is None: asset_max_weights = {}
    if region_min is None:        region_min = {}
    if region_max is None:        region_max = {}

    # ── Timezone-strip ──────────────────────────────────────────────────────────
    for df in [Close, score, market_regime]:
        if hasattr(df.index, "tz_localize"):
            try:    df.index = df.index.tz_localize(None)
            except: df.index = df.index.tz_convert(None)

    if Columns_Univ is None:
        Columns_Univ = Close.columns.tolist()

    # ── Regime filter: SPY above MA ────────────────────────────────────────────
    spy_ma = None
    if regime_filter and "SPY" in Close.columns:
        if regime_ma_type.upper() == "EMA":
            spy_ma = Close["SPY"].ewm(span=regime_period, adjust=False).mean()
        else:
            spy_ma = Close["SPY"].rolling(window=regime_period, min_periods=1).mean()

    # ── Rebalancing date grid ──────────────────────────────────────────────────
    start_data = Close.loc[StartingYear:].index[0]
    end_data   = Close.loc[StartingYear:].index[-1]
    freq_map   = {"BM": "BME", "M": "BME", "W": "W-FRI", "2W": "2W-FRI", "D": "B", "BQ": "BQE"}
    freq       = freq_map.get(rebalance, rebalance)
    raw_dates  = pd.date_range(start=start_data, end=end_data, freq=freq, tz=None)

    avail = Close.loc[StartingYear:].index
    Date_Index = []
    for d in raw_dates:
        idx = avail.get_indexer([d], method="ffill")[0]
        if idx >= 0:
            Date_Index.append(avail[idx])
    Date_Index = sorted(list(set(Date_Index)))

    # ── Align score ────────────────────────────────────────────────────────────
    score_df = score.reindex(index=Date_Index).loc[StartingYear:, Columns_Univ].ffill()

    prev_dates = []
    for d in Date_Index:
        mask = Close.index < d
        prev_dates.append(Close.index[mask][-1] if mask.any() else d)

    regime_signals = market_regime.reindex(prev_dates, method="ffill").fillna(1)
    if not use_market_regime:
        regime_signals[:] = 1

    # ── Holdings selection ─────────────────────────────────────────────────────
    holdings = pd.DataFrame(False, index=score_df.index, columns=score_df.columns)

    for i in range(len(score_df)):
        current_score = score_df.iloc[i]
        prev_date     = prev_dates[i]
        regime        = float(regime_signals.iloc[i])

        # Regime filter: go to cash if SPY below MA
        if regime_filter and spy_ma is not None:
            spy_price = Close["SPY"].loc[prev_date] if prev_date in Close.index else np.nan
            spy_ma_val = spy_ma.loc[prev_date]      if prev_date in spy_ma.index else np.nan
            if pd.notna(spy_price) and pd.notna(spy_ma_val) and spy_price < spy_ma_val:
                holdings.iloc[i] = False
                if safe_asset in holdings.columns:
                    holdings.iloc[i][safe_asset] = True
                continue

        if regime == 0:
            buy = pd.Series(False, index=score_df.columns)
            if safe_asset in buy.index: buy[safe_asset] = True
            hold = buy.copy()
        else:
            # Trend filter: only consider assets where MomFactor > threshold
            eligible = current_score.copy()
            if trend_filter:
                eligible = eligible.where(eligible > trend_threshold, other=np.nan)

            ranks = eligible.rank(ascending=False, na_option="bottom")
            buy   = ranks <= percentile_rank
            hold  = ranks <= (percentile_rank + M)

        if i > 0:
            holdings.iloc[i] = (holdings.iloc[i - 1] & hold) | buy
        else:
            holdings.iloc[i] = buy

    # ── Target weights ─────────────────────────────────────────────────────────
    TW = holdings.astype(float)

    if weighting == "EW":
        pass
    elif weighting == "ATR":
        atr_rb = ATRs.reindex(index=Date_Index).loc[StartingYear:, Columns_Univ].ffill()
        atr_rb = atr_rb.replace(0, np.nan)
        TW = TW.div(atr_rb)
    else:
        TW = TW.mul(score_df.clip(lower=0), axis=0)

    # Safe-asset override on regime-off days
    for i, d in enumerate(Date_Index):
        if float(regime_signals.iloc[i]) == 0:
            TW.loc[d] = 0.0
            if safe_asset in TW.columns: TW.loc[d, safe_asset] = 1.0

    TW = TW.clip(lower=0)
    wsum = TW.sum(axis=1).replace(0, 1)
    TW   = TW.div(wsum, axis=0)

    # ── Per-asset min/max constraints ──────────────────────────────────────────
    for i, d in enumerate(TW.index):
        row = TW.loc[d].copy()
        held = row[row > 0].index.tolist()
        if not held:
            continue
        # Apply per-asset maximums (use S as global fallback)
        for a in TW.columns:
            amax = asset_max_weights.get(a, S)
            if row.get(a, 0) > amax:
                row[a] = amax
        # Apply per-asset minimums (only for held assets)
        for a in held:
            amin = asset_min_weights.get(a, 0.0)
            if row.get(a, 0) < amin:
                row[a] = amin
        # Renormalize
        rs = row.sum()
        if rs > 0: row = row / rs
        # Apply region constraints
        row = _apply_region_constraints(row, region_min, region_max, REGION_MAP)
        TW.loc[d] = row

    # ── Daily simulation ───────────────────────────────────────────────────────
    all_dates = Close.loc[Date_Index[0]:].index
    shares    = pd.DataFrame(0.0, index=all_dates, columns=TW.columns)
    cash      = pd.Series(0.0, index=all_dates)
    pv        = pd.Series(0.0, index=all_dates)

    first_prices = Close.loc[shares.index[0], TW.columns].replace(0, np.nan)
    shares.iloc[0] = (initial_cash * TW.iloc[0] / first_prices).fillna(0).apply(np.floor)
    cash.iloc[0]   = initial_cash - (shares.iloc[0] * first_prices.fillna(0)).sum()
    pv.iloc[0]     = (shares.iloc[0] * first_prices.fillna(0)).sum() + cash.iloc[0]

    rebal_set = set(Date_Index)
    rb_lookup = {d: i for i, d in enumerate(Date_Index)}

    for i in range(1, len(all_dates)):
        d    = all_dates[i]
        prev = all_dates[i - 1]
        prices = Close.loc[d, TW.columns].replace(0, np.nan).fillna(
                 Close.loc[prev, TW.columns].replace(0, np.nan))
        pv.iloc[i] = (shares.iloc[i - 1] * prices).sum() + cash.iloc[i - 1]
        if d in rebal_set:
            rb_i  = rb_lookup[d]
            tgt   = TW.iloc[rb_i]
            shares.loc[d] = (pv.iloc[i] * tgt / prices.replace(0, np.nan)).fillna(0).apply(np.floor)
        else:
            shares.loc[d] = shares.loc[prev]
        cash.iloc[i] = pv.iloc[i] - (shares.iloc[i] * prices.fillna(0)).sum()

    # ── Derived series ─────────────────────────────────────────────────────────
    pw      = shares.mul(Close.loc[all_dates, TW.columns].replace(0, np.nan)).div(pv, axis=0)
    returns = pv.pct_change()

    mult     = get_period_multiplier(rebalance)
    adj_per  = max(int(rebalanceperiods * mult / 12), 1)
    rebal_pw = pw.loc[Date_Index]
    turnover = rebal_pw.diff().abs().sum(axis=1).rolling(adj_per, min_periods=1).sum().div(2)
    turnover = turnover * (mult / adj_per)

    monthly_pv = pv.resample("ME").last()
    table = {
        "CAGR":     round(CAGR(monthly_pv.loc[StartingYear:]) * 100, 2),
        "10Y":      round(Annualized(monthly_pv.loc[StartingYear:], 10) * 100, 2),
        "5Y":       round(Annualized(monthly_pv.loc[StartingYear:],  5) * 100, 2),
        "1Y":       round(Annualized(monthly_pv.loc[StartingYear:],  1) * 100, 2),
        "Vol":      round(volatility(pv.loc[StartingYear:]) * 100, 2),
        "Sortino":  round(Ratio(monthly_pv.loc[StartingYear:], 0.03), 3),
        "MaxDD":    round(max_drawdown(pv.loc[StartingYear:]) * 100, 2),
        "Turnover": round(turnover.loc[StartingYear:].mean() * 100, 1),
    }

    return {
        "portfolio_value":   pv,
        "portfolio_weights": pw,
        "shares":            shares,
        "turnover":          turnover,
        "returns":           returns,
        "table":             table,
        "regime_signals":    regime_signals,
        "target_weights":    TW,
        "date_index":        Date_Index,
    }
