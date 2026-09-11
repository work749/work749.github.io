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
    "输出必须是严格 JSON 数组，不要任何额外文字、Markdown、解释或代码块标记。\n\n"
    "【关键】url 字段必须通过 web_search 工具实际搜出来，不要凭印象猜。\n"
    "搜到后只填该文章页本身的 URL（不是首页、不是分类页、不是 Google/百度搜索结果）。\n"
    "如果某条实在搜不到原文，url 字段填百度站内搜索的 URL：\n"
    "  https://www.baidu.com/s?wd=site:<媒体域名>%20<标题关键词>\n"
    "这样前端用户点开至少能搜到那一篇。"
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
    "  url      原文链接——必须通过 web_search 工具实际搜出，"
    "禁止凭印象给首页。如果实在搜不到原文，填该媒体域名下的百度站内搜索 URL：\n"
    "           https://www.baidu.com/s?wd=site:<媒体域名>%20<标题>\n"
    "           例：https://www.baidu.com/s?wd=site:pbc.gov.cn%20LPR%E6%8A%A5%E4%BB%B7\n"
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
        "tools": [
            {
                "type": "web_search",
                "web_search": {
                    "enable": True,
                    "search_result": True,
                    "search_query": (
                        "今天 中国大陆 助贷 监管 LPR 房地产 限购 房贷 政策 新闻"
                    ),
                },
            }
        ],
        "tool_choice": "auto",
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
    """轻量校验：用真实浏览器 UA + 跟随重定向，读前 4KB 头判断文章页 vs 列表页/搜索页。
    返回：
      "ok"          看起来是文章页（路径含具体 slug / 数字 ID）
      "search"      落到搜索结果或首页（前端会显示"搜索"按钮）
      "bad"         404 / 网络错误 / 非 HTTP(S)（直接降级）"""
    if not url or not url.startswith(("http://", "https://")):
        return "bad"
    try:
        # 先用 HTTPRedirectHandler 把 3xx 链自动跳完
        opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36")
        req.add_header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        req.add_header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        with opener.open(req, timeout=10) as r:
            final_url = r.geturl() or url
            body = r.read(4096).decode("utf-8", "ignore")
            ct = r.headers.get("Content-Type", "")
            if not (200 <= r.status < 400):
                return "bad"
            # 落到搜索结果
            if any(k in final_url for k in ("google.com/search", "baidu.com/s?", "bing.com/search", "sogou.com/web")):
                return "search"
            # 落到站点首页（路径为 /  或  /index.*）
            try:
                p = urllib.parse.urlparse(final_url).path
                if p in ("", "/", "/index.html", "/index.htm", "/default.html"):
                    return "search"
            except Exception:
                pass
            # 标题里含"搜索结果" / "请输入关键词" → 搜索页
            if "百度搜索" in body or "搜索结果" in body[:2000] and "site:" in body[:2000].lower():
                return "search"
            # 找不到任何正文锚点 → 可能是反爬或 SPA 空壳
            if not body.strip():
                return "bad"
            return "ok"
    except Exception:
        return "bad"


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

    # URL 校验 + 降级：失败 → 百度站内搜索该媒体的"标题"
    fail_ok = fail_search = fail_bad = 0
    for it in cleaned:
        st = check_url(it["url"])
        if st == "ok":
            continue
        if st == "search":
            fail_search += 1
            continue  # 已是搜索 URL，留给前端"搜索"按钮
        # bad → 降级到百度站内搜索
        fail_bad += 1
        site_hint = ""
        host = ""
        try:
            host = urllib.parse.urlparse(it["url"]).hostname or ""
        except Exception:
            pass
        if host and host not in ("", "localhost"):
            site_hint = "site:" + host + " "
        it["url"] = "https://www.baidu.com/s?wd=" + urllib.parse.quote(site_hint + it["title"])
    fail = fail_search + fail_bad
    if fail:
        print(
            f"WARN: {fail}/10 条 URL 不理想（search={fail_search} 已是搜索页，bad={fail_bad} 已降级为百度站内搜索）",
            file=sys.stderr,
        )

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
