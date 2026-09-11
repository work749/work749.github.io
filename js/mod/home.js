/* 首页 Portal：三大主入口 + 次要入口 + 未读统计 */
(function () {
  function getNewsStats() {
    var news = (window.NEWS_DATA && window.NEWS_DATA.items) || [];
    var read = (window.Store && Store.data && Store.data.news && Store.data.news.read) || [];
    var credit = 0, prop = 0, creditUnread = 0, propUnread = 0;
    var keyOf = function (n) { return n.url || n.title; };
    for (var i = 0; i < news.length; i++) {
      var n = news[i];
      var isRead = read.indexOf(keyOf(n)) >= 0;
      if (n.kind === "credit") { credit++; if (!isRead) creditUnread++; }
      else if (n.kind === "property") { prop++; if (!isRead) propUnread++; }
      else if (!isRead) creditUnread++;
    }
    return {
      total: news.length,
      credit: credit,
      property: prop,
      unread: creditUnread + propUnread
    };
  }

  function getDdjStats() {
    var d = (Store && Store.data && Store.data.ddj) || {};
    return {
      done: (d.done || []).length,
      streak: d.streak || 0
    };
  }

  function getNceStats() {
    var n = (Store && Store.data && Store.data.nce) || {};
    var total = (window.NCE_LESSONS) ? window.NCE_LESSONS.length : 0;
    var readDays = n.readDays || {};
    var last = n.lastLesson || 1;
    var today = window.todayStr();
    var todayRead = readDays[today] || 0;
    return { last: last, total: total, todayRead: todayRead };
  }

  function getMemoStats() {
    var m = (Store && Store.data && Store.data.memo) || {};
    var items = m.items || [];
    var today = window.todayStr();
    var todayN = 0, openN = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].day === today) todayN++;
      if (!items[i].done) openN++;
    }
    return { total: items.length, today: todayN, open: openN };
  }

  function getFluteStats() {
    var f = (Store && Store.data && Store.data.flute) || {};
    return {
      done: (f.done || []).length,
      streak: f.streak || 0,
      minutes: f.seconds ? Math.floor((f.seconds[todayStr()] || 0) / 60) : 0
    };
  }

  function timeOfDay() {
    var h = new Date().getHours();
    if (h < 6) return "凌晨";
    if (h < 11) return "早上";
    if (h < 14) return "中午";
    if (h < 18) return "下午";
    if (h < 22) return "晚上";
    return "夜深";
  }

  function render() {
    var root = $("#page-home");
    if (!root) return;
    var news = getNewsStats();
    var ddj = getDdjStats();
    var nce = getNceStats();
    var memo = getMemoStats();
    var flute = getFluteStats();
    var today = todayStr();
    var t = timeOfDay();

    // 注水静态结构（保持 HTML 兜底在 JS 失败时仍可见）
    var timeEl = $("#homeTimeOfDay");
    if (timeEl) timeEl.textContent = t;
    var dateEl = $("#homeDateLabel");
    if (dateEl) dateEl.textContent = dateLabel(today) + " · " +
      ["周日","周一","周二","周三","周四","周五","周六"][new Date().getDay()];
    var unreadEl = $("#homeUnread");
    var unreadText = $("#homeUnreadText");
    if (unreadEl && unreadText) {
      unreadEl.classList.toggle("on", news.unread > 0);
      unreadText.innerHTML = news.unread > 0
        ? '<b>' + news.unread + '</b> 条新闻未读 · 已为你自动准备好'
        : '今日新闻已全部读完 · 干得漂亮';
    }
    var ddjS = $("#homeCardDdj"); if (ddjS) ddjS.textContent = "已背 " + ddj.done + " / 506";
    var nceS = $("#homeCardNce"); if (nceS) nceS.textContent = "上次学到 L" + nce.last + " · 今日 " + nce.todayRead + " 课";
    var newsS = $("#homeCardNews"); if (newsS) newsS.textContent = "未读 " + news.unread + " / " + news.total;
  }

  function bind() {
    // 委托到 document，统一处理 #page-home 和 #page-tools 里的 [data-go]
    document.addEventListener("click", function (e) {
      var a = e.target.closest("[data-go]");
      if (!a) return;
      // 只处理 #page-home / #page-tools 里的卡片，避免误捕
      if (!a.closest("#page-home, #page-tools")) return;
      e.preventDefault();
      if (typeof window.go === "function") {
        window.go(a.dataset.go);
      } else {
        var sel = "#tabbar .tab[data-page='" + a.dataset.go + "']";
        var b = document.querySelector(sel);
        if (b) b.click();
      }
    });
  }

  window.MOD = window.MOD || {};
  window.MOD.home = {
    init: function () { bind(); render(); },
    render: render
  };
})();