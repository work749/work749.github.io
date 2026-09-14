#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日 7:00（北京时间）抓 10 条助贷/房产要闻，写入 js/data/news.js。

真实新闻来源（多源容错，按序尝试，谁通用谁）：
  - DuckDuckGo HTML（免密钥，干净，普通网络可用）
  - Bing 网页搜索（兜底）
  - 百度网页搜索（兜底）
拿到真实标题/链接/摘要后，用 ZXM_API_KEY 调大模型整理成结构化 JSON + 影响摘要 + 正文摘录。

注意：本 key 下智谱自带的 web_search 工具实测未生效（模型会整段编造），故不用它。

环境变量：
  ZXM_API_KEY   必填，智谱 GLM API 密钥
  ZXM_BASE_URL  选填，默认 https://open.bigmodel.cn/api/paas/v4
  ZXM_MODEL     选填，默认 glm-4-flash
"""
import datetime
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
import html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "js", "data", "news.js")
TODAY = datetime.date.today().strftime("%Y-%m-%d")

KEY = os.environ.get("ZXM_API_KEY", "").strip()
BASE = os.environ.get("ZXM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").strip().rstrip("/")
MODEL = os.environ.get("ZXM_MODEL", "glm-4-flash").strip()

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
socket.setdefaulttimeout(25)

# 明显非新闻的垃圾域名（百科/字典/房产门户/贷款产品页/厂商站），过滤掉
JUNK = ("baike", "zidian", "hanyu", "dict", "wiki", "anjuke", "fang.com",
        "ke.com", "oppo", "hyperos", "mckinsey", "qstheory", "microsoft",
        "hlcode", "picoxr", "connect.", "xiaomi", "hanyuguoxue", "shidianguji",
        "hanzi", "baidu.com", "baiducontent", "zzhuangli", "chinacalendar",
        "pinjia.day", "toolight.cn", "rili", "yayun",
        "pingan.com", "rongzi.com", "51credit.com", "rong360.com", "591.com",
        "cdb.com.cn", "iwanjinrong.com", "rongziw.com", "csls",
        "/pbservice/", "loan_page", "m.pingan")
# 优先保留的新闻/财经/政府媒体域名（命中则相关性加权）
NEWS = ("sina.com.cn", "sohu.com", "qq.com", "cctv.com", "gmw.cn", "gov.cn",
        "ndrc.gov.cn", "chinamoney", "stcn", "21jingji", "cls.cn", "yicai",
        "cs.com.cn", "people", "xinhua", "caixin", "thepaper", "eastmoney",
        "cnstock", "jrj", "hexun", "ce.cn", "chinanews", "wallstreetcn",
        "china.com.cn", "jwview", "eeo", "finance", "news")

CREDIT_QUERIES = [
    "贷款市场报价利率 LPR 最新 2026",
    "消费贷 贴息 政策 商业银行",
    "普惠金融 央行 最新",
    "互联网贷款 商业银行 监管 新规",
    "经营贷 资金 违规 流入 监管",
    "个人征信 新规 2026",
]
PROP_QUERIES = [
    "房贷 利率 下调 2026",
    "存量房贷 利率 调整 最新",
    "深圳 二手房 成交 2026",
    "房价 环比 走势 2026",
    "房地产 止跌回稳 政策",
    "限购 城市 放开 2026",
]

CREDIT_KW = ["贷", "信贷", "lpr", "利率", "央行", "监管", "征信", "普惠", "消费", "经营",
            "金融", "银行", "助贷", "货币", "降准", "贴息", "还款"]
PROP_KW = ["房地产", "楼市", "房价", "房贷", "限购", "住宅", "二手房", "新房", "成交",
          "土地", "保障房", "城中村", "按揭", "棚改", "物业", "现房"]


def host_of(u):
    try:
        return (urllib.parse.urlparse(u).hostname or "").lower()
    except Exception:
        return ""


def is_junk(u):
    h = host_of(u)
    low = u.lower()
    return any((j in h) or (j in low) for j in JUNK)


def _get(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def search_ddg(q, max_n=10):
    try:
        doc = _get("https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(q), timeout=8)
    except Exception as e:
        print("WARN ddg 失败: %s" % e, file=sys.stderr)
        return []
    out = []
    for m in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', doc, re.S):
        href = m.group(1)
        title = html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
        if "uddg=" in href:
            mm = re.search(r"uddg=([^&]+)", href)
            if mm:
                href = urllib.parse.unquote(mm.group(1))
        if href.startswith("//"):
            href = "https:" + href
        if href.startswith("http"):
            out.append({"title": title, "url": href, "snippet": ""})
    snips = re.findall(r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>', doc, re.S)
    for i, s in enumerate(snips):
        if i < len(out):
            out[i]["snippet"] = html.unescape(re.sub(r"<[^>]+>", "", s)).strip()
    return out[:max_n]


def search_bing(q, max_n=10):
    try:
        doc = _get("https://www.bing.com/search?q=" + urllib.parse.quote(q) + "&setlang=zh-CN&cc=CN&count=20")
    except Exception as e:
        print("WARN bing 失败: %s" % e, file=sys.stderr)
        return []
    out = []
    for b in re.findall(r'<li class="b_algo"[^>]*>([\s\S]*?)</li>', doc):
        h2 = re.search(r'<h2[^>]*>(.*?)</h2>', b, re.S)
        if not h2:
            continue
        link = re.search(r'<a[^>]+href="([^"]+)"', h2.group(1))
        if not link:
            continue
        title = html.unescape(re.sub(r"<[^>]+>", "", h2.group(1))).strip()
        p = re.search(r'<p[^>]*>(.*?)</p>', b, re.S)
        snip = html.unescape(re.sub(r"<[^>]+>", "", p.group(1))).strip() if p else ""
        href = link.group(1)
        if href.startswith("http"):
            out.append({"title": title, "url": href, "snippet": snip})
    return out[:max_n]


def search_baidu(q, max_n=10):
    try:
        doc = _get("https://www.baidu.com/s?wd=" + urllib.parse.quote(q) + "&rn=10")
    except Exception as e:
        print("WARN baidu 失败: %s" % e, file=sys.stderr)
        return []
    out = []
    for m in re.finditer(r'<h3[^>]*class="[^"]*t[^"]*"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', doc, re.S):
        href = m.group(1)
        title = html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
        if href.startswith("http"):
            out.append({"title": title, "url": href, "snippet": ""})
    return out[:max_n]


def search(q, max_n=10):
    """多源容错：Bing → 百度 → DDG（DDG 仅作最后兜底，避免本环境 8s 超时浪费）。"""
    for fn in (search_bing, search_baidu, search_ddg):
        try:
            r = fn(q, max_n)
            if r:
                return r
        except Exception:
            pass
    return []


def score_pool(items, kws, min_score=1):
    """按关键词命中 + 新闻域名加权打分；min_score 过滤弱相关（挡掉经营/管理软文、登录页等）。"""
    scored = []
    for x in items:
        txt = (x["title"] + " " + x["snippet"]).lower()
        s = sum(1 for k in kws if k in txt)
        h = host_of(x["url"])
        if any(d in h for d in NEWS):
            s += 3
        if s >= min_score:
            scored.append((s, x))
    scored.sort(key=lambda t: -t[0])
    return [x for _, x in scored]


def fetch_content(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
        with urllib.request.urlopen(req, timeout=8) as r:
            raw = r.read(500000).decode("utf-8", "ignore")
        raw = re.sub(r"<script[\s\S]*?</script>", " ", raw, flags=re.I)
        raw = re.sub(r"<style[\s\S]*?</style>", " ", raw, flags=re.I)
        paras = re.findall(r"<p[^>]*>([\s\S]*?)</p>", raw, re.I)
        text = " ".join(html.unescape(re.sub(r"<[^>]+>", "", p)).strip() for p in paras)
        return re.sub(r"\s+", " ", text).strip()[:1600]
    except Exception:
        return ""


def call_llm(context):
    if not KEY:
        print("ERR: 环境变量 ZXM_API_KEY 未设置", file=sys.stderr)
        return None
    system = (
        "你是「曾小满工作台」的每日要闻编辑，服务深圳银行助贷从业者。\n"
        "下面给了真实搜索结果（已标注 [credit]/[property]、链接/标题/摘要），你必须且只能基于这些真实结果整理新闻，"
        "绝对不能编造链接、来源或日期。\n"
        "输出严格 JSON 数组，不要任何额外文字、Markdown 或代码块标记。\n"
        "每条字段：\n"
        "  title   短标题（20字内）\n"
        "  source  媒体简称（从链接域名或摘要推断）\n"
        "  date    YYYY-MM-DD，优先用今天 %s；若摘要含明确日期则用它\n"
        "  url     必须是下面真实链接之一，禁止自造\n"
        "  summary 30-60字，说清对助贷从业者或楼市的实际影响\n"
        "分组：先 5 条 credit（助贷/信贷/LPR/消费贷/经营贷/监管/征信/普惠金融），"
        "再 5 条 property（楼市/限购/房贷/利率/深圳成交/房价）。\n"
        "只输出 JSON 本身。"
    ) % TODAY
    user = "真实搜索结果：\n" + context
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "stream": False,
    }
    req = urllib.request.Request(
        BASE + "/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY},
        method="POST",
    )
    # 单发、50s 预算：本环境免费档对这个任务约需 100s+，超时即放弃，改用本地结构化结果。
    try:
        with urllib.request.urlopen(req, timeout=50) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        print("ERR: LLM HTTP %d: %s" % (e.code, e.read().decode("utf-8", "ignore")[:300]), file=sys.stderr)
        return None
    except Exception as e:
        print("WARN LLM 调用失败(已放弃，改用本地结果): %s" % e, file=sys.stderr)
        return None


def extract_json(text):
    m = re.search(r"\[[\s\S]*\]", text or "")
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


KNOWN_SOURCE = {
    "sina.com.cn": "新浪财经", "sohu.com": "搜狐", "qq.com": "腾讯新闻", "cctv.com": "央视网",
    "gmw.cn": "光明网", "gov.cn": "中国政府网", "ndrc.gov.cn": "国家发改委", "mofcom.gov.cn": "商务部",
    "chinamoney.com.cn": "中国货币网", "stcn.com": "证券时报", "21jingji.com": "21世纪经济报道",
    "cls.cn": "财联社", "yicai.com": "第一财经", "cs.com.cn": "中国证券报", "people.com.cn": "人民网",
    "xinhuanet.com": "新华网", "caixin.com": "财新", "thepaper.cn": "澎湃新闻", "eastmoney.com": "东方财富",
    "cnstock.com": "上海证券报", "jrj.com.cn": "金融界", "hexun.com": "和讯", "ce.cn": "中国经济网",
    "chinanews.com.cn": "中国新闻网", "wallstreetcn.com": "华尔街见闻", "china.com.cn": "中国网",
    "jwview.com": "中新经纬", "eeo.com.cn": "经济观察报", "mof.gov.cn": "财政部",
}


def friendly_source(u):
    h = host_of(u)
    for k, v in KNOWN_SOURCE.items():
        if h == k or h.endswith("." + k) or ("." + k) in h:
            return v
    return h.replace("www.", "")


def clean_title(t):
    t = html.unescape((t or "").strip())
    t = re.sub(r"\s+", " ", t)
    # 去掉 " - 新浪财经" / " | 腾讯新闻" / " _ 国务院文件" 这类站点后缀
    t = re.sub(r"\s*[\-\u2013\u2014|_｜|]\s*[^，。\s]{1,18}(网|新闻|财经|政府|官网|客户端|日报|周刊|时报|论坛|视点|观察)?\s*$", "", t)
    t = t.strip(" .。…·-_|｜")
    return t[:40]
    return t[:40]


def dedup_key(t):
    """跨查询去重用的稳定核心：清洗后按首个分隔符截断，去掉站点后缀干扰。"""
    t = clean_title(t)
    core = re.split(r"[\s_\-｜|–—]+", t)[0]
    return core if len(core) >= 6 else t


def guess_date(url, snippet):
    for s in (url, snippet or ""):
        m = re.search(r"(20\d{2})[-./年](\d{1,2})[-./月](\d{1,2})", s)
        if m:
            return "%s-%02d-%02d" % (m.group(1), int(m.group(2)), int(m.group(3)))
        m = re.search(r"(20\d{2})(\d{2})(\d{2})", s)
        if m:
            return "%s-%s-%s" % (m.group(1), m.group(2), m.group(3))
    return ""


def is_noise(x):
    """剔除计算器/名词解释/登录页/站点首页等非新闻内容。"""
    t = x["title"] or ""
    u = x["url"] or ""
    low = u.lower()
    if any(k in t for k in ("计算器", "什么是", "登录", "首页", "概览", "查询")):
        return True
    if "经营" in t and "管理" in t:  # 经营/管理自嗨软文，非楼市新闻
        return True
        return True
    if t.strip() in ("深圳政府在线", "自然人电子税务局", "中国政府网", "首页"):
        return True
    path = (urllib.parse.urlparse(u).path or "")
    if path in ("", "/") or path.endswith("/login") or "/webstatic/" in low or path.endswith("login"):
        return True
    return False


def local_structured(credit, prop):
    """不依赖 LLM 的兜底结构化：每组取前 5（跳过非新闻噪声），清洗标题/来源/日期。"""
    items = []
    for grp, pool in (("credit", credit), ("property", prop)):
        cnt = 0
        for x in pool:  # pool 已按相关度排序（top-9）
            if cnt >= 5:
                break
            if is_noise(x):
                continue
            cnt += 1
            items.append({
                "title": clean_title(x["title"]),
                "source": friendly_source(x["url"]),
                "date": guess_date(x["url"], x["snippet"]) or TODAY,
                "url": x["url"],
                "summary": (x["snippet"] or "").strip()[:120] or "（暂无摘要）",
            })
    return items


def main():
    seen = set()
    seen_title = set()
    credit_raw, prop_raw = [], []
    for q in CREDIT_QUERIES:
        for x in search(q):
            if x["url"] in seen or is_junk(x["url"]):
                continue
            tk = dedup_key(x["title"])
            if tk in seen_title:
                continue
            seen.add(x["url"]); seen_title.add(tk); credit_raw.append(x)
    for q in PROP_QUERIES:
        for x in search(q):
            if x["url"] in seen or is_junk(x["url"]):
                continue
            tk = dedup_key(x["title"])
            if tk in seen_title:
                continue
            seen.add(x["url"]); seen_title.add(tk); prop_raw.append(x)

    credit = score_pool(credit_raw, CREDIT_KW, min_score=2)[:9]
    prop = score_pool(prop_raw, PROP_KW, min_score=2)[:9]
    real = credit + prop
    if not real:
        print("ERR: 全部搜索源不可用，可能本机网络受限；保留昨日数据不覆盖。", file=sys.stderr)
        sys.exit(3)
    real_urls = set(x["url"] for x in real)
    print("INFO: 候选 %d（credit %d / property %d）" % (len(real), len(credit), len(prop)), file=sys.stderr)

    ctx_lines = []
    for i, x in enumerate(real):
        grp = "credit" if x in credit else "property"
        snip = (x["snippet"] or "")[:160].replace("\n", " ")
        ctx_lines.append("[%d][%s] %s\n   %s\n   %s" % (i + 1, grp, x["url"], x["title"], snip))
    text = call_llm("\n".join(ctx_lines))
    parsed = extract_json(text) if text else None

    if not isinstance(parsed, list) or not parsed:
        print("WARN: LLM 未产出有效 JSON，改用本地结构化结果（不依赖大模型）", file=sys.stderr)
        parsed = local_structured(credit, prop)

    out = []
    for i, it in enumerate(parsed):
        if not isinstance(it, dict) or len(out) >= 10:
            continue
        title = str(it.get("title", "")).strip() or "(无标题)"
        url = str(it.get("url", "")).strip()
        if url not in real_urls:
            cand = None
            h = host_of(url)
            for x in real:
                if h and h in x["url"]:
                    cand = x["url"]; break
            url = cand or real[0]["url"]
        snippet = next((x["snippet"] for x in real if x["url"] == url), "")
        content = fetch_content(url) or snippet
        out.append({
            "group": "credit" if i < 5 else "property",
            "title": title[:40],
            "source": str(it.get("source", "") or host_of(url)).strip()[:20],
            "date": (str(it.get("date", TODAY)).strip()[:10] or TODAY),
            "url": url,
            "summary": str(it.get("summary", "") or snippet or "（暂无摘要）").strip()[:120],
            "content": content,
        })

    used_titles = set(clean_title(it.get("title", "")) for it in out)
    for x in real:
        if len(out) >= 10:
            break
        if is_noise(x):
            continue
        ct = clean_title(x["title"])
        if ct in used_titles:
            continue
        used_titles.add(ct)
        out.append({
            "group": "credit" if len(out) < 5 else "property",
            "title": clean_title(x["title"]), "source": friendly_source(x["url"]),
            "date": guess_date(x["url"], x["snippet"]) or TODAY, "url": x["url"],
            "summary": (x["snippet"] or "").strip()[:120] or "（暂无摘要）",
            "content": fetch_content(x["url"]) or x["snippet"],
        })

    # 最终按 URL 去重，避免同一篇文章在两组重复出现
    _seen = set(); _out = []
    for it in out:
        if it["url"] in _seen:
            continue
        _seen.add(it["url"]); _out.append(it)
    # 补位到 10（按组补，优先同组优质候选，跳过噪声与同文异链）
    _ci = sum(1 for it in _out if it.get("group") == "credit")
    _pi = len(_out) - _ci
    _cores = set(dedup_key(it.get("title", "")) for it in _out)
    for pool, grp, need in ((credit, "credit", 5 - _ci), (prop, "property", 5 - _pi)):
        for x in pool:
            if need <= 0:
                break
            if x["url"] in _seen or is_noise(x):
                continue
            if dedup_key(x["title"]) in _cores:
                continue
            _seen.add(x["url"]); _cores.add(dedup_key(x["title"])); need -= 1
            _out.append({
                "group": grp, "title": clean_title(x["title"]),
                "source": friendly_source(x["url"]),
                "date": guess_date(x["url"], x["snippet"]) or TODAY, "url": x["url"],
                "summary": (x["snippet"] or "").strip()[:120] or "（暂无摘要）",
                "content": fetch_content(x["url"]) or x["snippet"],
            })
    # 仍不足 10 条时，从全部候选跨组补满（仍跳过噪声与同文异链）
    for x in real:
        if len(_out) >= 10:
            break
        if x["url"] in _seen or is_noise(x):
            continue
        if dedup_key(x["title"]) in _cores:
            continue
        _seen.add(x["url"]); _cores.add(dedup_key(x["title"]))
        grp = "credit" if len(_out) < 5 else "property"
        _out.append({
            "group": grp, "title": clean_title(x["title"]),
            "source": friendly_source(x["url"]),
            "date": guess_date(x["url"], x["snippet"]) or TODAY, "url": x["url"],
            "summary": (x["snippet"] or "").strip()[:120] or "（暂无摘要）",
            "content": fetch_content(x["url"]) or x["snippet"],
        })

    out = _out

    data = {"updated": TODAY, "items": out}
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        f.write(
            "/* 每日要闻数据，由 tools/fetch_news.py 自动生成（多源真实搜索 + 大模型整理）。 */\n"
            "window.NEWS_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
        )
    print("OK: wrote %d items, updated=%s" % (len(out), TODAY))


if __name__ == "__main__":
    main()
