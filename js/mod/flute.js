/* 自学笛子模块：分阶段课程 + B站视频 + 指法表 */
(function () {
  var COURSE = window.FLUTE_COURSE || [];
  var ALL = [];
  COURSE.forEach(function (st) { st.lessons.forEach(function (l) { l._stage = st.stage; ALL.push(l); }); });

  function bvOf(l) {
    return (Store.data.flute.custom || {})[l.id] || l.bvid;
  }
  function isDone(id) { return Store.data.flute.done.indexOf(id) >= 0; }
  function toggleDone(id) {
    var d = Store.data.flute, i = d.done.indexOf(id);
    if (i >= 0) d.done.splice(i, 1); else d.done.push(id);
    Store.save(); render();
  }

  function bilibiliEmbed(bv, p) {
    return "https://player.bilibili.com/player.html?bvid=" + bv +
      "&page=" + (p || 1) + "&high_quality=1&danmaku=0&autoplay=0";
  }
  function bilibiliPage(bv, p) {
    return "https://www.bilibili.com/video/" + bv + (p && p > 1 ? "?p=" + p : "");
  }
  function searchUrl(kw) {
    return "https://search.bilibili.com/all?keyword=" + encodeURIComponent(kw);
  }

  function render() {
    var d = Store.data.flute;
    $("#fluteDone").innerHTML = d.done.length + " <small>/ " + ALL.length + "</small>";
    var streak = d.streak || 0;
    if (d.lastDay !== todayStr() && d.lastDay !== dayOffset(-1)) streak = 0;
    $("#fluteStreak").innerHTML = streak + " <small>天</small>";
    $("#fluteToday").textContent = d.lastDay === todayStr() ? "已练 ✓" : "未开始";

    d.seconds = d.seconds || {};
    var sec = d.seconds[todayStr()] || 0;
    var el = $("#fluteMins"); if (el) el.textContent = Math.floor(sec / 60);
    var total = Object.keys(d.seconds).reduce(function (a, k) { return a + d.seconds[k]; }, 0);
    var tt = $("#fluteTotal"); if (tt) tt.textContent = "累计 " + Math.floor(total / 60) + " 分钟";

    $("#fluteCourse").innerHTML = COURSE.map(function (st) {
      return '<div class="stage-block"><div class="stage-head"><span class="n">' + esc(st.stage) +
        '</span><span class="d">' + esc(st.stageDesc) + "</span></div>" +
        st.lessons.map(function (l) { return lessonHtml(l); }).join("") + "</div>";
    }).join("");

    var desc = $("#fluteDesc");
    if (desc) desc.textContent = ALL.length + " 节课 · " + COURSE.length + " 个阶段 · 从吹响第一个音到《姑苏行》，每课配视频";

    if (window.MOD && MOD.memo && MOD.memo.render) MOD.memo.render();
  }

  function fmtDur(s) {
    if (!s) return "";
    var m = Math.floor(s / 60), ss = s % 60;
    return m + ":" + (ss < 10 ? "0" + ss : ss);
  }

  function requestFs(el) {
    var fn = el.requestFullscreen || el.webkitRequestFullscreen ||
      el.mozRequestFullScreen || el.msRequestFullscreen;
    if (!fn) { toast("当前环境不支持全屏，请点「在 B 站打开」"); return; }
    try {
      var r = fn.call(el);
      if (r && r.catch) r.catch(function () { toast("全屏被拒绝，可点「在 B 站打开」"); });
    } catch (e) { toast("全屏失败，可点「在 B 站打开」"); }
  }

  function lessonHtml(l) {
    return '<div class="lesson' + (isDone(l.id) ? " done" : "") + '" data-id="' + l.id + '">' +
      '<div class="lesson-top"><span class="t">' + esc(l.title) + "</span>" +
      (l.dur ? '<span class="vdur">' + fmtDur(l.dur) + "</span>" : "") +
      '<span class="right">' +
      '<button class="btn sm" data-act="open">展开</button>' +
      '<button class="btn sm' + (isDone(l.id) ? " done" : "") + '" data-act="ok">' + (isDone(l.id) ? "已学 ✓" : "学完") + "</button>" +
      "</span></div>" +
      '<div class="lesson-body"><div class="g" style="color:var(--dim);font-size:13px;margin-bottom:10px">' + esc(l.goal) + "</div>" +
      '<div class="video-wrap" data-vid="' + l.id + '"></div>' +
      '<div class="row" style="margin-bottom:12px">' +
      '<a class="btn sm" href="' + esc(bilibiliPage(bvOf(l), l.p)) + '" target="_blank" rel="noopener">在 B 站打开</a>' +
      '<a class="btn sm" href="' + esc(searchUrl(l.kw)) + '" target="_blank" rel="noopener">搜更多同类教程</a>' +
      '<button class="btn sm" data-act="fs">全屏播放</button>' +
      '<button class="btn sm ghost" data-act="custom">自定义视频</button>' +
      '<span class="page-desc" style="margin-left:auto">' + (bvOf(l) === l.bvid ? "" : "已用自定义视频") + "</span>" +
      "</div>" +
      '<ul class="tips">' + (l.tips || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      "</div></div>";
  }

  function bind() {
    $("#fluteCourse").onclick = function (e) {
      var lessonEl = e.target.closest(".lesson");
      if (!lessonEl) return;
      var id = lessonEl.dataset.id;
      var l = ALL.filter(function (x) { return x.id === id; })[0];
      var btn = e.target.closest("[data-act]");

      if (btn && btn.dataset.act === "ok") { toggleDone(id); return; }
      if (btn && btn.dataset.act === "fs") {
        var wrapEl = $(".video-wrap", lessonEl);
        if (!wrapEl || !wrapEl.querySelector("iframe")) { toast("先点「展开」载入视频，再全屏"); return; }
        requestFs(wrapEl); return;
      }
      if (btn && btn.dataset.act === "custom") {
        var v = prompt("粘贴 B 站视频链接或 BV 号（留空恢复默认）：", bvOf(l) || "");
        if (v === null) return;
        var m = v.match(/BV[0-9A-Za-z]{8,12}/);
        Store.data.flute.custom = Store.data.flute.custom || {};
        if (m) { Store.data.flute.custom[id] = m[0]; toast("已更新视频"); }
        else if (v.trim() === "") { delete Store.data.flute.custom[id]; toast("已恢复默认视频"); }
        else { toast("没识别到 BV 号"); return; }
        Store.save(); render(); return;
      }

      // 展开 / 收起
      var open = lessonEl.classList.contains("open");
      if (!btn || btn.dataset.act === "open") {
        lessonEl.classList.toggle("open", !open);
        var wrap = $(".video-wrap", lessonEl);
        if (!open) {
          wrap.innerHTML = '<iframe src="' + esc(bilibiliEmbed(bvOf(l), l.p)) + '" scrolling="no" frameborder="no"' +
            ' allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true"' +
            ' allow="fullscreen; autoplay; encrypted-media; picture-in-picture"' +
            ' referrerpolicy="no-referrer"></iframe>';
          btn && (btn.textContent = "收起");
        } else {
          wrap.innerHTML = "";
          btn && (btn.textContent = "展开");
        }
      }
    };

    // ---- 练习计时 ----
    var timer = null, startAt = 0, base = 0;
    function fmt(s) {
      s = Math.floor(s);
      var m = Math.floor(s / 60);
      return (m < 10 ? "0" + m : m) + ":" + (s % 60 < 10 ? "0" + (s % 60) : s % 60);
    }
    function tick() {
      var el = $("#fluteClock");
      if (el) el.textContent = fmt(base + (Date.now() - startAt) / 1000);
    }
    $("#fluteStart").onclick = function () {
      if (timer) { toast("已经在计时了"); return; }
      startAt = Date.now(); base = 0;
      timer = setInterval(tick, 1000); tick();
      this.textContent = "练习中…";
      this.classList.remove("primary");
    };
    $("#fluteStopTimer").onclick = function () {
      if (!timer) { toast("还没开始计时"); return; }
      clearInterval(timer); timer = null;
      var sec = Math.round((Date.now() - startAt) / 1000 + base);
      var d = Store.data.flute;
      d.seconds = d.seconds || {};
      d.seconds[todayStr()] = (d.seconds[todayStr()] || 0) + sec;
      if (d.lastDay !== todayStr()) {
        d.streak = (d.lastDay === dayOffset(-1)) ? (d.streak || 0) + 1 : 1;
        d.lastDay = todayStr();
      }
      Store.save(); render();
      $("#fluteClock").textContent = "00:00";
      var b = $("#fluteStart"); b.textContent = "开始练习"; b.classList.add("primary");
      toast("本次练习 " + fmt(sec) + "，今天累计 " + Math.floor(d.seconds[todayStr()] / 60) + " 分钟");
    };

    // 指法表
    $("#fingerBody").innerHTML = (window.FLUTE_FINGERING || []).map(function (f) {
      return "<tr><td class=\"note\">" + esc(f.note) + "</td>" +
        f.holes.map(function (h) {
          return '<td class="' + (h === "●" ? "on" : "off") + '">' + h + "</td>";
        }).join("") + "</tr>";
    }).join("");

    // 今日练习打卡（点击统计区的今日练习）
    var todayStat = $("#fluteToday").parentElement;
    todayStat.style.cursor = "pointer";
    todayStat.onclick = function () {
      var d = Store.data.flute;
      if (d.lastDay === todayStr()) { toast("今天已经打过卡了"); return; }
      d.streak = (d.lastDay === dayOffset(-1)) ? (d.streak || 0) + 1 : 1;
      d.lastDay = todayStr();
      Store.save(); render();
      toast("练习打卡成功，连续 " + d.streak + " 天");
    };
  }

  window.MOD = window.MOD || {};
  window.MOD.flute = {
    init: function () { bind(); render(); },
    render: render
  };
})();
