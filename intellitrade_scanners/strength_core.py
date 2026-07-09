# coding: utf-8
"""
IntelliTrade Currency Strength Core — verbatim copy of v1.5.2 algorithm.
Only adaptation: scan_pair accepts fetch_fn + tf1/tf2 keys instead of calling
fetch_df directly, so the same core works for both D1/H4 and H1/M15 scanners.
All function bodies are character-for-character copies of the original.
"""

import math, itertools
import numpy as np
import pandas as pd

SCANNER_VERSION = "1.5.2-vps"

CURRENCIES = ["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"]

DEFAULT_PAIRS = [
    "EURUSD","GBPUSD","AUDUSD","NZDUSD","USDJPY","USDCHF","USDCAD",
    "EURGBP","EURJPY","EURAUD","EURNZD","EURCHF","EURCAD",
    "GBPJPY","GBPAUD","GBPNZD","GBPCHF","GBPCAD",
    "AUDJPY","AUDNZD","AUDCHF","AUDCAD",
    "NZDJPY","NZDCHF","NZDCAD",
    "CHFJPY","CADJPY","CADCHF"
]


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    h, l, c = df["high"].values, df["low"].values, df["close"].values
    prev_close = np.concatenate([[c[0]], c[:-1]])
    tr = np.maximum.reduce([h-l, np.abs(h-prev_close), np.abs(l-prev_close)])
    return pd.Series(tr).ewm(alpha=1/period, adjust=False).mean()

def choppiness(df: pd.DataFrame, period: int = 14) -> float:
    if len(df) < period+1:
        return 100.0
    sub = df.iloc[-period-1:]
    h, l, c = sub["high"].values, sub["low"].values, sub["close"].values
    prev_close = np.concatenate([[c[0]], c[:-1]])
    tr = np.maximum.reduce([h-l, np.abs(h-prev_close), np.abs(l-prev_close)])
    denom = (h.max() - l.min())
    if denom <= 0:
        return 100.0
    val = 100.0 * (math.log10(tr.sum() / denom) / math.log10(period))
    return float(np.clip(val, 0, 100))

def adx(df: pd.DataFrame, period: int = 14) -> float:
    if len(df) < period+2:
        return 0.0
    high = df["high"].values
    low  = df["low"].values
    close = df["close"].values
    up = high[1:] - high[:-1]
    down = low[:-1] - low[1:]
    plusDM  = np.where((up > down) & (up > 0), up, 0.0)
    minusDM = np.where((down > up) & (down > 0), down, 0.0)
    tr1 = np.maximum.reduce([high[1:]-low[1:], np.abs(high[1:]-close[:-1]), np.abs(low[1:]-close[:-1])])
    atr_n = pd.Series(tr1).ewm(alpha=1/period, adjust=False).mean()
    plusDI = 100 * (pd.Series(plusDM).ewm(alpha=1/period, adjust=False).mean() / atr_n)
    minusDI = 100 * (pd.Series(minusDM).ewm(alpha=1/period, adjust=False).mean() / atr_n)
    dx = 100 * ( (plusDI - minusDI).abs() / (plusDI + minusDI).replace(0, np.nan) ).fillna(0)
    adx_val = dx.ewm(alpha=1/period, adjust=False).mean().iloc[-1]
    return float(np.clip(adx_val, 0, 100))

def pivot_points(df: pd.DataFrame, depth_hi: int, depth_lo: int):
    H = df["high"].values; L = df["low"].values
    piv = []
    n = len(df)
    for i in range(n):
        lo = max(0, i-depth_hi); hi = min(n, i+depth_hi+1)
        if i>=depth_hi and i < n-depth_hi and H[i] == np.max(H[lo:hi]):
            piv.append({"idx": i, "price": float(H[i]), "type": "H"})
        lo = max(0, i-depth_lo); hi = min(n, i+depth_lo+1)
        if i>=depth_lo and i < n-depth_lo and L[i] == np.min(L[lo:hi]):
            piv.append({"idx": i, "price": float(L[i]), "type": "L"})
    piv.sort(key=lambda x: x["idx"])
    alt = []
    for p in piv:
        if not alt:
            alt.append(p); continue
        if alt[-1]["type"] == p["type"]:
            if p["type"]=="H" and p["price"]>=alt[-1]["price"]:
                alt[-1]=p
            elif p["type"]=="L" and p["price"]<=alt[-1]["price"]:
                alt[-1]=p
        else:
            alt.append(p)
    return alt

def merge_nearby(pivots, tol_price: float):
    if not pivots: return pivots
    out = [pivots[0]]
    for p in pivots[1:]:
        if out and out[-1]["type"]==p["type"] and abs(out[-1]["price"]-p["price"])<=tol_price:
            if p["type"]=="H":
                best = p if p["price"]>=out[-1]["price"] else out[-1]
            else:
                best = p if p["price"]<=out[-1]["price"] else out[-1]
            out[-1]=best
        else:
            out.append(p)
    return out

def detect_trend_sequence(df: pd.DataFrame,
                          depth_hi:int=3, depth_lo:int=1,
                          bos_excess_atr:float=0.04, bos_excess_pips:float=0.5,
                          merge_atr:float=0.06, merge_pips:float=1.0):
    w_atr = atr(df, 14).iloc[-1]
    piv = pivot_points(df, depth_hi, depth_lo)
    tol = float(merge_atr)*float(w_atr) + float(merge_pips)*1e-4
    piv = merge_nearby(piv, tol)
    if len(piv)<3:
        return {"trend":"neutral","last_bos_price":None,"last_bos_time":None,"pivots":piv}

    def bos_up(price, level):
        return price > level + (bos_excess_atr*w_atr + bos_excess_pips*1e-4)
    def bos_down(price, level):
        return price < level - (bos_excess_atr*w_atr + bos_excess_pips*1e-4)

    trend = "neutral"
    last_HL = None; last_LH = None
    last_BOS_price = None; last_BOS_time = None

    i = 0
    n = len(piv)
    while i < n-2:
        a, b, c = piv[i], piv[i+1], piv[i+2]
        if a["type"]=="L" and b["type"]=="H" and c["type"]=="L":
            hi_after_c = df["high"].iloc[c["idx"]+1:].max() if c["idx"]+1 < len(df) else df["high"].iloc[-1]
            if bos_up(hi_after_c, b["price"]):
                trend="bullish"; last_HL=c; last_LH=None
                last_BOS_price=b["price"]; last_BOS_time=df["time"].iloc[b["idx"]]
        if a["type"]=="H" and b["type"]=="L" and c["type"]=="H":
            lo_after_c = df["low"].iloc[c["idx"]+1:].min() if c["idx"]+1 < len(df) else df["low"].iloc[-1]
            if bos_down(lo_after_c, b["price"]):
                trend="bearish"; last_LH=c; last_HL=None
                last_BOS_price=b["price"]; last_BOS_time=df["time"].iloc[b["idx"]]
        i += 1

    if trend=="bullish" and last_HL is not None:
        fut_l = df["low"].iloc[last_HL["idx"]+1:]
        if len(fut_l)>0 and bos_down(fut_l.min(), last_HL["price"]):
            trend="bearish"
    if trend=="bearish" and last_LH is not None:
        fut_h = df["high"].iloc[last_LH["idx"]+1:]
        if len(fut_h)>0 and bos_up(fut_h.max(), last_LH["price"]):
            trend="bullish"

    return {
        "trend": trend,
        "last_bos_price": last_BOS_price,
        "last_bos_time": str(last_BOS_time) if last_BOS_time is not None else None,
        "pivots": piv[-12:]
    }

def sign_from_label(label:str)->int:
    return 1 if label=="bullish" else -1 if label=="bearish" else 0

def compute_confidence(pair_label:str, d1_df:pd.DataFrame, h4_df:pd.DataFrame,
                       use_adx=False, adx_d1_min=20, adx_h4_min=18,
                       use_chop=False, chop_d1_max=55, chop_h4_max=58,
                       use_avwap_accept=False, accept_d1_bars=1, accept_h4_bars=3, accept_atr_band=0.20,
                       triangle_penalty_ratio=0.0, penalty_adx=0.6, penalty_chop=0.7, penalty_avwap=0.6, penalty_triangle=0.8):
    if pair_label=="neutral":
        return 0.0
    conf = 100.0
    if use_adx:
        adx_d = adx(d1_df); adx_h = adx(h4_df)
        if (adx_d < adx_d1_min) or (adx_h < adx_h4_min):
            conf *= penalty_adx
    if use_chop:
        chop_d = choppiness(d1_df); chop_h = choppiness(h4_df)
        if (chop_d > chop_d1_max) or (chop_h > chop_h4_max):
            conf *= penalty_chop
    if use_avwap_accept:
        def avwap_ok(df, bars:int, label:str):
            sub = df.iloc[-max(bars,2):]
            vol = sub["tick_vol"].astype(float).values
            typical = (sub["high"]+sub["low"]+sub["close"]).values/3.0
            vv = pd.Series(vol).replace(0, np.nan).ffill()
            vwap = (typical*vv).sum() / (vv.sum() if vv.sum()!=0 else 1.0)
            a = atr(df, 14).iloc[-1]
            band = accept_atr_band * a
            close = df["close"].iloc[-1]
            return (close >= vwap - band) if label=="bullish" else (close <= vwap + band)
        ok_d = avwap_ok(d1_df, accept_d1_bars, pair_label)
        ok_h = avwap_ok(h4_df, accept_h4_bars, pair_label)
        if not (ok_d or ok_h):
            conf *= penalty_avwap
    if triangle_penalty_ratio>0:
        conf *= (1.0 - triangle_penalty_ratio*(1.0 - penalty_triangle))
    return max(0.0, min(100.0, conf))

def scan_pair(symbol:str,
              tf1_key:str, tf2_key:str,
              d1_depth, h4_depth,
              bos_excess_d1:tuple, bos_excess_h4:tuple,
              merge_d1:tuple, merge_h4:tuple,
              use_indicators:dict, penalties:dict,
              fetch_fn,
              tf1_bars:int=1200, tf2_bars:int=1500):
    d1 = fetch_fn(symbol, tf1_key, tf1_bars)
    h4 = fetch_fn(symbol, tf2_key, tf2_bars)
    t_d1 = detect_trend_sequence(d1, d1_depth[0], d1_depth[1], bos_excess_d1[0], bos_excess_d1[1], merge_d1[0], merge_d1[1])
    t_h4 = detect_trend_sequence(h4, h4_depth[0], h4_depth[1], bos_excess_h4[0], bos_excess_h4[1], merge_h4[0], merge_h4[1])
    d_d1, d_h4 = t_d1["trend"], t_h4["trend"]
    if d_d1=="bullish" and d_h4=="bullish":
        pair = "bullish"
    elif d_d1=="bearish" and d_h4=="bearish":
        pair = "bearish"
    else:
        pair = "neutral"
    conf = compute_confidence(
        pair, d1, h4,
        use_adx=use_indicators.get("use_adx",False),
        adx_d1_min=use_indicators.get("adx_d1_min",20),
        adx_h4_min=use_indicators.get("adx_h4_min",18),
        use_chop=use_indicators.get("use_chop",False),
        chop_d1_max=use_indicators.get("chop_d1_max",55),
        chop_h4_max=use_indicators.get("chop_h4_max",58),
        use_avwap_accept=use_indicators.get("use_avwap_accept",False),
        accept_d1_bars=use_indicators.get("accept_d1_bars",1),
        accept_h4_bars=use_indicators.get("accept_h4_bars",3),
        accept_atr_band=use_indicators.get("accept_atr_band",0.20),
        triangle_penalty_ratio=0.0,
        penalty_adx=penalties.get("penalty_adx",0.6),
        penalty_chop=penalties.get("penalty_chop",0.7),
        penalty_avwap=penalties.get("penalty_avwap",0.6),
        penalty_triangle=penalties.get("penalty_triangle",0.8),
    )
    info = {
        "tf1": d_d1, "tf2": d_h4, "pair": pair,
        "confidence": conf,
        "last_bos_tf1": t_d1["last_bos_price"], "last_bos_tf1_time": t_d1["last_bos_time"],
        "last_bos_tf2": t_h4["last_bos_price"], "last_bos_tf2_time": t_h4["last_bos_time"],
        "last_candle_tf1_time": str(d1["time"].iloc[-1]) if not d1.empty else None,
        "last_candle_tf2_time": str(h4["time"].iloc[-1]) if not h4.empty else None,
        "last_candle_tf1_close": float(d1["close"].iloc[-1]) if not d1.empty else 0.0,
    }
    return info

def triangle_inconsistency(all_pairs:dict):
    signs = {p: sign_from_label(info["pair"]) for p,info in all_pairs.items()}
    def s(pair):
        if pair in signs: return signs[pair]
        a,b = pair[:3], pair[-3:]
        inv = b+a
        if inv in signs: return -signs[inv]
        return 0
    cur = CURRENCIES
    tri_list = []
    for a,b,c in itertools.permutations(cur,3):
        if a<b<c:
            tri_list.append((f"{a}{b}", f"{b}{c}", f"{a}{c}"))
    usage = {p: {"bad":0,"tot":0} for p in all_pairs.keys()}
    for x,y,z in tri_list:
        sx, sy, sz = s(x), s(y), s(z)
        if sx==0 or sy==0 or sz==0:
            continue
        ok = (sx*sy)==sz
        for p in (x,y,z):
            k = p if p in all_pairs else (p[3:]+p[:3])
            if k in usage:
                usage[k]["tot"] += 1
                if not ok: usage[k]["bad"] += 1
    return {p: (v["bad"]/v["tot"] if v["tot"]>0 else 0.0) for p,v in usage.items()}

def aggregate_currencies(pairs_info:dict, weighted:bool=False):
    agg = {c: {"wpos":0.0,"wneg":0.0,"tot":0.0,"cnt":0,"avg_conf":0.0} for c in CURRENCIES}
    for sym,info in pairs_info.items():
        base, quote = sym[:3], sym[-3:]
        label = info["pair"]
        conf = float(info.get("confidence",0.0))/100.0
        w = conf if weighted else 1.0 if label!="neutral" else 0.0
        if label=="bullish":
            agg[base]["wpos"] += w; agg[quote]["wneg"] += w
            agg[base]["tot"]  += w; agg[quote]["tot"]  += w
        elif label=="bearish":
            agg[base]["wneg"] += w; agg[quote]["wpos"] += w
            agg[base]["tot"]  += w; agg[quote]["tot"]  += w
        if label!="neutral":
            agg[base]["cnt"] += 1; agg[quote]["cnt"] += 1
            agg[base]["avg_conf"] += conf; agg[quote]["avg_conf"] += conf
    rows = {}
    for c,a in agg.items():
        score = 0.0 if a["tot"]==0 else 100.0*((a["wpos"]-a["wneg"])/a["tot"])
        bias = "Strong" if score>15 else "Weak" if score<-15 else "Neutral"
        rows[c] = {
            "bias": bias, "score": round(score,2),
            "strong_w": round(a["wpos"],2), "weak_w": round(a["wneg"],2), "considered_w": round(a["tot"],2),
            "avg_conf": round((a["avg_conf"]/a["cnt"])*100,1) if a["cnt"]>0 else 0.0
        }
    return rows
