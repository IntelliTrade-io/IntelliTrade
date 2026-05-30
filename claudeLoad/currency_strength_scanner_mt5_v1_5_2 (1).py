# coding: utf-8
"""
IntelliTrade Currency Strength Scanner (Weekly/Daily view)
v1.5.2 — Robust MT5 fetch (symbol select + warmup + retries) + warning fix
Timeframes: D1 (higher), H4 (lower)
- Sequence-aware trend logic (HL->HH, LH->LL), BOS (wick + small excess) flips only
- Soft-gate indicators: ADX, CHOP, AVWAP acceptance, Triangle consistency (confidence weighting only)
- Currency aggregation: raw or confidence-weighted ("Trusted") via --weighted-aggregation
"""

import argparse, os, sys, json, math, itertools, time, datetime as dt
import numpy as np
import pandas as pd

try:
    import MetaTrader5 as mt5
except Exception as e:
    print("MetaTrader5 package is required. pip install MetaTrader5", file=sys.stderr)
    raise

CURRENCIES = ["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"]
DEFAULT_PAIRS = [
    "EURUSD","GBPUSD","AUDUSD","NZDUSD","USDJPY","USDCHF","USDCAD",
    "EURGBP","EURJPY","EURAUD","EURNZD","EURCHF","EURCAD",
    "GBPJPY","GBPAUD","GBPNZD","GBPCHF","GBPCAD",
    "AUDJPY","AUDNZD","AUDCHF","AUDCAD",
    "NZDJPY","NZDCHF","NZDCAD",
    "CHFJPY","CADJPY","CADCHF"
]

TF_MAP = {"1day": mt5.TIMEFRAME_D1, "4hour": mt5.TIMEFRAME_H4, "1hour": mt5.TIMEFRAME_H1, "15min": mt5.TIMEFRAME_M15}

def ensure_symbol(symbol: str) -> str:
    info = mt5.symbol_info(symbol)
    if info is None:
        if not mt5.symbol_select(symbol, True):
            time.sleep(0.2)
            mt5.symbol_select(symbol, True)
    else:
        if not info.visible:
            mt5.symbol_select(symbol, True)
    return symbol

def warmup_history(symbol: str, timeframe_key: str, bars: int = 50, retries: int = 2, wait: float = 0.20) -> bool:
    tf = TF_MAP[timeframe_key]
    ok = None
    for _ in range(max(1, retries)):
        ok = mt5.copy_rates_from_pos(symbol, tf, 0, bars)
        if ok is not None and len(ok) > 0:
            return True
        time.sleep(wait)
    return False

def fetch_df(symbol: str, timeframe_key: str, bars: int, max_retries: int = 3, retry_wait: float = 0.25) -> pd.DataFrame:
    tf = TF_MAP[timeframe_key]
    ensure_symbol(symbol)
    warmup_history(symbol, timeframe_key, bars=min(50, bars), retries=2, wait=retry_wait)

    last_err = None
    for attempt in range(max_retries):
        rates = mt5.copy_rates_from_pos(symbol, tf, 0, bars)
        if rates is not None and len(rates):
            df = pd.DataFrame(rates)
            df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
            df.rename(columns={"real_volume":"real_vol","tick_volume":"tick_vol"}, inplace=True)
            return df[["time","open","high","low","close","tick_vol"]].copy()

        now = dt.datetime.utcnow()
        rates = mt5.copy_rates_from(symbol, tf, now, bars)
        if rates is not None and len(rates):
            df = pd.DataFrame(rates)
            df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
            df.rename(columns={"real_volume":"real_vol","tick_volume":"tick_vol"}, inplace=True)
            return df[["time","open","high","low","close","tick_vol"]].copy()

        if timeframe_key == "1day":
            start = now - dt.timedelta(days=500)
        elif timeframe_key == "4hour":
            start = now - dt.timedelta(days=200)
        else:
            start = now - dt.timedelta(days=90)
        rates = mt5.copy_rates_range(symbol, tf, start, now)
        if rates is not None and len(rates):
            df = pd.DataFrame(rates)[-bars:]
            df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
            df.rename(columns={"real_volume":"real_vol","tick_volume":"tick_vol"}, inplace=True)
            return df[["time","open","high","low","close","tick_vol"]].copy()

        last_err = mt5.last_error()
        time.sleep(retry_wait * (1 + attempt))

    raise RuntimeError(f"MT5 returned no data for {symbol} {timeframe_key}: {last_err}")

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
              d1_depth:(int,int), h4_depth:(int,int),
              bos_excess_d1:tuple, bos_excess_h4:tuple,
              merge_d1:tuple, merge_h4:tuple,
              use_indicators:dict, penalties:dict,
              fetch_retries:int, retry_wait:float):
    d1 = fetch_df(symbol, "1day",  bars=1200, max_retries=fetch_retries, retry_wait=retry_wait)
    h4 = fetch_df(symbol, "4hour", bars=1500, max_retries=fetch_retries, retry_wait=retry_wait)
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
        "d1": d_d1, "h4": d_h4, "pair": pair,
        "confidence": conf,
        "last_bos_d1": t_d1["last_bos_price"], "last_bos_d1_time": t_d1["last_bos_time"],
        "last_bos_h4": t_h4["last_bos_price"], "last_bos_h4_time": t_h4["last_bos_time"],
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

def write_pairs_csv(path:str, pairs_info:dict):
    rows = []
    for sym,info in sorted(pairs_info.items()):
        rows.append({
            "symbol":sym,
            "d1":info["d1"], "h4":info["h4"], "pair":info["pair"],
            "confidence": round(float(info.get("confidence",0.0)),1),
            "last_bos_d1": info.get("last_bos_d1"),
            "last_bos_h4": info.get("last_bos_h4"),
            "error": info.get("error","")
        })
    pd.DataFrame(rows).to_csv(path, index=False)

def write_currencies_csv(path:str, curr_info:dict):
    rows = []
    for cur,info in sorted(curr_info.items()):
        r = {"currency":cur}
        r.update(info)
        rows.append(r)
    pd.DataFrame(rows).to_csv(path, index=False)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pairs", default=",".join(DEFAULT_PAIRS))
    ap.add_argument("--preset", default=None)
    ap.add_argument("--trend-mode", default="bos_only", choices=["bos_only","state","pair_only","pair_plus_bos"])

    ap.add_argument("--d1-depth", default="3,1")
    ap.add_argument("--h4-depth", default="3,1")

    ap.add_argument("--bos-excess-d1-atr", type=float, default=0.04)
    ap.add_argument("--bos-excess-d1-pips", type=float, default=0.5)
    ap.add_argument("--bos-excess-h4-atr", type=float, default=0.08)
    ap.add_argument("--bos-excess-h4-pips", type=float, default=0.5)
    ap.add_argument("--merge-atr-d1", type=float, default=0.06)
    ap.add_argument("--merge-pips-d1", type=float, default=1.0)
    ap.add_argument("--merge-atr-h4", type=float, default=0.08)
    ap.add_argument("--merge-pips-h4", type=float, default=1.0)

    ap.add_argument("--use-adx", action="store_true")
    ap.add_argument("--adx-d1-min", type=float, default=20.0)
    ap.add_argument("--adx-h4-min", type=float, default=18.0)
    ap.add_argument("--use-chop", action="store_true")
    ap.add_argument("--chop-d1-max", type=float, default=55.0)
    ap.add_argument("--chop-h4-max", type=float, default=58.0)
    ap.add_argument("--use-avwap-accept", action="store_true")
    ap.add_argument("--accept-d1-bars", type=int, default=1)
    ap.add_argument("--accept-h4-bars", type=int, default=3)
    ap.add_argument("--accept-atr-band", type=float, default=0.20)
    ap.add_argument("--use-triangle-consistency", action="store_true")
    ap.add_argument("--triangle-penalty", type=float, default=0.50)

    ap.add_argument("--emit-confidence", action="store_true")
    ap.add_argument("--soft-gating", action="store_true")
    ap.add_argument("--penalty-adx", type=float, default=0.6)
    ap.add_argument("--penalty-chop", type=float, default=0.7)
    ap.add_argument("--penalty-avwap", type=float, default=0.6)
    ap.add_argument("--penalty-triangle", type=float, default=0.8)
    ap.add_argument("--weighted-aggregation", action="store_true")

    ap.add_argument("--max-retries", type=int, default=3)
    ap.add_argument("--retry-wait", type=float, default=0.25)
    ap.add_argument("--warmup-first", action="store_true")

    ap.add_argument("--out-json", default=None)
    ap.add_argument("--out-csv", default=None)
    ap.add_argument("--out-currencies-json", default=None)
    ap.add_argument("--out-currencies-csv", default=None)

    args = ap.parse_args()

    if not mt5.initialize():
        print("MT5 initialize failed", file=sys.stderr)
        sys.exit(1)

    pairs = [p.strip().upper() for p in args.pairs.split(",") if p.strip()]
    if args.warmup_first:
        for sym in pairs:
            ensure_symbol(sym)
            warmup_history(sym, "1day",  bars=80, retries=3, wait=args.retry_wait)
            warmup_history(sym, "4hour", bars=120, retries=3, wait=args.retry_wait)

    d1_depth = tuple(int(x) for x in args.d1_depth.split(","))
    h4_depth = tuple(int(x) for x in args.h4_depth.split(","))

    use_inds = {
        "use_adx": args.use_adx, "adx_d1_min": args.adx_d1_min, "adx_h4_min": args.adx_h4_min,
        "use_chop": args.use_chop, "chop_d1_max": args.chop_d1_max, "chop_h4_max": args.chop_h4_max,
        "use_avwap_accept": args.use_avwap_accept, "accept_d1_bars": args.accept_d1_bars,
        "accept_h4_bars": args.accept_h4_bars, "accept_atr_band": args.accept_atr_band
    }
    penalties = {
        "penalty_adx": args.penalty_adx, "penalty_chop": args.penalty_chop,
        "penalty_avwap": args.penalty_avwap, "penalty_triangle": args.penalty_triangle
    }

    all_pairs = {}
    for sym in pairs:
        try:
            info = scan_pair(
                sym,
                d1_depth, h4_depth,
                (args.bos_excess_d1_atr, args.bos_excess_d1_pips),
                (args.bos_excess_h4_atr, args.bos_excess_h4_pips),
                (args.merge_atr_d1, args.merge_pips_d1),
                (args.merge_atr_h4, args.merge_pips_h4),
                use_inds, penalties,
                fetch_retries=args.max_retries, retry_wait=args.retry_wait
            )
            all_pairs[sym] = info
        except Exception as e:
            all_pairs[sym] = {"d1":"neutral","h4":"neutral","pair":"neutral","confidence":0.0,"error":str(e)}

    if args.use_triangle_consistency:
        ratios = triangle_inconsistency(all_pairs)
        for sym,ratio in ratios.items():
            info = all_pairs.get(sym)
            if not info: continue
            conf = float(info.get("confidence",0.0))
            if conf>0:
                info["confidence"] = conf * (1.0 - ratio*(1.0 - args.penalty_triangle))

    curr_raw = aggregate_currencies(all_pairs, weighted=False)
    curr_w   = aggregate_currencies(all_pairs, weighted=args.weighted_aggregation)

    if args.out_json:
        os.makedirs(os.path.dirname(args.out_json), exist_ok=True)
        with open(args.out_json, "w", encoding="utf-8") as f:
            json.dump({"run_info":{"ts_utc":dt.datetime.utcnow().isoformat()+"Z",
                                   "trend_mode":args.trend_mode,
                                   "d1_depth":args.d1_depth,"h4_depth":args.h4_depth},
                       "pairs": all_pairs}, f, indent=2)
        print("Wrote", args.out_json)
    if args.out_currencies_json:
        os.makedirs(os.path.dirname(args.out_currencies_json), exist_ok=True)
        with open(args.out_currencies_json, "w", encoding="utf-8") as f:
            json.dump({"currencies_raw": curr_raw, "currencies_weighted": curr_w}, f, indent=2)
        print("Wrote", args.out_currencies_json)

    if args.out_csv:
        os.makedirs(os.path.dirname(args.out_csv), exist_ok=True)
        write_pairs_csv(args.out_csv, all_pairs)
        print("Wrote", args.out_csv)
    if args.out_currencies_csv:
        os.makedirs(os.path.dirname(args.out_currencies_csv), exist_ok=True)
        write_currencies_csv(args.out_currencies_csv, curr_w if args.weighted_aggregation else curr_raw)
        print("Wrote", args.out_currencies_csv)

    mt5.shutdown()

if __name__ == "__main__":
    main()
