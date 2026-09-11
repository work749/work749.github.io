#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日 7:00（北京时间）抓 10 条助贷/房产要闻，写入 js/data/news.js。
由 GitHub Actions 触发（tools/../.github/workflows/daily-news.yml）。
调用任意 OpenAI 兼容的 chat/completions 接口（DeepSeek/通义千问/OpenAI 都可）。
环境变量：
  ZXM_API_KEY   必填，API 密钥
  ZXM_BASE_URL  选填，默认 https://api.deepseek.com/v1
  ZXM_MODEL     选填，默认 deepseek-chat
"""
import datetime
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "js", "data", "news.js")
TODAY = datetime.datetime.utcnow().strftime("%Y-%m-%d")

KEY = os.environ.get("ZXM_API_KEY", "").strip()
BASE = os.environ.get("ZXM_BASE_URL", "https://api.deepseek.com/v1").strip().rstrip("/")
MODEL = os.environ.get("ZXM_MODEL", "deepseek-chat").strip()

SYSTEM_PROMPT = (
    "你是「曾小满工作台」的每日要闻编辑，专门服务中国深圳的银行助贷从业者。\n"
    "你必须只输出今天真实可查的中国大陆新闻，绝不编造来源、日期或链接。\n"
    "如果对某条新闻不确定，就换成另一条确定的。\n"
    "输出必须是严格 JSON 数组，不要任何额外文字、Markdown、解释或代码块标记。"
)

USER_PROMPT = (
    f"今天日期 {TODAY}（北京时间）。请按以下要求输出 10 条真实新闻。\n\n"
    "【分组】\n"
    "- credit 5 条：助贷平台监管、LPR 报价、货币政策、信贷投放、普惠小微贷款、"
    "消费贷/经营贷、金融监管总局与互金协会新规、征信与个贷息费明示等"
    "对银行助贷从业者有实际影响的内容。\n"
    "- property 5 条：楼市政策（限购、首付、房贷利率、40 年按揭、现房销售、"
    "收储存量房、城中村改造、保障房）、重点城市成交数据、房价指数；"
    "深圳及一线城市相关内容优先。\n\n"
    "【每条 JSON 字段】\n"
    "  title    短标题（20字内）\n"
    "  source   媒体简称（例：证券日报、央行、第一财经）\n"
    "  date     YYYY-MM-DD\n"
    "  url      原文链接（找不到就填该媒体的搜索/首页链接，不要编）\n"
    "  summary  30-60 字，说清对助贷从业者或楼市的实际影响\n\n"
    "【来源媒体限中国大陆主流财经】\n"
    "央行/金融监管总局/国务院/新华社/人民日报/证券时报/证券日报/中国证券报/"
    "上海证券报/21世纪经济报道/每日经济新闻/第一财经/财新/中新经纬/界面新闻/"
    "经济观察报/东方财富/新浪财经/财联社 等。\n\n"
    "【输出格式】\n"
    "严格输出一个 JSON 数组，按顺序：先 5 条 credit，再 5 条 property。\n"
    "只输出 JSON 本身，不要任何前后说明。"
)

socket.setdefaulttimeout(120)


def call_llm():
    if not KEY:
        print("ERR: 环境变量 ZXM_API_KEY 未设置", file=sys.stderr)
        sys.exit(1)
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT},
        ],
        "temperature": 0.2,
        "stream": False,
    }
    req = urllib.request.Request(
        BASE + "/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=110) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")
        print(f"ERR: API HTTP {e.code}: {body[:500]}", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"ERR: API 调用失败：{e}", file=sys.stderr)
        sys.exit(2)
    return data["choices"][0]["message"]["content"]


def extract_json(text):
    """模型可能夹一些说明文字，用首段 [...] 兜底。"""
    m = re.search(r"\[[\s\S]*\]", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def validate(items):
    if not isinstance(items, list) or len(items) != 10:
        return f"期望 10 条，实际 {len(items) if isinstance(items, list) else type(items).__name__}"
    out = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            return f"第 {i+1} 条不是 JSON 对象"
        for k in ("title", "source", "date", "url", "summary"):
            v = it.get(k)
            if not isinstance(v, str) or not v.strip():
                return f"第 {i+1} 条缺少或为空字段：{k}"
        out.append({
            "group": "credit" if i < 5 else "property",
            "title": it["title"].strip(),
            "source": it["source"].strip(),
            "date": it["date"].strip(),
            "url": it["url"].strip(),
            "summary": it["summary"].strip(),
        })
    return out


def check_url(url):
    """轻量校验：能取到内容就算通过；失败返回 False。"""
    if not url or not url.startswith(("http://", "https://")):
        return False
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (ZXMNews/1.0)")
        req.add_header("Accept", "text/html,application/xhtml+xml")
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read(512)
            return 200 <= r.status < 400
    except Exception:
        return False


def main():
    content = call_llm()
    items = extract_json(content)
    if items is None:
        print("ERR: 模型未输出 JSON 数组", file=sys.stderr)
        print("--- 原始返回 ---\n" + content[:800], file=sys.stderr)
        sys.exit(3)
    cleaned = validate(items)
    if not isinstance(cleaned, list):
        print("ERR: " + cleaned, file=sys.stderr)
        print("--- 原始返回 ---\n" + content[:800], file=sys.stderr)
        sys.exit(3)
    # URL 校验：失败的降级到该 source 的媒体官网首页（多数搜索能定位到）
    fail = 0
    for it in cleaned:
        if not check_url(it["url"]):
            fail += 1
            # 用 Google 搜索该媒体的站点作为兜底
            it["url"] = f"https://www.google.com/search?q={urllib.parse.quote(it['title'] + ' ' + it['source'])}"
    if fail:
        print(f"WARN: {fail}/10 条 URL 校验失败，已降级为搜索引擎链接", file=sys.stderr)

    out = (
        "/* 每日要闻数据，由 tools/fetch_news.py 自动生成。"
        "GitHub Actions 每天北京时间 7:00 触发；可手动 workflow_dispatch 测试。 */\n"
        "window.NEWS_DATA = "
        + json.dumps({"updated": TODAY, "items": cleaned}, ensure_ascii=False, indent=2)
        + ";\n"
    )
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"OK: wrote {len(cleaned)} items, updated={TODAY}, url_fail={fail}")


if __name__ == "__main__":
    import urllib.parse  # 在 main 内 import，避免 import 顺序问题
    main()
