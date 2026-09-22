/* 行业要闻模块：助贷 / 信贷 + 房地产
   交互（2026-09-14 调整）：
   - 点击整条 = 切换已读（可再点一次取消），不再弹出面板
   - 右侧「详情」按钮 = 打开该条详细信息面板（站内展示，不跳走）
   - Google News 跳转链接在 APP 内打不开 → 统一降级为百度站内搜索「搜原文 ↗」 */
(function () {
  var group = "all";
  var current = null;   // 当前阅读面板打开的新闻

  function items() {
    return (window.NEWS_DATA && window.NEWS_DATA.items) || [];
  }
  function keyOf(n) { return n.url || n.title; }
  function isRead(n) { return Store.data.news.read.indexOf(keyOf(n)) >= 0; }

  function toggleRead(n, quiet) {
    var k = keyOf(n), arr = Store.data.news.read, i = arr.indexOf(k), now;
    if (i >= 0) { arr.splice(i, 1); now = false; } else { arr.push(k); now = true; }
    Store.save(); render();
    if (!quiet) { try { toast(now ? "已标记为已读" : "已取消已读", 1200); } catch (e) {} }
    return now;
  }

  // 点击整条新闻：在站内弹出阅读面板显示新闻内容，不跳走、主页面不变；看过即标记已读
  function openNews(n) {
    if (!n) return;
    var isCredit = n.group !== "property";
    var tag = $("#nrTag");
    tag.textContent = isCredit ? "助贷 / 信贷" : "房地产";
    tag.className = "nr-tag " + (isCredit ? "credit" : "property");
    $("#nrTitle").textContent = n.title || "";
    $("#nrMeta").textContent = [n.source, dateLabel(n.date)].filter(Boolean).join(" · ");
    var body = (n.content || n.summary || "").trim();
    $("#nrBody").innerHTML = body
      ? body.split(/\n+/).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("")
      : '<p class="nr-empty">（该条暂无收录正文，可点下方「搜原文 ↗」在百度查找完整内容）</p>';
    // 底部「搜原文」：Google News 跳转链接在部分环境打不开，统一走百度站内搜索（必达）
    var link = $("#nrSearch");
    link.href = baiduUrl(n);
    $("#nrMark").textContent = isRead(n) ? "已读 ✓" : "标为已读";
    var reader = $("#newsReader");
    reader.hidden = false;
    document.body.classList.add("nr-open");
    current = n;
    if (!isRead(n)) toggleRead(n, true);   // 打开详情即算已读（静默，不弹提示）
  }
  function closeReader() {
    var reader = $("#newsReader");
    if (reader) reader.hidden = true;
    document.body.classList.remove("nr-open");
  }

  // Google News 的链接是不透明跳转页，APP 内嵌浏览器 / 部分环境打不开 → 降级为百度站内搜索
  function isDeadLink(url) {
    if (!url) return true;
    return /news\.google\.com/.test(url) || /^\s*javascript:/i.test(url);
  }
  // 可靠的跳转地址：能直达就用原链，否则用百度站内搜索（必达）
  function safeUrl(n) { return isDeadLink(n.url) ? baiduUrl(n) : n.url; }
  // 把 URL 截短成"域名/路径前 18 字"的形式
  function shortUrl(url) {
    try {
      var u = new URL(url);
      var p = u.pathname.replace(/\/+$/, "") || "/";
      if (p.length > 22) p = p.slice(0, 20) + "…";
      return u.hostname.replace(/^www\./, "") + p;
    } catch (e) { return (url || "").slice(0, 30); }
  }
  // 百度搜索（能直达的原链用 site: 锁媒体域；Google 跳转页则用「标题 + 来源名」，否则搜不到）
  function baiduUrl(n) {
    var host = "";
    try { host = new URL(n.url).hostname.replace(/^www\./, ""); } catch (e) {}
    if (isDeadLink(n.url)) host = "";
    var q = n.title || "";
    if (host) q = "site:" + host + " " + q;
    else if (n.source && q.indexOf(n.source) < 0) q = q + " " + n.source;
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
      return '<div class="news-item' + (isRead(n) ? " read" : "") + '" data-i="' + all.indexOf(n) + '" data-url="' + esc(n.url) + '">' +
        '<div class="idx">' + (i + 1) + "</div>" +
        '<div class="body">' +
        '<div class="t">' + esc(n.title) + "</div>" +
        '<div class="s">' + esc(n.summary || "") + "</div>" +
        '<div class="m"><span class="tag ' + cls + '">' + name + "</span>" +
        "<span>" + esc(n.source || "") + "</span><span>" + dateLabel(n.date) + "</span>" +
        '<a class="src-link" href="' + esc(safeUrl(n)) + '" target="_blank" rel="noopener" ' +
        'title="' + esc(isDeadLink(n.url) ? "原链接不可直达，点此搜索原文：" + (n.title || "") : n.url) + '">' +
        esc(isDeadLink(n.url) ? "搜原文 ↗" : shortUrl(n.url)) + "</a>" +
        "</div>" +
        "</div>" +
        '<div class="acts">' +
        '<button class="btn sm" data-act="detail">详情</button>' +
        '<span class="open-hint">点击整条标记已读</span>' +
        "</div></div>";
    }).join("");

    $("#newsList").onclick = function (e) {
      var item = e.target.closest(".news-item");
      if (!item) return;
      var i = parseInt(item.dataset.i, 10);
      var n = all[i];
      if (!n) return;
      // 点「详情」按钮：打开该条详细信息（不跳走）
      if (e.target.closest('[data-act="detail"]')) { openNews(n); return; }
      // 点来源链接：让它自己跳，不触发已读切换
      if (e.target.closest(".src-link")) return;
      // 整条其余区域点击：切换已读
      toggleRead(n);
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

    // ---- 手动刷新：点一下立刻拉最新（跳过节流） ----
    var rbtn = $("#newsRefresh");
    if (rbtn) rbtn.onclick = function () {
      try { toast("正在拉取最新要闻…", 1000); } catch (e) {}
      newsRefreshLive(true, function (ok, date, changed) {
        if (ok && !changed) { try { toast("已是最新（" + dateLabel(date) + "）", 1400); } catch (e) {} }
        else if (!ok) { try { toast("拉取失败，稍后再试（当前为缓存数据）", 1400); } catch (e) {} }
      });
    };

    // ---- 手机 APP 从后台切回 / 网络恢复：自动拉最新（有网就更新，WebView 不重载页面也能刷） ----
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) newsRefreshLive();
    });
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) newsRefreshLive();            // iOS/浏览器 bfcache 恢复
    });
    window.addEventListener("online", function () { newsRefreshLive(); });

    // ---- 站内阅读面板：关闭 / ESC / 面板内「标为已读」 ----
    var reader = $("#newsReader");
    if (reader) {
      reader.addEventListener("click", function (e) {
        if (e.target.closest("[data-nr-close]")) closeReader();
      });
      $("#nrMark").addEventListener("click", function () {
        if (!current) return;
        toggleRead(current, true);
        $("#nrMark").textContent = isRead(current) ? "已读 ✓" : "标为已读";
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && reader && !reader.hidden) closeReader();
    });
  }

  // ---- 自动拉取最新要闻 ----
  // 数据源每天北京时间 7:00 更新 js/data/news.js（服务器）。
  // 网页/APP 打开即拉最新；APP 从后台切回（WebView 不重载页面）时也会自动拉，
  // 只要手机有网就能拿到当天要闻；离线则保留本地缓存。
  var lastFetch = 0;
  var FETCH_GAP = 5 * 60 * 1000;   // 自动拉取最小间隔：5 分钟内切后台再回来不重复请求
  function newsLiveUrls() {
    // 多源容错：github.io 在部分手机网络不可达 → 依次尝试 jsDelivr CDN 镜像（国内一般可达）
    var urls = [];
    if (location.hostname.indexOf("github.io") >= 0) urls.push("js/data/news.js");
    urls.push("https://work749.github.io/js/data/news.js");
    urls.push("https://cdn.jsdelivr.net/gh/work749/work749.github.io@main/js/data/news.js");
    return urls;
  }
  function fetchWithTimeout(url, ms) {
    if (typeof AbortController !== "undefined") {
      var c = new AbortController();
      var t = setTimeout(function () { c.abort(); }, ms);
      return fetch(url, { cache: "no-store", signal: c.signal }).then(
        function (r) { clearTimeout(t); return r; },
        function (e) { clearTimeout(t); throw e; }
      );
    }
    return fetch(url, { cache: "no-store" });
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
  // force=true 手动刷新，跳过节流；done(ok, date, changed) 供手动刷新反馈
  function newsRefreshLive(force, done) {
    if (typeof fetch !== "function") { if (done) done(false); return; }
    var now = Date.now();
    if (!force && now - lastFetch < FETCH_GAP) { if (done) done(false); return; }
    lastFetch = now;
    var prevDate = window.NEWS_DATA && window.NEWS_DATA.updated;
    var urls = newsLiveUrls();
    var i = 0;
    function tryNext() {
      if (i >= urls.length) { if (done) done(false); return; }   // 全部源失败：保留本地缓存
      var u = urls[i++] + "?t=" + Date.now();
      fetchWithTimeout(u, 8000).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.text();
      }).then(function (txt) {
        if (!/NEWS_DATA\s*=/.test(txt)) throw new Error("bad payload");
        (0, eval)(txt);                                 // 重新赋值 window.NEWS_DATA
        newsSaveCache();
        render();
        var changed = window.NEWS_DATA.updated && window.NEWS_DATA.updated !== prevDate;
        if (changed) {
          try { toast("行业要闻已更新（" + dateLabel(window.NEWS_DATA.updated) + "）", 1600); } catch (e) {}
        }
        if (done) done(true, window.NEWS_DATA.updated, changed);
      }).catch(tryNext);                                 // 该源失败：试下一个源
    }
    tryNext();
  }

  window.MOD = window.MOD || {};
  window.MOD.news = {
    init: function () { newsLoadCache(); bind(); render(); newsRefreshLive(); },
    render: render
  };
})();