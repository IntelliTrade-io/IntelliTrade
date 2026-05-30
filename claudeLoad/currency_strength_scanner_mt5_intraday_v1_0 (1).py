# coding: utf-8
"""
IntelliTrade Intraday Currency Strength Scanner
v1.0 (H1 / M15) — sequence-aware + soft-gate indicators
"""
import argparse, os, sys, json, math, itertools, datetime as dt
import numpy as np
import pandas as pd

try:
    import MetaTrader5 as mt5
except Exception as e:
    print("MetaTrader5 package is required. pip install MetaTrader5", file=sys.stderr)
    raise

CURRENCIES = ["USD","EUR","GBP","JPY","AUD","NZD","CAD","CHF"]
PAIRS = [
    "EURUSD","GBPUSD","AUDUSD","NZDUSD","USDJPY","USDCHF","USDCAD",
    "EURGBP","EURJPY","EURAUD","EURNZD","EURCHF","EURCAD",
    "GBPJPY","GBPAUD","GBPNZD","GBPCHF","GBPCAD",
    "AUDJPY","AUDNZD","AUDCHF","AUDCAD",
    "NZDJPY","NZDCHF","NZDCAD",
    "CHFJPY","CADJPY","CADCHF"
]

TF_MAP = {
    "M1": mt5.TIMEFRAME_M1, "M5": mt5.TIMEFRAME_M5, "M15": mt5.TIMEFRAME_M15, "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1, "H2": mt5.TIMEFRAME_H2, "H3": mt5.TIMEFRAME_H3, "H4": mt5.TIMEFRAME_H4
}

def fetch_df(symbol: str, tf: str, bars: int) -> pd.DataFrame:
    timeframe = TF_MAP[tf]
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, bars)
    if rates is None or len(rates) == 0:
        raise RuntimeError(f"mt5.copy_rates_from_pos failed for {symbol} {tf}")
    df = pd.DataFrame(rates)
    df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
    df.rename(columns={"real_volume":"real_vol","tick_volume":"tick_vol"}, inplace=True)
    return df[["time","open","high","low","close","tick_vol"]].copy()

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
    for i in range(len(df)):
        lo = max(0, i-depth_hi); hi = min(len(df), i+depth_hi+1)
        if i>=depth_hi and i < len(df)-depth_hi and H[i] == np.max(H[lo:hi]):
            piv.append({"idx": i, "price": float(H[i]), "type": "H"})
        lo = max(0, i-depth_lo); hi = min(len(df), i+depth_lo+1)
        if i>=depth_lo and i < len(df)-depth_lo and L[i] == np.min(L[lo:hi]):
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
                          depth_hi:int=3, depth_lo:int=3,
                          bos_excess_atr:float=0.05, bos_excess_pips:float=0.5,
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
    trend = "neutral"; last_HL=None; last_LH=None; last_BOS_price=None; last_BOS_time=None
    i=0
    while i < len(piv)-2:
        a,b,c = piv[i], piv[i+1], piv[i+2]
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
        i+=1
    if trend=="bullish" and last_HL is not None:
        future_lows = df["low"].iloc[last_HL["idx"]+1:]
        if len(future_lows)>0 and bos_down(future_lows.min(), last_HL["price"]):
            trend="bearish"
    if trend=="bearish" and last_LH is not None:
        future_highs = df["high"].iloc[last_LH["idx"]+1:]
        if len(future_highs)>0 and bos_up(future_highs.max(), last_LH["price"]):
            trend="bullish"
    return {"trend":trend,"last_bos_price":last_BOS_price,"last_bos_time":str(last_BOS_time) if last_BOS_time is not None else None,"pivots":piv[-12:]}

def sign_from_label(label:str)->int:
    return 1 if label=="bullish" else -1 if label=="bearish" else 0

def compute_confidence(pair_label:str, hi_df:pd.DataFrame, lo_df:pd.DataFrame,
                       use_adx=False, adx_hi_min=20, adx_lo_min=18,
                       use_chop=False, chop_hi_max=55, chop_lo_max=58,
                       use_avwap_accept=False, accept_hi_bars=1, accept_lo_bars=3, accept_atr_band=0.20,
                       triangle_penalty_ratio=0.0, penalty_adx=0.6, penalty_chop=0.7, penalty_avwap=0.6, penalty_triangle=0.8):
    if pair_label=="neutral":
        return 0.0
    conf = 100.0
    if use_adx:
        adx_hi = adx(hi_df); adx_lo = adx(lo_df)
        if (adx_hi < adx_hi_min) or (adx_lo < adx_lo_min):
            conf *= penalty_adx
    if use_chop:
        chop_hi = choppiness(hi_df); chop_lo = choppiness(lo_df)
        if (chop_hi > chop_hi_max) or (chop_lo > chop_lo_max):
            conf *= penalty_chop
    if use_avwap_accept:
        def avwap_ok(df, bars:int, label:str):
            sub = df.iloc[-max(bars,2):]
            vol = sub["tick_vol"].astype(float).values
            typical = (sub["high"]+sub["low"]+sub["close"]).values/3.0
            vwap = (typical*vol).sum() / (vol.sum() if vol.sum()!=0 else 1.0)
            a = atr(df, 14).iloc[-1]
            band = accept_atr_band * a
            close = df["close"].iloc[-1]
            return (close >= vwap - band) if label=="bullish" else (close <= vwap + band)
        ok_hi = avwap_ok(hi_df, accept_hi_bars, pair_label)
        ok_lo = avwap_ok(lo_df, accept_lo_bars, pair_label)
        if not (ok_hi or ok_lo):
            conf *= penalty_avwap
    if triangle_penalty_ratio>0:
        conf *= (1.0 - triangle_penalty_ratio*(1.0 - penalty_triangle))
    return max(0.0, min(100.0, conf))

def scan_pair(symbol:str, hi_tf:str, lo_tf:str, bars_hi:int, bars_lo:int,
              depth_hi:(int,int), depth_lo:(int,int),
              bos_excess_hi:tuple, bos_excess_lo:tuple,
              merge_hi:tuple, merge_lo:tuple,
              use_indicators:dict, penalties:dict):
    hi = fetch_df(symbol, hi_tf, bars_hi)
    lo = fetch_df(symbol, lo_tf, bars_lo)
    t_hi = detect_trend_sequence(hi, depth_hi[0], depth_hi[1], bos_excess_hi[0], bos_excess_hi[1], merge_hi[0], merge_hi[1])
    t_lo = detect_trend_sequence(lo, depth_lo[0], depth_lo[1], bos_excess_lo[0], bos_excess_lo[1], merge_lo[0], merge_lo[1])
    d_hi, d_lo = t_hi["trend"], t_lo["trend"]
    if d_hi=="bullish" and d_lo=="bullish":
        pair = "bullish"
    elif d_hi=="bearish" and d_lo=="bearish":
        pair = "bearish"
    else:
        pair = "neutral"
    conf = compute_confidence(
        pair, hi, lo,
        use_adx=use_indicators.get("use_adx",False),
        adx_hi_min=use_indicators.get("adx_hi_min",20),
        adx_lo_min=use_indicators.get("adx_lo_min",18),
        use_chop=use_indicators.get("use_chop",False),
        chop_hi_max=use_indicators.get("chop_hi_max",55),
        chop_lo_max=use_indicators.get("chop_lo_max",58),
        use_avwap_accept=use_indicators.get("use_avwap_accept",False),
        accept_hi_bars=use_indicators.get("accept_hi_bars",1),
        accept_lo_bars=use_indicators.get("accept_lo_bars",3),
        accept_atr_band=use_indicators.get("accept_atr_band",0.20),
        triangle_penalty_ratio=0.0,
        penalty_adx=penalties.get("penalty_adx",0.6),
        penalty_chop=penalties.get("penalty_chop",0.7),
        penalty_avwap=penalties.get("penalty_avwap",0.6),
        penalty_triangle=penalties.get("penalty_triangle",0.8),
    )
    return {
        "hi_tf": hi_tf, "lo_tf": lo_tf,
        "hi": d_hi, "lo": d_lo, "pair": pair,
        "confidence": conf,
        "last_bos_hi": t_hi["last_bos_price"], "last_bos_hi_time": t_hi["last_bos_time"],
        "last_bos_lo": t_lo["last_bos_price"], "last_bos_lo_time": t_lo["last_bos_time"],
    }

def triangle_inconsistency(all_pairs:dict):
    def sign(label:str)->int: return 1 if label=="bullish" else -1 if label=="bearish" else 0
    signs = {p: sign(info["pair"]) for p,info in all_pairs.items()}
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
            "hi":info["hi"], "lo":info["lo"], "pair":info["pair"],
            "confidence": round(float(info.get("confidence",0.0)),1),
            "last_bos_hi": info.get("last_bos_hi"),
            "last_bos_lo": info.get("last_bos_lo"),
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
    ap.add_argument("--pairs", default=",".join(PAIRS))
    ap.add_argument("--hi-tf", default="H1", choices=list(TF_MAP.keys()))
    ap.add_argument("--lo-tf", default="M15", choices=list(TF_MAP.keys()))
    ap.add_argument("--bars-hi", type=int, default=1200)
    ap.add_argument("--bars-lo", type=int, default=1500)
    ap.add_argument("--depth-hi", default="3,1")
    ap.add_argument("--depth-lo", default="3,1")
    ap.add_argument("--bos-excess-hi-atr", type=float, default=0.05)
    ap.add_argument("--bos-excess-hi-pips", type=float, default=0.5)
    ap.add_argument("--bos-excess-lo-atr", type=float, default=0.08)
    ap.add_argument("--bos-excess-lo-pips", type=float, default=0.5)
    ap.add_argument("--merge-hi-atr", type=float, default=0.06)
    ap.add_argument("--merge-hi-pips", type=float, default=1.0)
    ap.add_argument("--merge-lo-atr", type=float, default=0.08)
    ap.add_argument("--merge-lo-pips", type=float, default=1.0)

    ap.add_argument("--use-adx", action="store_true")
    ap.add_argument("--adx-hi-min", type=float, default=20.0)
    ap.add_argument("--adx-lo-min", type=float, default=18.0)
    ap.add_argument("--use-chop", action="store_true")
    ap.add_argument("--chop-hi-max", type=float, default=55.0)
    ap.add_argument("--chop-lo-max", type=float, default=58.0)
    ap.add_argument("--use-avwap-accept", action="store_true")
    ap.add_argument("--accept-hi-bars", type=int, default=1)
    ap.add_argument("--accept-lo-bars", type=int, default=3)
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

    ap.add_argument("--out-json", default=None)
    ap.add_argument("--out-csv", default=None)
    ap.add_argument("--out-currencies-json", default=None)
    ap.add_argument("--out-currencies-csv", default=None)

    args = ap.parse_args()

    if not mt5.initialize():
        print("MT5 initialize failed", file=sys.stderr)
        sys.exit(1)

    pairs = [p.strip().upper() for p in args.pairs.split(",") if p.strip()]
    h_depth = tuple(int(x) for x in args.depth_hi.split(","))
    l_depth = tuple(int(x) for x in args.depth_lo.split(","))

    use_inds = {
        "use_adx": args.use_adx, "adx_hi_min": args.adx_hi_min, "adx_lo_min": args.adx_lo_min,
        "use_chop": args.use_chop, "chop_hi_max": args.chop_hi_max, "chop_lo_max": args.chop_lo_max,
        "use_avwap_accept": args.use_avwap_accept, "accept_hi_bars": args.accept_hi_bars,
        "accept_lo_bars": args.accept_lo_bars, "accept_atr_band": args.accept_atr_band
    }
    penalties = {
        "penalty_adx": args.penalty_adx, "penalty_chop": args.penalty_chop,
        "penalty_avwap": args.penalty_avwap, "penalty_triangle": args.penalty_triangle
    }

    all_pairs = {}
    for sym in pairs:
        try:
            info = scan_pair(
                sym, args.hi_tf, args.lo_tf, args.bars_hi, args.bars_lo,
                h_depth, l_depth,
                (args.bos_excess_hi_atr, args.bos_excess_hi_pips),
                (args.bos_excess_lo_atr, args.bos_excess_lo_pips),
                (args.merge_hi_atr, args.merge_hi_pips),
                (args.merge_lo_atr, args.merge_lo_pips),
                use_inds, penalties
            )
            all_pairs[sym] = info
        except Exception as e:
            all_pairs[sym] = {"hi":"neutral","lo":"neutral","pair":"neutral","confidence":0.0,"error":str(e)}

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
            json.dump({"run_info":{"ts_utc":dt.datetime.utcnow().isoformat()+"Z","tf_hi":args.hi_tf,"tf_lo":args.lo_tf},
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
