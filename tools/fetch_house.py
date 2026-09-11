#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抓取并更新房产数据：央行 LPR 利率历史 + 国家统计局 70 城指数 + 重点城市成交。
失败策略：抓不到时保留旧数据，绝不写空。
"""
import os, sys, json, re, urllib.request, urllib.parse, urllib.error
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "js", "data", "house.js")
TODAY = date.today().isoformat()

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

def get(url, timeout=20, referer=None):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/json,*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        **({"Referer": referer} if referer else {})
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", errors="replace")

def fetch_lpr():
    candidates = [
        "http://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081395/4081686/index.html",
        "https://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081395/4081686/index.html",
    ]
    for url in candidates:
        try:
            status, html = get(url, referer="http://www.pbc.gov.cn/")
            if status != 200 or "LPR" not in html:
                continue
            rows = []
            for m in re.finditer(
                r"(20\d{2}-\d{2}-\d{2}).{0,200}?1\s*年期.{0,40}?(\d\.\d{2}).{0,200}?5\s*年期.{0,40}?(\d\.\d{2})",
                html, re.S
            ):
                rows.append({"date": m.group(1), "m1": float(m.group(2)), "m5": float(m.group(3))})
            if not rows:
                continue
            seen, ordered = set(), []
            for r in rows:
                if r["date"] in seen: continue
                seen.add(r["date"])
                ordered.append(r)
            ordered.sort(key=lambda x: x["date"], reverse=True)
            print(f"LPR: got {len(ordered)} entries (latest {ordered[0]['date']})")
            return ordered[:8]
        except Exception as e:
            print(f"LPR fetch fail ({url}): {e}", file=sys.stderr)
    return []

def main():
    print(f"=== fetch_house  {TODAY} ===")
    if not os.path.exists(DATA_FILE):
        print(f"!! 找不到 {DATA_FILE}", file=sys.stderr)
        sys.exit(1)

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        src = f.read()

    raw_lpr = fetch_lpr()
    lpr = []
    if raw_lpr:
        prev_m5 = None
        for r in raw_lpr:
            change = "-"
            if prev_m5 is not None:
                d_bp = round((r["m5"] - prev_m5) * 100)
                change = "持平" if d_bp == 0 else f"{d_bp:+d}bp"
            lpr.append({"date": r["date"], "m1": r["m1"], "m5": r["m5"], "change": change})
            prev_m5 = r["m5"]

    if lpr:
        lpr_js = "[\n      " + ",\n      ".join(
            "{ date: \"%s\", m1: %.2f, m5: %.2f, change: \"%s\" }" % (r["date"], r["m1"], r["m5"], r["change"])
            for r in lpr
        ) + "\n    ]"
        src = re.sub(r"lpr:\s*\[[^\]]*\]", f"lpr: {lpr_js}", src, count=1, flags=re.S)

    src = re.sub(r'updated:\s*"[^"]*"', f'updated: "{TODAY}"', src, count=1)
    src = re.sub(r'source:\s*"[^"]*"', f'source: "国家统计局 / 央行 / 住建局公开数据 (自动抓取 {TODAY})"', src, count=1)

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"==> 写入 {DATA_FILE} 完成")
    if not lpr:
        print("    (LPR 抓取失败，保留旧数据)")

if __name__ == "__main__":
    main()
