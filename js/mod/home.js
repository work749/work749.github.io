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

    root.innerHTML =
      // 顶部问候 + 未读
      '<div class="home-hero">' +
        '<div class="home-hi"><span class="home-time">' + esc(t) + '</span>，小满</div>' +
        '<div class="home-date">' + esc(dateLabel(today)) + ' · ' +
        esc(["周日","周一","周二","周三","周四","周五","周六"][new Date().getDay()]) +
        '</div>' +
        '<div class="home-unread' + (news.unread ? " on" : "") + '">' +
          '<span class="dot"></span>' +
          (news.unread > 0
            ? '<b>' + news.unread + '</b> 条新闻未读 · 已为你自动准备好'
            : '今日新闻已全部读完 · 干得漂亮') +
        '</div>' +
      '</div>' +

      // 三大主入口（大卡片）
      '<div class="home-grid">' +
        // 道德经
        '<a class="home-card home-ddj" data-go="ddj">' +
          '<div class="home-card-icon">📖</div>' +
          '<div class="home-card-name">帛书老子</div>' +
          '<div class="home-card-desc">德经 44 章 + 道经 37 章 · 逐字带拼音 · 已背 <b>' + ddj.done + '</b>/506 句</div>' +
          (ddj.streak > 0
            ? '<div class="home-card-streak">🔥 连续 ' + ddj.streak + ' 天</div>'
            : '<div class="home-card-streak off">今天还没开始</div>') +
        '</a>' +
        // 英语
        '<a class="home-card home-nce" data-go="nce">' +
          '<div class="home-card-icon">🇬🇧</div>' +
          '<div class="home-card-name">新概念英语</div>' +
          '<div class="home-card-desc">第一册 · 点句子/单词即读 · 上次学到 <b>L' + nce.last + '</b></div>' +
          (nce.todayRead > 0
            ? '<div class="home-card-streak">✅ 今日已读 ' + nce.todayRead + ' 课</div>'
            : '<div class="home-card-streak off">今天还没学</div>') +
        '</a>' +
        // 新闻
        '<a class="home-card home-news" data-go="news">' +
          '<div class="home-card-icon">📰</div>' +
          '<div class="home-card-name">每日要闻</div>' +
          '<div class="home-card-desc">助贷 7 + 地产 3，每天 07:00 / 20:00 自动更新</div>' +
          (news.unread > 0
            ? '<div class="home-card-streak">🔴 ' + news.unread + ' 条未读</div>'
            : '<div class="home-card-streak off">✅ 全部已读</div>') +
        '</a>' +
      '</div>' +

      // 次要入口（横排）
      '<div class="home-section-title">次要模块</div>' +
      '<div class="home-mini">' +
        '<a class="home-mini-item" data-go="flute">' +
          '<div class="ico">🎵</div>' +
          '<div class="n">笛子教程</div>' +
          '<div class="d">已完成 ' + flute.done + ' 课</div>' +
        '</a>' +
        '<a class="home-mini-item" data-go="memo">' +
          '<div class="ico">📝</div>' +
          '<div class="n">备忘录</div>' +
          '<div class="d">' + memo.open + ' 待办 · ' + memo.today + ' 今日</div>' +
        '</a>' +
        '<a class="home-mini-item" data-go="settings">' +
          '<div class="ico">⚙️</div>' +
          '<div class="n">设置</div>' +
          '<div class="d">同步 / 备份 / 朗读音色</div>' +
        '</a>' +
      '</div>' +

      // 底部每日推送时段提示
      '<div class="home-foot">' +
        '📡 新闻自动推送时段：<b>每日 07:00</b> 与 <b>20:00</b> · 数据来源 GitHub Actions 抓取 + 智谱 GLM-4-Flash' +
      '</div>';
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