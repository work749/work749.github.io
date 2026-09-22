#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日 7:00（北京时间）抓 10 条助贷/房产要闻，写入 js/data/news.js。

真实新闻来源（多级容错，2026-09-22 重构）：
  1. 智谱独立 web_search API（主力）：服务端搜索，绕开本机对 gnews 的网络限制，
     返回真实标题/发布日期/正文摘录（link 常为空 → 前端自动降级「搜原文」）。
     注意：这是 /web_search 独立接口；chat 接口挂 web_search 工具实测无效，勿混用。
  2. 新浪财经滚动新闻 API（补充）：国内必达，真实 URL + 当日日期 + 媒体名。
  3. gnews / Bing / 百度 / DDG（兜底）：本机网络受限时基本不可用，保留给云端/正常网络。
拿到候选后用 ZXM_API_KEY 调大模型整理成结构化 JSON；LLM 产出条目同样过噪声过滤。
质量门禁：不足 6 条或任一组 < 2 条 → 不写文件（保留已有数据），退出码 4。

环境变量：
  ZXM_API_KEY   必填，智谱 GLM API 密钥
  ZXM_BASE_URL  选填，默认 https://open.bigmodel.cn/api/paas/v4
  ZXM_MODEL     选填，默认 glm-4-flash
"""
import time
import datetime
import json
import os
import re
import socket
import sys
import email.utils
import urllib.error
import urllib.parse
import urllib.request
import html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "js", "data", "news.js")
TODAY = datetime.date.today().strftime("%Y-%m-%d")

# “昨天的新闻”：摘要以运行日的前一天为基准日；查询带当月时间偏向，仅保留近期结果
ASOF = (datetime.date.today() - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
_Y, _M = TODAY.split("-")[:2]
MONTH_TAG = "%s年%s月" % (_Y, str(int(_M)))
def time_bias(q):
    return (q + " " + MONTH_TAG).strip()

KEY = os.environ.get("ZXM_API_KEY", "").strip()
BASE = os.environ.get("ZXM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").strip().rstrip("/")
MODEL = os.environ.get("ZXM_MODEL", "glm-4-flash").strip()

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
socket.setdefaulttimeout(25)

# 明显非新闻的垃圾域名（百科/字典/房产门户/贷款产品页/厂商站），过滤掉
JUNK = ("baike", "zidian", "hanyu", "dict", "wiki", "anjuke", "fang.com",
        "58.com", "zhihu.com", "douban", "weibo", "sogou", "ganji",
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
        "china.com.cn", "jwview", "eeo", "finance", "news", "news.google")

CREDIT_BASE = [
    "贷款市场报价利率 LPR 最新",
    "消费贷 贴息 政策 商业银行",
    "普惠金融 央行 最新",
    "互联网贷款 监管 新规",
    "经营贷 资金 违规 流入 监管",
    "个人征信 新规",
]
CREDIT_QUERIES = [time_bias(q) for q in CREDIT_BASE]
PROP_BASE = [
    "房贷 利率 下调",
    "存量房贷 利率 调整 最新",
    "深圳 二手房 成交",
    "房价 环比 走势",
    "房地产 止跌回稳 政策",
    "限购 城市 放开",
]
PROP_QUERIES = [time_bias(q) for q in PROP_BASE]

# 智谱 web_search 专用查询（2026-09-22 调优：搜索引擎语义，不加月份偏置，实测召回更准）
ZHIPU_CREDIT = [
    "贷款市场报价利率 LPR 最新公布",
    "消费贷 银行 最新政策",
    "消费贷 贴息 政策",
    "助贷 互联网贷款 监管 新规",
    "经营贷 违规 监管 处罚",
    "个人征信 央行 新规",
    "普惠金融 央行 政策",
    "公积金 贷款 新政",
]
ZHIPU_PROP = [
    "存量房贷利率 调整",
    "房贷利率 下调 最新",
    "70城房价 国家统计局",
    "楼市 新政 止跌回稳",
    "二手房 成交 一线城市",
    "限购 放开 城市",
    "保障房 政策",
    "深圳 楼市 成交",
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
        doc = _get("https://www.bing.com/search?q=" + urllib.parse.quote(q) + "&setlang=zh-CN&cc=CN&count=20&qft=interval%3d%227%22")
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


def resolve_redirect(url, timeout=8):
    """跟随 30x 拿到真实文章 URL（Google News / Bing News 链接是重定向）。失败原样返回。"""
    try:
        # 用 GET（HEAD 常被拒）；urllib 会自动跟随 3xx，geturl() 即最终地址
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            final = r.geturl()
            r.read(4096)
        return final if final and final != url else url
    except Exception:
        return url


def search_gnews(q, max_n=10):
    """Google News RSS：真实、近实时、自带发布日期，是"昨天的新闻"的最佳来源。
    沙箱可能被墙（超时即返回空，不影响兜底）。云端正常网络可用。"""
    try:
        doc = _get("https://news.google.com/rss/search?q=" + urllib.parse.quote(q) +
                   "&hl=zh-CN&gl=CN&ceid=CN:zh-Hans", timeout=15)
    except Exception as e:
        print("WARN gnews 失败: %s" % e, file=sys.stderr)
        return []
    out = []
    for item in re.findall(r"<item>(.*?)</item>", doc, re.S):
        t = re.search(r"<title>(.*?)</title>", item, re.S)
        l = re.search(r"<link>(.*?)</link>", item, re.S)
        if not (t and l):
            continue
        title = html.unescape(t.group(1)).strip()
        link = l.group(1).strip()
        real = resolve_redirect(link) or link
        iso = ""
        pd = re.search(r"<pubDate>(.*?)</pubDate>", item, re.S)
        if pd:
            try:
                dt = email.utils.parsedate_to_datetime(pd.group(1).strip())
                if dt:
                    iso = dt.strftime("%Y-%m-%d")
            except Exception:
                pass
        desc = re.search(r"<description>(.*?)</description>", item, re.S)
        # 先反转义再剥标签：RSS 里 <description> 是双重转义的 &lt;a href=...&gt;
        ds = re.sub(r"<[^>]+>", "", html.unescape(desc.group(1))).strip() if desc else ""
        ds = ds.replace("&nbsp;", " ").strip()
        snip = ("%s %s" % (iso, ds)).strip()
        # RSS 自带真实媒体名与媒体域名（链接是 news.google.com 重定向，来源要取这里）
        sm = re.search(r'<source[^>]*url="([^"]+)"[^>]*>(.*?)</source>', item, re.S)
        src_url = sm.group(1).strip() if sm else ""
        src_name = html.unescape(re.sub(r"<[^>]+>", "", sm.group(2))).strip() if sm else ""
        out.append({"title": title, "url": real, "snippet": snip[:220],
                    "src_url": src_url, "src_name": src_name})
    return out[:max_n]


def search_zhipu(q, max_n=10):
    """智谱独立 web_search API：服务端执行搜索，不受本机网络限制，
    返回真实标题/正文摘录/发布日期（link 常为空，前端自动降级「搜原文」）。"""
    if not (KEY and BASE):
        return []
    body = {"search_engine": "search_std", "search_query": q, "count": max_n}
    req = urllib.request.Request(
        BASE + "/web_search",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print("WARN zhipu_search 失败(%s): %s" % (q[:20], e), file=sys.stderr)
        return []
    out = []
    for x in (d.get("search_result") or [])[:max_n]:
        title = html.unescape(str(x.get("title") or "")).strip()
        if not title:
            continue
        date = str(x.get("publish_date") or "")[:10]
        content = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", str(x.get("content") or "")))).strip()
        snip = ("%s %s" % (date, content)).strip()[:260]
        link = (x.get("link") or "").strip()
        if link and not link.startswith("http"):
            link = ""
        it = {"title": title, "url": link, "snippet": snip,
              "src_name": str(x.get("media") or "").strip()[:20]}
        out.append(it)
    return out


def search_sina_roll(max_n=50):
    """新浪财经滚动新闻 API：国内必达，真实 URL、自带日期与媒体名；
    属跨主题财经滚动，由关键词过滤后再分归 credit/property。"""
    out = []
    try:
        doc = _get("https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&k=&num=%d&page=1" % max_n, timeout=15)
        d = json.loads(doc)
        for x in ((d.get("result") or {}).get("data") or []):
            title = str(x.get("title") or "").strip()
            url = str(x.get("url") or "").strip()
            if not title or not url.startswith("http"):
                continue
            try:
                date = time.strftime("%Y-%m-%d", time.localtime(int(x.get("ctime") or 0)))
            except Exception:
                date = ""
            intro = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", str(x.get("intro") or "")))).strip()
            out.append({"title": title, "url": url,
                        "snippet": ("%s %s" % (date, intro)).strip()[:260],
                        "src_name": str(x.get("media_name") or "新浪财经").strip()[:20]})
    except Exception as e:
        print("WARN sina_roll 失败: %s" % e, file=sys.stderr)
    return out


def search(q, max_n=10):
    """兜底链（本机网络受限时多数超时）：Google News RSS → Bing → 百度 → DDG。"""
    for fn in (search_gnews, search_bing, search_baidu, search_ddg):
        try:
            r = fn(q, max_n)
            if r:
                return r
        except Exception:
            pass
    return []


def score_pool(items, kws, min_score=1):
    """标题关键词×2 + 摘要×1 + 新闻域名加权 + 新鲜度加权；min_score 过滤弱相关。"""
    scored = []
    ad = datetime.date.fromisoformat(ASOF)
    for x in items:
        t = x["title"].lower()
        st = (x["snippet"] or "").lower()
        s = 2 * sum(1 for k in kws if k in t) + sum(1 for k in kws if k in st)
        h = host_of(x["url"])
        if any(d in h for d in NEWS):
            s += 3
        d = guess_date(x["url"], x["snippet"])
        if d:
            try:
                age = (ad - datetime.date.fromisoformat(d)).days
                if age < 0 or age <= 7:
                    s += 2   # 一周内（含当天发布）= 昨日要闻优先
                elif age <= 14:
                    s += 1
            except Exception:
                pass
        if s >= min_score:
            scored.append((s, x))
    scored.sort(key=lambda t: -t[0])
    return [x for _, x in scored]


def fetch_content(url):
    # Google News 链接是跳转页，抓不到正文，直接放弃（回退用 RSS 摘要）
    if "news.google" in url:
        return ""
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
        "选材标准（重要）：只要真实的行业政策、监管动态、市场数据新闻（如 LPR/存量房贷/消费贷政策/公积金新政/"
        "70城房价/城市成交/银行信贷风险）；坚决剔除：地方宣传活动稿、论坛会议通稿、贷款攻略/避坑类软文、"
        "泛财经投资建议（股市/债市/商品/汇率，与助贷房贷无关）。\n"
        "输出严格 JSON 数组，不要任何额外文字、Markdown 或代码块标记。\n"
        "每条字段：\n"
        "  group   \"credit\" 或 \"property\"\n"
        "  title   短标题（20字内，保留关键数字与城市名）\n"
        "  source  媒体简称（从链接域名或摘要推断，不要写机构正文前缀）\n"
        "  date    YYYY-MM-DD，优先用今天 %s；若素材含明确日期则用它\n"
        "  url     必须是素材给出的真实链接之一，禁止自造；素材未给链接就输出空字符串\n"
        "  summary 30-60字，说清对助贷从业者或楼市的实际影响\n"
        "共 10 条：5 条 credit（助贷/信贷/LPR/消费贷/经营贷/监管/征信/普惠金融/公积金），"
        "5 条 property（楼市/限购/房贷利率/深圳成交/房价）；同一事件只保留一条，宁可少选也不凑数。\n"
        "只输出 JSON 本身。"
    ) % ASOF
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
    # 单发、110s 预算：本环境免费档对这个任务约需 100s+（2026-09-22 由 50s 上调），超时即放弃改用本地结果。
    try:
        with urllib.request.urlopen(req, timeout=110) as resp:
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


KNOWN_VALUES = set(KNOWN_SOURCE.values())


def source_of(item, url=""):
    """来源名：优先用 RSS 自带的真实媒体（Google News 链接域名是 news.google.com，没意义）。"""
    if isinstance(item, dict):
        su = (item.get("src_url") or "").strip()
        if su:
            nm = friendly_source(su)
            if nm in KNOWN_VALUES:
                return nm
        nm2 = (item.get("src_name") or "").strip()
        if nm2:
            return nm2[:20]
        nm3 = _src_from_snippet(item.get("snippet") or "")
        if nm3:
            return nm3
    return friendly_source(url)


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


def _bigrams(t):
    t = re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", t or "")
    return set(t[i:i + 2] for i in range(len(t) - 1)) if len(t) > 1 else {t}


def title_dup(a, b):
    """标题近似重复（LLM 改写标题会绕过 dedup_key）：2-gram 短串包含率 >= 0.7 视为同一条。"""
    A, B = _bigrams(a), _bigrams(b)
    if not A or not B:
        return False
    inter = len(A & B)
    small = A if len(A) <= len(B) else B
    return inter / len(small) >= 0.6


def _num_sig(t):
    """数字指纹：数据类新闻（LPR/房价/利率）的去重依据，忽略年份。"""
    s = set(re.findall(r"\d+(?:\.\d+)?%?", t or ""))
    s.discard("2026")
    return s


def same_story(t_a, s_a, t_b, s_b):
    """同一条新闻判定：标题 2-gram 相似，或数字指纹高度重合（如同一期 LPR/房价数据）。"""
    if title_dup(t_a, t_b):
        return True
    A = _num_sig((t_a or "") + " " + (s_a or ""))
    B = _num_sig((t_b or "") + " " + (s_b or ""))
    if A and B:
        inter = len(A & B)
        small = A if len(A) <= len(B) else B
        if inter >= 2 and inter / len(small) >= 0.6:
            return True
    return False


def _src_from_snippet(s):
    """从正文摘录里提取「来源：XXX」作为媒体名。"""
    m = re.search(r"来源[：:]\s*([\u4e00-\u9fffA-Za-z0-9（）]{2,14})", s or "")
    return m.group(1).strip() if m else ""


def guess_date(url, snippet):
    for s in (url, snippet or ""):
        m = re.search(r"(20\d{2})[-./年](\d{1,2})[-./月](\d{1,2})", s)
        if m:
            return "%s-%02d-%02d" % (m.group(1), int(m.group(2)), int(m.group(3)))
        m = re.search(r"(20\d{2})(\d{2})(\d{2})", s)
        if m:
            return "%s-%s-%s" % (m.group(1), m.group(2), m.group(3))
    return ""


def recent_filter(credit_raw, prop_raw, asof):
    """保留近期（昨天的新闻）：丢弃超过窗口的陈旧旧闻与无日期非新闻页；
    候选不足时逐级放宽年龄窗口（120天→1年），但绝不回填 2020/2021 等更早旧闻——宁缺毋滥。"""
    ad = datetime.date.fromisoformat(asof)

    def keep(pool, max_age):
        out = []
        for x in pool:
            d = guess_date(x["url"], x["snippet"])
            age = None
            if d:
                try:
                    age = (ad - datetime.date.fromisoformat(d)).days
                except Exception:
                    age = None
            if age is not None and age > max_age:
                continue  # 超过窗口，明显旧闻
            if age is None and host_of(x["url"]) not in NEWS:
                continue  # 无日期且非新闻域，视为旧闻/噪声
            out.append(x)
        return out

    c, p = keep(credit_raw, 14), keep(prop_raw, 14)
    if len(c) < 3 or len(p) < 3:
        print("WARN: 近14天候选不足，放宽至近30天", file=sys.stderr)
        c, p = keep(credit_raw, 30), keep(prop_raw, 30)
    if len(c) < 3 or len(p) < 3:
        print("WARN: 近30天仍不足，放宽至近45天（绝不回填更早旧闻）", file=sys.stderr)
        c, p = keep(credit_raw, 45), keep(prop_raw, 45)
    # 不再继续放宽：绝不回填陈旧旧闻，宁缺毋滥
    return c, p


def is_noise(x):
    """剔除计算器/名词解释/登录页/站点首页等非新闻内容。"""
    t = x["title"] or ""
    u = x["url"] or ""
    low = u.lower()
    if any(k in t for k in ("计算器", "什么是", "登录", "首页", "概览", "查询", "攻略", "避坑",
                            "宣传周", "论坛", "峰会", "沙龙", "课程", "报名", "直播", "回放",
                            "训练营", "公开课")):
        return True
    if "经营" in t and "管理" in t:  # 经营/管理自嗨软文，非楼市新闻
        return True
        return True
    if t.strip() in ("深圳政府在线", "自然人电子税务局", "中国政府网", "首页"):
        return True
    path = (urllib.parse.urlparse(u).path or "") if u else None
    if path is None:
        pass  # 无 URL（智谱搜索结果常见）：不代表垃圾，前端自动降级「搜原文」
    elif path in ("", "/") or path.endswith("/login") or "/webstatic/" in low or path.endswith("login"):
        return True
    if "zhihu.com/topic" in low or "/topic/" in low:
        return True
    if any(k in (t + (x.get("snippet") or "")) for k in ("百科", "话题", "词条", "释义")):
        return True
    if re.search(r"(?i)/loans?/", low):
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
                "source": source_of(x, x["url"]),
                "date": guess_date(x["url"], x["snippet"]) or ASOF,
                "url": x["url"],
                "summary": (x["snippet"] or "").strip()[:120] or "（暂无摘要）",
            })
    return items


def main():
    seen = set()
    seen_title = set()
    credit_raw, prop_raw = [], []

    def _add(x, grp):
        u = x["url"] or ""
        key = u or ("t:" + dedup_key(x["title"]))
        tk = dedup_key(x["title"])
        if key in seen or is_junk(u) or tk in seen_title:
            return
        seen.add(key)
        seen_title.add(tk)
        (credit_raw if grp == "credit" else prop_raw).append(x)

    # 1) 智谱 web_search（主力源：服务端搜索，绕开本机网络限制）
    #    注意：不加"YYYY年M月"月份偏置——实测加了反而劣化召回；新鲜度交给 publish_date + recent_filter。
    zhipu_hits = 0
    for q in ZHIPU_CREDIT:
        for x in search_zhipu(q):
            zhipu_hits += 1
            _add(x, "credit")
    for q in ZHIPU_PROP:
        for x in search_zhipu(q):
            zhipu_hits += 1
            _add(x, "property")
    print("INFO: zhipu 命中 %d（credit %d / property %d）" % (zhipu_hits, len(credit_raw), len(prop_raw)), file=sys.stderr)

    # 2) 新浪财经滚动（真实 URL + 当日新闻；只按标题关键词分组，避免正文提了一嘴"信贷"的泛财经混入）
    for x in search_sina_roll():
        if is_junk(x["url"]):
            continue
        t_low = x["title"].lower()
        ck = sum(1 for k in CREDIT_KW if k in t_low)
        pk = sum(1 for k in PROP_KW if k in t_low)
        if ck >= 2 and ck > pk:
            _add(x, "credit")
        elif pk >= 2 and pk > ck:
            _add(x, "property")

    # 3) 兜底：主源候选不足时才启用 gnews/Bing/百度/DDG（本机网络受限时基本超时）
    if len(credit_raw) < 4 or len(prop_raw) < 4:
        print("WARN: 主源候选不足（credit %d / property %d），启用搜索兜底链"
              % (len(credit_raw), len(prop_raw)), file=sys.stderr)
        for q in CREDIT_QUERIES:
            for x in search(q):
                _add(x, "credit")
        for q in PROP_QUERIES:
            for x in search(q):
                _add(x, "property")

    # 只保留近期（昨天的新闻），不足再逐级放宽
    credit_raw, prop_raw = recent_filter(credit_raw, prop_raw, ASOF)

    credit = score_pool(credit_raw, CREDIT_KW, min_score=1)[:9]
    prop = score_pool(prop_raw, PROP_KW, min_score=1)[:9]
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

    # 组装最终列表：保留每条真实 group（不再按序号硬分），并做 URL/同文去重
    def _group_of(it, url):
        g = str(it.get("group", "")).strip().lower() if isinstance(it, dict) else ""
        if g in ("credit", "property"):
            return g
        if any(url == x["url"] for x in credit):
            return "credit"
        if any(url == x["url"] for x in prop):
            return "property"
        t = (it.get("title", "") if isinstance(it, dict) else "") + " "
        return "credit" if sum(1 for k in CREDIT_KW if k in t) >= sum(1 for k in PROP_KW if k in t) else "property"

    out = []
    used_keys = set()

    def _uk(u, t):
        """去重键：有 URL 用 URL，无 URL（智谱搜索常见）用标题。"""
        return u or ("t:" + dedup_key(t))

    for it in parsed:
        if not isinstance(it, dict) or len(out) >= 10:
            continue
        url = str(it.get("url", "")).strip()
        title = str(it.get("title", "")).strip()
        summary = str(it.get("summary", "") or "").strip()
        # LLM 自造/不认识的链接（不在真实候选里）：置空，前端自动降级「搜原文」，绝不信大模型给的 URL
        if url and url not in real_urls:
            url = ""
        # 质量门禁：LLM 产出同样要过噪声/垃圾过滤（2026-09-22 修复：此前绕过过滤导致登录页/计算器入库）
        if is_noise({"title": title, "url": url, "snippet": summary}):
            continue
        if url and is_junk(url):
            continue
        k = _uk(url, title)
        if k in used_keys or any(same_story(title, summary, o["title"], o.get("summary", "")) for o in out):
            continue
        grp = _group_of(it, url)
        # 按链接或标题回找真实候选，带出其正文摘录（比 LLM 摘要更完整）
        snip = next((x["snippet"] for x in real if (url and x["url"] == url) or title_dup(title, x["title"])), "")
        content = fetch_content(url) if url else ""
        content = content or snip or summary
        # 来源清洗：LLM 偶尔把日期当来源；候选 src_name → 正文「来源：」→ 域名 → 兜底
        src = str(it.get("source", "") or "").strip()
        if re.match(r"^\d{4}[-/年.]", src):
            src = ""
        if not src:
            src = next((x.get("src_name") for x in real if (url and x["url"] == url) or title_dup(title, x["title"])), "")
        if not src:
            src = _src_from_snippet(snip or summary)
        if not src and url:
            src = friendly_source(url)
        out.append({
            "group": grp,
            "title": title[:40] or "(无标题)",
            "source": (src or "行业资讯")[:20],
            "date": (str(it.get("date", guess_date(url, snip)) or ASOF))[:10],
            "url": url,
            "summary": (summary or snip or "（暂无摘要）").strip()[:120],
            "content": content,
        })
        used_keys.add(k)

    # 不足 10 条：从近期候选按真实 group 补位（跳过噪声/重复）
    def _add_from(pool, grp):
        for x in pool:
            if len(out) >= 10:
                return
            if _uk(x["url"], x["title"]) in used_keys or is_noise(x):
                continue
            if any(same_story(x["title"], x["snippet"], o.get("title", ""), o.get("summary", "")) for o in out):
                continue
            snip = x["snippet"] or ""
            out.append({
                "group": grp,
                "title": clean_title(x["title"]),
                "source": (source_of(x, x["url"]) or "行业资讯"),
                "date": guess_date(x["url"], snip) or ASOF,
                "url": x["url"],
                "summary": snip.strip()[:120] or "（暂无摘要）",
                "content": (fetch_content(x["url"]) if x["url"] else "") or snip,
            })
            used_keys.add(_uk(x["url"], x["title"]))

    for _ in range(10):
        before = len(out)
        _add_from(credit, "credit")
        _add_from(prop, "property")
        if len(out) >= 10 or len(out) == before:
            break

    # 仍不足则跨组补满（保留真实 group）
    for x in real:
        if len(out) >= 10:
            break
        g = "credit" if x in credit else "property"
        if _uk(x["url"], x["title"]) in used_keys or is_noise(x):
            continue
        if any(same_story(x["title"], x["snippet"], o.get("title", ""), o.get("summary", "")) for o in out):
            continue
        snip = x["snippet"] or ""
        out.append({
            "group": g,
            "title": clean_title(x["title"]),
            "source": (source_of(x, x["url"]) or "行业资讯"),
            "date": guess_date(x["url"], snip) or ASOF,
            "url": x["url"],
            "summary": snip.strip()[:120] or "（暂无摘要）",
            "content": (fetch_content(x["url"]) if x["url"] else "") or snip,
        })
        used_keys.add(_uk(x["url"], x["title"]))

    # 平衡两组，避免某组空白：从近期候选(real)补位，按关键词判定归属（绝不引入旧闻）
    def _ensure_balance():
        for _ in range(10):
            if len(out) >= 10:
                return
            cred_n = sum(1 for o in out if o["group"] == "credit")
            prop_n = sum(1 for o in out if o["group"] == "property")
            if cred_n >= 3 and prop_n >= 3:
                return
            need = "credit" if cred_n <= prop_n else "property"
            best = None
            for x in real:
                if _uk(x["url"], x["title"]) in used_keys or is_noise(x):
                    continue
                if any(same_story(x["title"], x["snippet"], o.get("title", ""), o.get("summary", "")) for o in out):
                    continue
                txt = (x["title"] + " " + x["snippet"]).lower()
                ck = sum(1 for k in CREDIT_KW if k in txt)
                pk = sum(1 for k in PROP_KW if k in txt)
                if need == "credit" and ck < pk:
                    continue
                if need == "property" and pk < ck:
                    continue
                best = x
                break
            if not best and ((cred_n == 0) if need == "credit" else (prop_n == 0)):
                # 仅在该组完全为空时放宽：避免把楼市新闻硬标成信贷新闻
                for x in real:
                    if _uk(x["url"], x["title"]) not in used_keys and not is_noise(x):
                        best = x
                        break
            if not best:
                break  # 无候选可补：跳出循环，交给下面的"改标"兜底
            snip = best["snippet"] or ""
            out.append({
                "group": need,
                "title": clean_title(best["title"]),
                "source": source_of(best, best["url"]),
                "date": guess_date(best["url"], snip) or ASOF,
                "url": best["url"],
                "summary": snip.strip()[:120] or "（暂无摘要）",
                "content": (fetch_content(best["url"]) if best["url"] else "") or snip,
            })
            used_keys.add(_uk(best["url"], best["title"]))

        # 仍为 0 的组：把对方组中"同时命中本组关键词≥2"的条目改标（如房贷利率既是楼市也是信贷）
        for grp, other, kws in (("credit", "property", CREDIT_KW), ("property", "credit", PROP_KW)):
            if any(o["group"] == grp for o in out):
                continue
            for o in out:
                if o["group"] != other:
                    continue
                txt = (o.get("title", "") + " " + o.get("summary", "")).lower()
                if sum(1 for k in kws if k in txt) >= 2:
                    o["group"] = grp
                    break
    _ensure_balance()

    # ---- 主题相关性终检：标题+摘要不含任何组关键词的泛财经剔除（瑞银配置建议/期货监管等） ----
    out = [o for o in out if any(k in (o["title"] + " " + o["summary"]).lower()
                                 for k in CREDIT_KW + PROP_KW)]
    out = out[:10]  # 上限 10 条

    # ---- 质量门禁（2026-09-22 新增）：不足 6 条或任一组 < 2 条 → 不写文件，保留已有数据 ----
    # 此前 0 条/纯垃圾结果也会覆盖 news.js，导致线上数据被清空/倒退。
    cred_n = sum(1 for o in out if o["group"] == "credit")
    prop_n = sum(1 for o in out if o["group"] == "property")
    if len(out) < 6 or cred_n < 2 or prop_n < 2:
        print("SKIP: 质量门禁未达标（共 %d 条：credit %d / property %d），保留原有数据不覆盖"
              % (len(out), cred_n, prop_n), file=sys.stderr)
        sys.exit(4)

    data = {"updated": ASOF, "items": out}
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        f.write(
            "/* 每日要闻数据，由 tools/fetch_news.py 自动生成（多源真实搜索 + 大模型整理）。 */\n"
            "window.NEWS_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
        )
    print("OK: wrote %d items, updated=%s" % (len(out), ASOF))


if __name__ == "__main__":
    main()
