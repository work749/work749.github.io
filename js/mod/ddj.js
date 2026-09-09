/* 道德经（帛书）模块：每日六句 + 全文通读 */
(function () {
  var SENT = [];
  (window.DAO_DE_JING || []).forEach(function (part, pi) {
    part.chapters.forEach(function (ch, ci) {
      ch.sent.forEach(function (s, si) {
        SENT.push({ pi: pi, ci: ci, si: si, t: s.t, p: s.p, label: part.part + " " + ch.no + " · " + ch.title });
      });
    });
  });
  var TOTAL = SENT.length;

  function isHan(c) { return /[\u4e00-\u9fff]/.test(c); }

  function rubyHtml(s, showPy) {
    var out = "";
    for (var i = 0; i < s.t.length; i++) {
      var ch = s.t[i], py = s.p[i] || "";
      if (showPy && isHan(ch) && py) {
        out += "<ruby>" + esc(ch) + "<rt>" + esc(py) + "</rt></ruby>";
      } else {
        out += esc(ch);
      }
    }
    return out;
  }

  function isDone(i) { return Store.data.ddj.done.indexOf(i) >= 0; }

  function nextUndone() {
    var skip = Store.data.ddj.skip || [];
    for (var i = 0; i < TOTAL; i++) {
      if (!isDone(i) && skip.indexOf(i) < 0) return i;
    }
    return 0;
  }

  function ensureToday() {
    var d = Store.data.ddj, per = Store.data.ui.perDay || 6;
    if (d.today && d.today.date === todayStr()) return d.today;
    // 归档昨天的任务，用于「温故」
    if (d.today && d.today.idxs && d.today.idxs.length) {
      d.history = d.history || {};
      d.history[d.today.date] = d.today.idxs;
    }
    var idxs = [], i = nextUndone();
    while (idxs.length < per && i < TOTAL) {
      if (!isDone(i) && (d.skip || []).indexOf(i) < 0) idxs.push(i);
      i++;
    }
    if (!idxs.length) { i = 0; while (idxs.length < per && i < TOTAL) { if (!isDone(i)) idxs.push(i); i++; } }
    d.today = { date: todayStr(), idxs: idxs };
    Store.save();
    return d.today;
  }

  function toggleDone(i) {
    var d = Store.data.ddj, k = d.done.indexOf(i);
    if (k >= 0) d.done.splice(k, 1); else d.done.push(i);
    Store.save();
    render();
  }

  /* ---------- 渲染 ---------- */
  function renderStats() {
    var d = Store.data.ddj;
    var per = Store.data.ui.perDay || 6;
    var today = ensureToday();
    var doneToday = today.idxs.filter(isDone).length;

    var streak = d.streak || 0;
    if (d.lastDay !== todayStr() && d.lastDay !== dayOffset(-1)) streak = 0;

    $("#ddjStreak").innerHTML = streak + ' <small>天</small>';
    $("#ddjDone").innerHTML = d.done.length + " <small>/ " + TOTAL + "</small>";
    $("#ddjToday").innerHTML = doneToday + " <small>/ " + per + "</small>";
    var pct = Math.round(d.done.length / TOTAL * 100);
    $("#ddjPct").innerHTML = pct + "<small>%</small>";
    $("#ddjBar").style.width = pct + "%";
    $("#ddjTodayLabel").textContent = dateLabel(todayStr()) + " · 第 " +
      (today.idxs.length ? (today.idxs[0] + 1) : 0) + "-" +
      (today.idxs.length ? (today.idxs[today.idxs.length - 1] + 1) : 0) + " 句";

    var badge = $("#badgeDdj");
    if (badge) {
      var left = per - doneToday;
      badge.textContent = left > 0 ? left : "✓";
      badge.style.display = "inline-block";
    }
  }

  function renderToday() {
    var today = ensureToday();
    var box = $("#ddjTodayList");
    var noPy = !!Store.data.ddj.hidePy;
    if (!today.idxs.length) { box.innerHTML = '<div class="empty">全部背完啦，可以开始第二轮复习。</div>'; return; }

    box.innerHTML = today.idxs.map(function (i) {
      var s = SENT[i];
      return '<div class="ddj-sent' + (isDone(i) ? " ok" : "") + '" data-idx="' + i + '">' +
        '<div class="meta"><span>' + esc(s.label) + '</span><span>·</span><span>第 ' + (i + 1) + ' 句</span></div>' +
        '<div class="text' + (noPy ? " no-py" : "") + '" style="font-size:' + (Store.data.ui.ddjSize || 21) + 'px">' +
        rubyHtml(s, !noPy) + '</div>' +
        '<div class="acts">' +
        '<button class="btn sm" data-act="speak">朗读</button>' +
        '<button class="btn sm' + (isDone(i) ? " done" : "") + '" data-act="ok">' + (isDone(i) ? "已背 ✓" : "标记已背") + '</button>' +
        '</div></div>';
    }).join("");

    box.onclick = function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var wrap = e.target.closest(".ddj-sent");
      var i = parseInt(wrap.dataset.idx, 10);
      if (btn.dataset.act === "speak") speak(SENT[i].t, "zh-CN");
      else toggleDone(i);
    };
  }

  var curPart = 0;
  function renderChapters() {
    var part = window.DAO_DE_JING[curPart];
    $("#ddjChapters").innerHTML = part.chapters.map(function (c, ci) {
      var has = c.sent.some(function (s, si) {
        return isDone(SENT.findIndex(function (x) { return x.pi === curPart && x.ci === ci && x.si === si; }));
      });
      return '<button class="chapter-btn' + (has ? " has" : "") + '" data-ci="' + ci + '">' +
        (curPart === 0 ? "德" : "道") + " " + c.no + "<b>" + esc(c.title) + "</b></button>";
    }).join("");
    $("#ddjChapterView").innerHTML = "";
    $("#ddjPartHint").textContent = "共 " + part.chapters.length + " 章";
  }

  function openChapter(ci) {
    var part = window.DAO_DE_JING[curPart], c = part.chapters[ci];
    var noPy = !!Store.data.ddj.hidePy;
    var html = c.sent.map(function (s, si) {
      var gi = SENT.findIndex(function (x) { return x.pi === curPart && x.ci === ci && x.si === si; });
      return '<div class="ddj-sent' + (isDone(gi) ? " ok" : "") + '" data-idx="' + gi + '">' +
        '<div class="meta"><span>第 ' + (si + 1) + ' 句</span></div>' +
        '<div class="text' + (noPy ? " no-py" : "") + '" style="font-size:' + (Store.data.ui.ddjSize || 21) + 'px">' +
        rubyHtml(s, !noPy) + '</div>' +
        '<div class="acts"><button class="btn sm" data-act="speak">朗读</button>' +
        '<button class="btn sm' + (isDone(gi) ? " done" : "") + '" data-act="ok">' + (isDone(gi) ? "已背 ✓" : "标记已背") + '</button></div></div>';
    }).join("");
    $("#ddjChapterView").innerHTML =
      '<div class="card-title"><span class="dot"></span>' + esc(part.part) + " 第 " + c.no + " 章 · " + esc(c.title) +
      '<span class="right"><button class="btn sm" id="chSpeakAll">整章朗读</button></span></div>' + html;
    $("#ddjChapterView").onclick = function (e) {
      var btn = e.target.closest("[data-act]");
      if (btn) {
        var i = parseInt(e.target.closest(".ddj-sent").dataset.idx, 10);
        if (btn.dataset.act === "speak") speak(SENT[i].t, "zh-CN"); else toggleDone(i);
        return;
      }
      if (e.target.id === "chSpeakAll") speakSeq(c.sent.map(function (s) { return s.t; }));
    };
  }

  function speakSeq(list) {
    var k = 0;
    (function next() {
      if (k >= list.length) return;
      speak(list[k++], "zh-CN", { onend: next });
    })();
  }

  /* 温故：昨天背过的句子 */
  function renderReview() {
    var card = $("#ddjReviewCard");
    var d = Store.data.ddj;
    var y = dayOffset(-1);
    var idxs = (d.history || {})[y] || [];
    if (!idxs.length) { card.style.display = "none"; return; }
    card.style.display = "";
    card.querySelector(".right").textContent = dateLabel(y) + " 背过的内容，先过一遍";
    var noPy = !!Store.data.ddj.hidePy;
    $("#ddjReview").innerHTML = idxs.map(function (i) {
      var s = SENT[i]; if (!s) return "";
      return '<div class="ddj-sent" data-idx="' + i + '">' +
        '<div class="meta"><span>' + esc(s.label) + '</span><span>·</span><span>第 ' + (i + 1) + ' 句</span></div>' +
        '<div class="text' + (noPy ? " no-py" : "") + '" style="font-size:' + ((Store.data.ui.ddjSize || 21) - 2) + 'px">' +
        rubyHtml(s, !noPy) + '</div>' +
        '<div class="acts"><button class="btn sm" data-act="speak">朗读</button></div></div>';
    }).join("");
    $("#ddjReview").onclick = function (e) {
      if (!e.target.closest("[data-act='speak']")) return;
      var i = parseInt(e.target.closest(".ddj-sent").dataset.idx, 10);
      speak(SENT[i].t, "zh-CN");
    };
  }

  function render() { renderStats(); renderToday(); renderReview(); }

  function finishDay() {
    var d = Store.data.ddj, today = ensureToday();
    var left = today.idxs.filter(function (i) { return !isDone(i); });
    if (left.length) { toast("还有 " + left.length + " 句没背哦"); return; }
    if (d.lastDay === todayStr()) { toast("今天已经打过卡了"); return; }
    d.streak = (d.lastDay === dayOffset(-1)) ? (d.streak || 0) + 1 : 1;
    d.lastDay = todayStr();
    (d.finishedDays = d.finishedDays || []).push(todayStr());
    Store.save(); render();
    toast("打卡成功，连续 " + d.streak + " 天");
  }

  function bind() {
    $$("#page-ddj [data-part]").forEach(function (b) {
      b.onclick = function () { curPart = parseInt(b.dataset.part, 10); renderChapters(); };
    });
    $("#ddjChapters").onclick = function (e) {
      var b = e.target.closest(".chapter-btn");
      if (b) openChapter(parseInt(b.dataset.ci, 10));
    };
    $("#ddjFinishBtn").onclick = finishDay;
    $("#ddjSpeakAll").onclick = function () {
      speakSeq(ensureToday().idxs.map(function (i) { return SENT[i].t; }));
    };
    $("#ddjTogglePy").onclick = function () {
      Store.data.ddj.hidePy = !Store.data.ddj.hidePy; Store.save();
      this.textContent = Store.data.ddj.hidePy ? "显示拼音" : "隐藏拼音（自测）";
      render(); if ($("#ddjChapterView").innerHTML) renderChapters();
    };
    $("#ddjResetToday").onclick = function () {
      var d = Store.data.ddj;
      d.skip = (d.skip || []).concat(d.today ? d.today.idxs : []);
      d.today = null; Store.save(); render(); toast("已换一组");
    };
  }

  window.MOD = window.MOD || {};
  window.MOD.ddj = {
    init: function () {
      bind();
      $("#ddjTogglePy").textContent = Store.data.ddj.hidePy ? "显示拼音" : "隐藏拼音（自测）";
      renderChapters(); render();
    },
    render: render
  };
})();
