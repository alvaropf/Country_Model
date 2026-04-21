"""
Momentum ETF rotation strategy.
Ported from the original notebook implementation.
"""
import numpy as np
import pandas as pd
from trading_utils import (
    MoMFactor, calculate_atr, CAGR, Annualized,
    volatility, Ratio, max_drawdown, get_period_multiplier
)


def portfolio_strategy(
    score,
    Close,
    ATRs,
    market_regime,
    use_market_regime=True,
    percentile_rank=10,
    weighting="Alpha",
    Columns_Univ=None,
    rebalance="BM",
    rebalanceperiods=12,
    StartingYear="2014",
    M=3,
    S=0.15,
    initial_cash=1_000_000.0,
    safe_asset="SHY",
):
    # ── Timezone-strip ──────────────────────────────────────────────────────────
    for df in [Close, score, market_regime]:
        if hasattr(df.index, "tz_localize"):
            try:
                df.index = df.index.tz_localize(None)
            except TypeError:
                df.index = df.index.tz_convert(None)

    if Columns_Univ is None:
        Columns_Univ = Close.columns.tolist()

    # ── Rebalancing date grid ──────────────────────────────────────────────────
    start_data = Close.loc[StartingYear:].index[0]
    end_data   = Close.loc[StartingYear:].index[-1]
    freq_map   = {"BM": "BME", "W": "W-FRI", "2W": "2W-FRI", "D": "B", "BQ": "BQE"}
    freq       = freq_map.get(rebalance, rebalance)
    raw_dates  = pd.date_range(start=start_data, end=end_data, freq=freq, tz=None)

    avail = Close.loc[StartingYear:].index
    Date_Index = []
    for d in raw_dates:
        idx = avail.get_indexer([d], method="ffill")[0]
        if idx >= 0:
            Date_Index.append(avail[idx])
    Date_Index = sorted(list(set(Date_Index)))

    # ── Align score to rebalancing dates ───────────────────────────────────────
    score_df = score.reindex(index=Date_Index).loc[StartingYear:, Columns_Univ].ffill()

    # ── Market regime: use prior day's signal ─────────────────────────────────
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
        ranks = score_df.iloc[i].rank(ascending=False)
        regime = float(regime_signals.iloc[i])
        if regime == 1:
            buy  = ranks <= percentile_rank
            hold = ranks <= (percentile_rank + M)
        else:
            buy  = pd.Series(False, index=score_df.columns)
            if safe_asset in buy.index:
                buy[safe_asset] = True
            hold = buy.copy()
        if i > 0:
            holdings.iloc[i] = (holdings.iloc[i - 1] & hold) | buy
        else:
            holdings.iloc[i] = buy

    # ── Target weights ─────────────────────────────────────────────────────────
    TW = holdings.astype(float)

    if weighting == "EW":
        pass  # TW already 0/1
    elif weighting == "Alpha":
        TW = TW.mul(score_df.clip(lower=0), axis=0)
    elif weighting == "ATR":
        atr_rb = ATRs.reindex(index=Date_Index).loc[StartingYear:, Columns_Univ].ffill()
        atr_rb = atr_rb.replace(0, np.nan)
        TW = TW.div(atr_rb)
    else:
        raise ValueError(f"Unknown weighting: {weighting}")

    # Force safe-asset-only on risk-off dates
    for i, d in enumerate(Date_Index):
        if float(regime_signals.iloc[i]) == 0:
            TW.loc[d] = 0.0
            if safe_asset in TW.columns:
                TW.loc[d, safe_asset] = 1.0

    TW = TW.clip(lower=0)
    wsum = TW.sum(axis=1).replace(0, 1)
    TW   = TW.div(wsum, axis=0)

    # ── Per-asset weight cap with redistribution ──────────────────────────────
    for i, d in enumerate(TW.index):
        if float(regime_signals.iloc[i]) == 0:
            continue
        for _ in range(100):
            over = TW.loc[d][TW.loc[d] > S]
            if over.empty:
                break
            for etf in over.index:
                excess = TW.loc[d, etf] - S
                TW.loc[d, etf] = S
                below = TW.loc[d] < S
                if below.sum() > 0:
                    bw = TW.loc[d][below]
                    bs = bw.sum()
                    if bs > 0:
                        TW.loc[d, below] += bw / bs * excess

    # ── Daily simulation ───────────────────────────────────────────────────────
    all_dates = Close.loc[Date_Index[0]:].index
    shares    = pd.DataFrame(0.0, index=all_dates, columns=TW.columns)
    cash      = pd.Series(0.0, index=all_dates)
    pv        = pd.Series(0.0, index=all_dates)

    # Initialise
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
            rb_i = rb_lookup[d]
            tgt  = TW.iloc[rb_i]
            shares.loc[d] = (pv.iloc[i] * tgt / prices.replace(0, np.nan)).fillna(0).apply(np.floor)
        else:
            shares.loc[d] = shares.loc[prev]
        cash.iloc[i] = pv.iloc[i] - (shares.iloc[i] * prices.fillna(0)).sum()

    # ── Derived series ─────────────────────────────────────────────────────────
    pw      = shares.mul(Close.loc[all_dates, TW.columns].replace(0, np.nan)).div(pv, axis=0)
    returns = pv.pct_change()

    # Turnover
    rebal_pw  = pw.loc[Date_Index]
    mult      = get_period_multiplier(rebalance)
    adj_per   = max(int(rebalanceperiods * mult / 12), 1)
    turnover  = rebal_pw.diff().abs().sum(axis=1).rolling(adj_per, min_periods=1).sum().div(2)
    turnover  = turnover * (mult / adj_per)

    # Summary stats table
    monthly_pv = pv.resample("ME").last()
    table = {
        "CAGR":    round(CAGR(monthly_pv.loc[StartingYear:]) * 100, 2),
        "10Y":     round(Annualized(monthly_pv.loc[StartingYear:], 10) * 100, 2),
        "5Y":      round(Annualized(monthly_pv.loc[StartingYear:],  5) * 100, 2),
        "1Y":      round(Annualized(monthly_pv.loc[StartingYear:],  1) * 100, 2),
        "Vol":     round(volatility(pv.loc[StartingYear:]) * 100, 2),
        "Sortino": round(Ratio(monthly_pv.loc[StartingYear:], 0.03), 3),
        "MaxDD":   round(max_drawdown(pv.loc[StartingYear:]) * 100, 2),
        "Turnover":round(turnover.loc[StartingYear:].mean() * 100, 1),
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
