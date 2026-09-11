/* 行业要闻模块：助贷 / 信贷 + 房地产
   增强点（2026-09-11）：
   - URL 智能识别：文章页 vs 搜索结果/首页，按钮自动切"原文/搜索"
   - 每条始终有"百度"按钮兜底，URL 不对也能找到
   - 顶部显示抓取时间和源 fetch_news.py 输出状态 */
(function () {
  var group = "all";

  function items() {
    return (window.NEWS_DATA && window.NEWS_DATA.items) || [];
  }
  function keyOf(n) { return n.url || n.title; }
  function isRead(n) { return Store.data.news.read.indexOf(keyOf(n)) >= 0; }

  function toggleRead(n) {
    var k = keyOf(n), arr = Store.data.news.read, i = arr.indexOf(k);
    if (i >= 0) arr.splice(i, 1); else arr.push(k);
    Store.save(); render();
  }

  // 判断链接是不是"文章页"——如果落到首页/搜索结果，按钮应显示"搜索"
  function isHomeOrSearch(url) {
    if (!url) return true;
    try {
      var u = new URL(url);
      var p = u.pathname;
      if (p === "" || p === "/" || p === "/index.html" || p === "/index.htm" || p === "/default.html") return true;
      var host = u.hostname;
      var isSearchEngine = /(google|baidu|bing|sogou)\./.test(host);
      if (isSearchEngine) {
        // 落到这些搜索引擎的搜索/微信搜结果
        if (/\/(search|s\?|weixin|web)|[\?&](q|wd|query)=/.test(p + u.search)) return true;
      }
      return false;
    } catch (e) { return true; }
  }
  // 把 URL 截短成"域名/路径前 18 字"的形式
  function shortUrl(url) {
    try {
      var u = new URL(url);
      var p = u.pathname.replace(/\/+$/, "") || "/";
      if (p.length > 22) p = p.slice(0, 20) + "…";
      return u.hostname.replace(/^www\./, "") + p;
    } catch (e) { return (url || "").slice(0, 30); }
  }
  // 百度站内搜索（用 site: 锁媒体域，更精准）
  function baiduUrl(n) {
    var host = "";
    try { host = new URL(n.url).hostname.replace(/^www\./, ""); } catch (e) {}
    var q = (host ? "site:" + host + " " : "") + (n.title || "");
    return "https://www.baidu.com/s?wd=" + encodeURIComponent(q);
  }

  function render() {
    var all = items();
    var list = all.filter(function (n) { return group === "all" || n.group === group; });
    var unread = all.filter(function (n) { return !isRead(n); }).length;

    $("#newsDate").textContent = dateLabel(window.NEWS_DATA.updated || todayStr());
    $("#newsUnread").innerHTML = unread + " <small>/ " + all.length + "</small>";
    $("#newsCredit").innerHTML = all.filter(function (n) { return n.group === "credit"; }).length + " <small>条</small>";
    $("#newsProp").innerHTML = all.filter(function (n) { return n.group === "property"; }).length + " <small>条</small>";

    var badge = $("#badgeNews");
    if (badge) { badge.textContent = unread; badge.style.display = unread ? "inline-block" : "none"; }

    if (!list.length) { $("#newsList").innerHTML = '<div class="empty">暂无内容</div>'; return; }

    $("#newsList").innerHTML = list.map(function (n, i) {
      var cls = n.group === "credit" ? "credit" : "property";
      var name = n.group === "credit" ? "助贷 / 信贷" : "房地产";
      var isHome = isHomeOrSearch(n.url);
      var mainLabel = isHome ? "🔍 搜索" : "原文";
      var mainCls = isHome ? "btn sm warn" : "btn sm";
      return '<div class="news-item' + (isRead(n) ? " read" : "") + '" data-i="' + all.indexOf(n) + '">' +
        '<div class="idx">' + (i + 1) + "</div>" +
        '<div class="body">' +
        '<div class="t">' + esc(n.title) + "</div>" +
        '<div class="s">' + esc(n.summary || "") + "</div>" +
        '<div class="m"><span class="tag ' + cls + '">' + name + "</span>" +
        "<span>" + esc(n.source || "") + "</span><span>" + dateLabel(n.date) + "</span>" +
        '<a class="src-link" href="' + esc(n.url) + '" target="_blank" rel="noopener" title="' + esc(n.url) + '">' + esc(shortUrl(n.url)) + '</a>' +
        (isHome ? '<span class="hint-warn">⚠ 原文链为首页/搜索，点搜索或百度</span>' : '') + "</div>" +
        "</div>" +
        '<div class="acts">' +
        '<button class="btn sm" data-act="read">' + (isRead(n) ? "已读" : "标已读") + "</button>" +
        '<a class="' + mainCls + '" href="' + esc(n.url) + '" target="_blank" rel="noopener">' + mainLabel + '</a>' +
        '<a class="btn sm" href="' + esc(baiduUrl(n)) + '" target="_blank" rel="noopener" title="百度站内搜索（按媒体域名锁结果）">百度</a>' +
        "</div></div>";
    }).join("");

    $("#newsList").onclick = function (e) {
      var btn = e.target.closest("[data-act]");
      if (btn && e.target.tagName !== "A") {
        var i = parseInt(e.target.closest(".news-item").dataset.i, 10);
        toggleRead(all[i]);
      }
    };
  }

  function bind() {
    $$("#page-news [data-group]").forEach(function (b) {
      b.onclick = function () { group = b.dataset.group; render(); };
    });
    $("#newsReadAll").onclick = function () {
      Store.data.news.read = items().map(keyOf);
      Store.save(); render(); toast("已全部标记为已读");
    };
  }

  // ---- 自动拉取最新要闻 ----
  // 每天北京时间 7:00 由 GitHub Actions 更新 js/data/news.js。
  // 网页/APP 打开即拉最新，无需 WorkBuddy 推送；离线则保留本地（或上次缓存）。
  function newsLiveUrl() {
    // 同源（网页托管在 github.io）用相对路径，APP 离线包用绝对地址
    if (location.hostname.indexOf("github.io") >= 0) return "js/data/news.js";
    return "https://work749.github.io/js/data/news.js";
  }
  function newsLoadCache() {
    try {
      var raw = localStorage.getItem("zxm.news.cache");
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && o.data && o.data.items && o.data.items.length) window.NEWS_DATA = o.data;
    } catch (e) {}
  }
  function newsSaveCache() {
    try {
      localStorage.setItem("zxm.news.cache", JSON.stringify({ t: Date.now(), data: window.NEWS_DATA }));
    } catch (e) {}
  }
  function newsRefreshLive() {
    if (typeof fetch !== "function") return;          // jsdom/极旧环境直接跳过
    var prevDate = window.NEWS_DATA && window.NEWS_DATA.updated;
    var url = newsLiveUrl() + "?t=" + Date.now();
    fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.text();
    }).then(function (txt) {
      if (!/NEWS_DATA\s*=/.test(txt)) return;
      (0, eval)(txt);                                 // 重新赋值 window.NEWS_DATA
      newsSaveCache();
      render();
      if (window.NEWS_DATA.updated && window.NEWS_DATA.updated !== prevDate) {
        try { toast("行业要闻已更新（" + dateLabel(window.NEWS_DATA.updated) + "）", 1600); } catch (e) {}
      }
    }).catch(function () {});                         // 离线/失败：保留本地数据
  }

  window.MOD = window.MOD || {};
  window.MOD.news = {
    init: function () { newsLoadCache(); bind(); render(); newsRefreshLive(); },
    render: render
  };
})();