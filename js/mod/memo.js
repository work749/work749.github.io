/* 备忘录模块（iPhone 备忘录风格）
   左：便签列表（标题=首行 · 日期 · 预览）  右：编辑区（边写边存）
   数据：Store.data.memo.items = [{id,text,date,time,done,doneAt,fired,createdAt,updatedAt,pinned}]
   笛子页 #memoCard 是同一份数据的快捷入口 */
(function () {
  var timer = null, saveTimer = null;
  var curId = "";

  function data() {
    var d = Store.data;
    if (!d.memo || !Array.isArray(d.memo.items)) {
      d.memo = { items: [], filter: (d.memo && d.memo.filter) || "all", q: (d.memo && d.memo.q) || "" };
    }
    return d.memo;
  }
  function items() { return data().items; }
  function find(id) { return items().filter(function (x) { return x.id === id; })[0]; }
  function newId() { return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* 老数据迁移：flute.notes → memo.items */
  function migrate() {
    try {
      var f = Store.data.flute || {};
      var old = f.notes;
      if (Array.isArray(old) && old.length && !items().length) {
        items().push.apply(items(), old);
        f.notes = [];
        Store.save();
      }
    } catch (e) { }
    items().forEach(function (n) {
      if (!n.createdAt) n.createdAt = n.date || todayStr();
      if (!n.updatedAt) n.updatedAt = Date.parse((n.date || todayStr()) + "T12:00:00") || Date.now();
      if (n.pinned === undefined) n.pinned = false;
    });
  }

  /* ---------- 展示辅助 ---------- */
  function titleOf(n) {
    var first = String(n.text || "").split("\n").filter(function (l) { return l.trim(); })[0] || "";
    return first.trim().slice(0, 40) || "新备忘";
  }
  function previewOf(n) {
    var rest = String(n.text || "").split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim();
    if (!rest) {
      var one = String(n.text || "").replace(/\s+/g, " ").trim();
      return one.length > 40 ? one.slice(40) : "";
    }
    return rest.slice(0, 80);
  }
  function stampOf(ms) {
    var d = new Date(ms || Date.now());
    var t = todayStr();
    var ds = todayStr(d);
    var hh = d.getHours(), mm = d.getMinutes();
    var hm = (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
    if (ds === t) return hm;
    if (ds === dayOffset(-1)) return "昨天";
    if (d.getFullYear() === new Date().getFullYear()) return dateLabel(ds);
    return ds;
  }
  function labelOf(date) {
    var t = todayStr();
    if (date === t) return { cls: "today", txt: "今天" };
    if (date === dayOffset(1)) return { cls: "tomorrow", txt: "明天" };
    if (date < t) {
      var days = Math.round((new Date(t) - new Date(date)) / 86400000);
      return { cls: "od", txt: (date === dayOffset(-1) ? "昨天" : dateLabel(date)) + " · 逾期" + days + "天" };
    }
    return { cls: "future", txt: dateLabel(date) };
  }

  /* ---------- 列表 ---------- */
  function sorted(list) {
    return list.slice().sort(function (a, b) {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function noteHtml(n) {
    var cls = ["memo-note"];
    if (n.id === curId) cls.push("on");
    if (n.done) cls.push("done");
    return '<div class="' + cls.join(" ") + '" data-id="' + n.id + '">' +
      (n.pinned ? '<span class="memo-pin">置顶</span>' : "") +
      '<div class="memo-note-top"><span class="memo-note-t">' + esc(titleOf(n)) + "</span>" +
      '<span class="memo-note-d">' + esc(stampOf(n.updatedAt)) + "</span></div>" +
      '<div class="memo-note-p">' + esc(previewOf(n) || "无附加内容") + "</div>" +
      '<div class="memo-note-m">' +
      (n.done ? '<span class="memo-date ok">✓ 已完成</span>' : "") +
      (n.time && !n.done ? '<span class="memo-bell">🔔 ' + esc(n.time) + "</span>" : "") +
      (!n.done && n.date && n.date < todayStr() ? '<span class="memo-date od">逾期</span>' : "") +
      "</div></div>";
  }

  function renderNotes() {
    var m = data(), list = items(), f = m.filter || "all", q = (m.q || "").trim().toLowerCase();
    var shown = list.filter(function (n) {
      if (f === "open" && n.done) return false;
      if (f === "done" && !n.done) return false;
      if (!q) return true;
      return String(n.text || "").toLowerCase().indexOf(q) >= 0;
    });
    var el = $("#memoNotes");
    if (!el) return;
    el.innerHTML = shown.length ? sorted(shown).map(noteHtml).join("")
      : '<div class="empty">' + (q ? "没搜到" : "还没有备忘，点「＋ 新建」写第一条") + "</div>";
  }

  function renderStats() {
    var list = items(), t = todayStr();
    var undone = list.filter(function (n) { return !n.done; }).length;
    var doneCnt = list.length - undone;
    var todayCnt = list.filter(function (n) { return (n.date || "") === t; }).length +
      list.filter(function (n) { return !n.date && todayStr(new Date(n.updatedAt || Date.now())) === t; }).length;
    set("memoStatAll", list.length + " <small>条</small>");
    set("memoStatOpen", undone + " <small>条</small>");
    set("memoStatDone", doneCnt + " <small>条</small>");
    set("memoStatToday", todayCnt + " <small>条</small>");
    function set(id, html) { var e = $("#" + id); if (e) e.innerHTML = html; }

    var badge = $("#badgeMemo");
    if (badge) {
      var pending = list.filter(function (n) { return !n.done && n.time; }).length;
      badge.textContent = pending ? String(pending) : "";
      badge.style.display = pending ? "" : "none";
    }
    var mc = $("#memoCount");
    if (mc) mc.textContent = "待办 " + undone + " / 共 " + list.length;
  }

  /* ---------- 编辑区 ---------- */
  function openNote(id, focus) {
    var n = find(id);
    var app = $("#memoApp");
    if (!n) {
      curId = "";
      var ed = $("#memoEditor"), em = $("#memoEmpty");
      if (ed) ed.style.display = "none";
      if (em) em.style.display = "";
      if (app) app.classList.remove("editing");
      renderNotes();
      return;
    }
    curId = id;
    $("#memoEdText").value = n.text || "";
    $("#memoEdTime").value = n.time || "";
    $("#memoEdDay").value = n.date || todayStr();
    $("#memoEdDate").textContent = stampOf(n.updatedAt) + (n.createdAt ? " · 建于 " + dateLabel(n.createdAt) : "");
    $("#memoDone").textContent = n.done ? "取消完成" : "标记完成";
    $("#memoDone").classList.toggle("done", !!n.done);
    $("#memoPin").textContent = n.pinned ? "取消置顶" : "置顶";
    $("#memoSaved").textContent = "";
    var ed2 = $("#memoEditor"), em2 = $("#memoEmpty");
    if (ed2) ed2.style.display = "";
    if (em2) em2.style.display = "none";
    if (app) app.classList.add("editing");
    renderNotes();
    if (focus) { try { $("#memoEdText").focus(); } catch (e) { } }
  }

  function saveNow(showTip) {
    var n = find(curId);
    if (!n) return;
    var v = $("#memoEdText").value;
    if (v !== n.text) { n.text = v; n.updatedAt = Date.now(); }
    n.time = $("#memoEdTime").value || "";
    n.date = $("#memoEdDay").value || n.date || todayStr();
    Store.save();
    if (showTip) {
      var s = $("#memoSaved");
      if (s) { s.textContent = "已保存"; clearTimeout(saveTimer); saveTimer = setTimeout(function () { s.textContent = ""; }, 1500); }
    }
    var d = $("#memoEdDate");
    if (d) d.textContent = stampOf(n.updatedAt) + (n.createdAt ? " · 建于 " + dateLabel(n.createdAt) : "");
    renderNotes(); renderStats(); renderQuick();
  }

  function newNote() {
    saveNow(false);
    var n = {
      id: newId(), text: "", date: todayStr(), time: "",
      done: false, doneAt: "", fired: false, createdAt: todayStr(),
      updatedAt: Date.now(), pinned: false
    };
    items().push(n);
    Store.save();
    openNote(n.id, true);
    renderStats();
    toast("新建了一条备忘");
  }

  function toggleDone() {
    var n = find(curId); if (!n) return;
    n.done = !n.done;
    n.doneAt = n.done ? todayStr() : "";
    if (!n.done) n.fired = false;
    n.updatedAt = Date.now();
    Store.save();
    $("#memoDone").textContent = n.done ? "取消完成" : "标记完成";
    $("#memoDone").classList.toggle("done", !!n.done);
    renderNotes(); renderStats(); renderQuick();
    toast(n.done ? "已标记完成 ✓" : "已恢复为待办");
  }

  function togglePin() {
    var n = find(curId); if (!n) return;
    n.pinned = !n.pinned;
    Store.save();
    $("#memoPin").textContent = n.pinned ? "取消置顶" : "置顶";
    renderNotes();
    toast(n.pinned ? "已置顶" : "已取消置顶");
  }

  function delNote() {
    var n = find(curId); if (!n) return;
    if (!confirm("删除这条备忘？")) return;
    data().items = items().filter(function (x) { return x.id !== n.id; });
    Store.save();
    openNote("");
    renderStats(); renderQuick();
    toast("已删除");
  }

  /* ---------- 笛子页快捷区 ---------- */
  function itemHtml(n) {
    var lb = labelOf(n.date);
    var cls = ["memo-item"];
    if (n.done) cls.push("done");
    if (!n.done && lb.cls === "od") cls.push("overdue");
    return '<div class="' + cls.join(" ") + '" data-id="' + n.id + '">' +
      '<button class="memo-check' + (n.done ? " on" : "") + '" data-act="mok" aria-label="完成"></button>' +
      '<div class="memo-body">' +
      '<div class="memo-text">' + esc(titleOf(n)) + "</div>" +
      '<div class="memo-meta">' +
      '<span class="memo-date ' + lb.cls + '">' + esc(lb.txt) + "</span>" +
      (n.time && !n.done ? '<span class="memo-bell">🔔 ' + esc(n.time) + "</span>" : "") +
      "</div></div>" +
      '<button class="memo-del" data-act="mdel" title="删除">×</button>' +
      "</div>";
  }

  function renderQuick() {
    var q = $("#memoQuickList");
    if (!q) return;
    var top = items().filter(function (n) { return !n.done; })
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).slice(0, 3);
    q.innerHTML = top.length ? top.map(itemHtml).join("")
      : '<div class="page-desc" style="padding:6px 2px">暂无待办</div>';
  }

  /* ---------- 闹铃 ---------- */
  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      [0, 0.35, 0.7].forEach(function (t0) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t0);
        g.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t0 + 0.28);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + t0); o.stop(ctx.currentTime + t0 + 0.3);
      });
      setTimeout(function () { try { ctx.close(); } catch (e) { } }, 1600);
    } catch (e) { }
  }
  function notify(title, body) {
    // APK（WebView）里没有 Web Notification，改走原生通道
    try {
      if (window.AndroidApp && typeof AndroidApp.notify === "function") {
        AndroidApp.notify(title, body);
        return;
      }
    } catch (e) { }
    try {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      var n = new Notification(title, { body: body, tag: "zxm-memo" });
      setTimeout(function () { try { n.close(); } catch (e) { } }, 20000);
    } catch (e) { }
  }
  function fire(n) {
    n.fired = true; Store.save();
    beep();
    notify("备忘录提醒", titleOf(n) + (n.time ? "（" + n.time + "）" : ""));
    toast("🔔 提醒：" + titleOf(n));
    $$('.memo-item[data-id="' + n.id + '"], .memo-note[data-id="' + n.id + '"]').forEach(function (el) {
      el.classList.add("ringing");
      setTimeout(function () { el.classList.remove("ringing"); }, 6000);
    });
  }
  function checkAlarms() {
    var now = new Date();
    var hh = now.getHours(), mm = now.getMinutes();
    var hhmm = (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
    var t = todayStr(), changed = false;
    items().forEach(function (n) {
      if (n.done || !n.time || n.fired) return;
      if ((n.date || t) <= t && hhmm >= n.time) { n.fired = true; changed = true; fire(n); }
    });
    if (changed) Store.save();
  }

  /* ---------- 绑定 ---------- */
  function syncPerm() {
    var p = $("#memoPerm");
    if (!p) return;
    if (window.AndroidApp && typeof AndroidApp.notify === "function") {
      p.textContent = "已接入系统通知，到点直接弹到手机通知栏";
      return;
    }
    if (typeof Notification === "undefined") { p.textContent = "此浏览器不支持通知，闹铃只在页面内响"; return; }
    p.textContent = Notification.permission === "granted" ? "通知已开启 ✓"
      : (Notification.permission === "denied" ? "通知被浏览器拦截" : "建议开启通知，离开页面也能收到");
  }

  function bind() {
    migrate();

    $("#memoNew").onclick = newNote;

    // 搜索
    $("#memoSearch").oninput = function () { data().q = this.value; renderNotes(); };
    $("#memoSearch").value = data().q || "";

    // 筛选
    $("#memoFilter").onclick = function (e) {
      var b = e.target.closest("[data-f]");
      if (!b) return;
      data().filter = b.dataset.f; Store.save(); renderNotes();
    };
    $$("#memoFilter [data-f]").forEach(function (b) {
      b.classList.toggle("primary", b.dataset.f === (data().filter || "all"));
    });

    $("#memoClearDone").onclick = function () {
      var done = items().filter(function (n) { return n.done; }).length;
      if (!done) { toast("没有已完成的记录"); return; }
      if (!confirm("清除 " + done + " 条已完成备忘？")) return;
      data().items = items().filter(function (n) { return !n.done; });
      Store.save(); openNote(""); renderStats(); renderQuick(); toast("已清除");
    };

    // 列表点击
    $("#memoNotes").onclick = function (e) {
      var it = e.target.closest(".memo-note");
      if (!it) return;
      saveNow(false);
      openNote(it.dataset.id);
    };

    // 编辑区
    var ta = $("#memoEdText");
    ta.oninput = function () {
      clearTimeout(saveTimer);
      $("#memoSaved").textContent = "编辑中…";
      saveTimer = setTimeout(function () { saveNow(true); }, 600);
    };
    ta.onblur = function () { if (curId) saveNow(false); };
    $("#memoEdTime").onchange = function () { saveNow(true); };
    $("#memoEdDay").onchange = function () { saveNow(true); };
    $("#memoDone").onclick = toggleDone;
    $("#memoPin").onclick = togglePin;
    $("#memoDel").onclick = delNote;
    $("#memoBack").onclick = function () {
      saveNow(false);
      var app = $("#memoApp");
      if (app) app.classList.remove("editing");
      renderNotes();
    };

    // 通知
    $("#memoBell").onclick = function () {
      if (typeof Notification === "undefined") { toast("此浏览器不支持桌面通知"); return; }
      if (Notification.permission === "granted") { toast("通知已开启"); return; }
      try {
        var r = Notification.requestPermission(function (p) { syncPerm(); if (p === "granted") toast("闹铃通知已开启"); });
        if (r && r.then) r.then(function (p) { syncPerm(); if (p === "granted") toast("闹铃通知已开启"); });
      } catch (e) { toast("无法开启通知"); }
    };
    $("#memoTest").onclick = function () { beep(); toast("铃声测试：三声"); };
    syncPerm();

    // 笛子页快捷入口
    var qa = $("#memoQuickAdd");
    if (qa) {
      qa.onclick = function () {
        var t = $("#memoQuickText");
        var v = (t.value || "").trim();
        if (!v) { toast("先写点内容"); t.focus(); return; }
        items().push({
          id: newId(), text: v, date: todayStr(), time: $("#memoQuickTime").value || "",
          done: false, doneAt: "", fired: false, createdAt: todayStr(),
          updatedAt: Date.now(), pinned: false
        });
        Store.save();
        t.value = ""; $("#memoQuickTime").value = "";
        renderStats(); renderQuick();
        toast("已加入备忘");
      };
      $("#memoQuickText").onkeydown = function (e) { if (e.key === "Enter") qa.click(); };
    }
    function quickClick(e) {
      var it = e.target.closest(".memo-item");
      if (!it) return;
      var id = it.dataset.id;
      var hit = e.target.closest("[data-act]");
      var act = hit && hit.dataset.act;
      var n = find(id);
      if (!n) return;
      if (act === "mok") {
        n.done = !n.done; n.doneAt = n.done ? todayStr() : "";
        if (!n.done) n.fired = false;
        n.updatedAt = Date.now();
        Store.save(); renderStats(); renderQuick(); renderNotes();
        if (n.done) toast("完成一项 ✓");
      } else if (act === "mdel") {
        if (confirm("删除这条备忘？")) {
          data().items = items().filter(function (x) { return x.id !== id; });
          Store.save(); renderStats(); renderQuick(); renderNotes(); toast("已删除");
        }
      } else {
        // 点正文 → 跳到备忘录页并打开
        $$("#nav .nav-item").forEach(function (b) { if (b.dataset.page === "memo") b.click(); });
        openNote(id, false);
      }
    }
    var ql = $("#memoQuickList"); if (ql) ql.onclick = quickClick;

    var go = $("#memoGo");
    if (go) go.onclick = function (e) {
      e.preventDefault();
      $$("#nav .nav-item").forEach(function (b) { if (b.dataset.page === "memo") b.click(); });
    };

    if (!timer) {
      timer = setInterval(checkAlarms, 20000);
      setTimeout(checkAlarms, 3000);
    }
  }

  function render() {
    renderStats(); renderNotes(); renderQuick();
    if (curId && !find(curId)) openNote("");
  }

  window.MOD = window.MOD || {};
  window.MOD.memo = {
    init: function () { bind(); render(); },
    render: render,
    add: function (text, date, time) {
      items().push({
        id: newId(), text: text, date: date || todayStr(), time: time || "",
        done: false, doneAt: "", fired: false, createdAt: todayStr(),
        updatedAt: Date.now(), pinned: false
      });
      Store.save(); render();
      return true;
    },
    checkAlarms: checkAlarms,
    save: function () { saveNow(true); }
  };
})();
