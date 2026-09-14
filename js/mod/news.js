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