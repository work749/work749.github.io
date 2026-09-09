/* 行业要闻模块：助贷 / 信贷 + 房地产 */
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
      return '<div class="news-item' + (isRead(n) ? " read" : "") + '" data-i="' + all.indexOf(n) + '">' +
        '<div class="idx">' + (i + 1) + "</div>" +
        '<div class="body">' +
        '<div class="t">' + esc(n.title) + "</div>" +
        '<div class="s">' + esc(n.summary || "") + "</div>" +
        '<div class="m"><span class="tag ' + cls + '">' + name + "</span>" +
        "<span>" + esc(n.source || "") + "</span><span>" + dateLabel(n.date) + "</span></div>" +
        "</div>" +
        '<div class="acts">' +
        '<button class="btn sm" data-act="read">' + (isRead(n) ? "已读" : "标已读") + "</button>" +
        '<a class="btn sm" href="' + esc(n.url) + '" target="_blank" rel="noopener">原文</a>' +
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

  window.MOD = window.MOD || {};
  window.MOD.news = { init: function () { bind(); render(); }, render: render };
})();
