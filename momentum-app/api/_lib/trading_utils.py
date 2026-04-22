import numpy as np
import pandas as pd


# ── Momentum Factor ────────────────────────────────────────────────────────────
def MoMFactor(Close, periods=None):
    """
    Average cross-sectional rank of momentum across multiple lookback periods.
    Each period is in months (approximated as 21 trading days).
    Shift 1 month to avoid short-term reversal (standard practitioner approach).
    """
    if periods is None:
        periods = [1, 3, 6, 12]
    monthly = Close.resample("ME").last()
    score_list = []
    for p in periods:
        ret = monthly.pct_change(p).shift(1)   # shift 1 month
        score_list.append(ret.rank(axis=1, pct=True))
    avg = pd.concat(score_list).groupby(level=0).mean()
    # Reindex to daily, forward-fill so we have a score every trading day
    return avg.reindex(Close.index).ffill()


# ── RSI ────────────────────────────────────────────────────────────────────────
def RSI_function(Close, period=14):
    delta = Close.diff()
    gain  = delta.where(delta > 0, 0.0)
    loss  = (-delta).where(delta < 0, 0.0)
    alpha = 1.0 / period
    avg_gain = gain.ewm(alpha=alpha, adjust=False).mean()
    avg_loss = loss.ewm(alpha=alpha, adjust=False).mean()
    rs  = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


# ── ATR ────────────────────────────────────────────────────────────────────────
def calculate_atr(High, Low, Close, period=21):
    """Calculate ATR for each column independently."""
    atr_dict = {}
    for col in Close.columns:
        h = High[col]
        l = Low[col]
        c = Close[col]
        hl = h - l
        hc = (h - c.shift(1)).abs()
        lc = (l - c.shift(1)).abs()
        tr = pd.concat([hl, hc, lc], axis=1).max(axis=1)
        atr_dict[col] = tr.rolling(window=period, min_periods=1).mean()
    return pd.DataFrame(atr_dict)



# ── Performance statistics ─────────────────────────────────────────────────────
def CAGR(series):
    """Compound Annual Growth Rate from a value series."""
    series = series.dropna()
    if len(series) < 2:
        return 0.0
    years = len(series) / 12   # assume monthly series
    total = series.iloc[-1] / series.iloc[0]
    return float(total ** (1 / years) - 1)


def Annualized(series, years):
    """Annualized return over the last N years (monthly series)."""
    series = series.dropna()
    n_periods = int(years * 12)
    if len(series) < n_periods:
        return np.nan
    sub = series.iloc[-n_periods:]
    total = sub.iloc[-1] / sub.iloc[0]
    return float(total ** (1 / years) - 1)


def volatility(series):
    """Annualized volatility from a daily value series."""
    ret = series.pct_change().dropna()
    return float(ret.std() * np.sqrt(252))


def Ratio(series, rf=0.03):
    """
    Sortino ratio from a monthly value series.
    rf = annual risk-free rate.
    """
    ret = series.pct_change().dropna()
    excess = ret - rf / 12
    downside = ret[ret < 0].std() * np.sqrt(12)
    if downside == 0:
        return np.nan
    return float((ret.mean() * 12 - rf) / downside)


def max_drawdown(series):
    """Maximum drawdown from a daily or monthly value series."""
    roll_max = series.cummax()
    dd = (series - roll_max) / roll_max
    return float(dd.min())


def get_period_multiplier(rebalance):
    """Number of rebalancing periods per year."""
    mapping = {
        "D":  252,
        "W":  52,
        "2W": 26,
        "BM": 12,
        "BQ": 4,
    }
    return mapping.get(rebalance, 12)


def calculate_odds(x):
    """Fraction of positive observations in a rolling window."""
    return (x > 0).sum() / len(x) if len(x) > 0 else 0.0
