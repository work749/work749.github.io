/* 跨设备同步
   云端：GitHub 仓库 work749/zxm-sync 里的 sync.json（你自己的仓库，免费永久）
   密钥：只存在本机 localStorage，不写进代码、不进仓库
   策略：已读 / 打卡等数组取并集，备忘录按 id 取最新，永不互相覆盖 */
(function () {
  var REPO = "work749/zxm-sync";
  var PATH = "sync.json";
  var API = "https://api.github.com/repos/" + REPO + "/contents/" + PATH;
  var TOKEN_KEY = "zxm.syncToken";
  var META_KEY = "zxm.syncMeta";

  var token = "";
  var sha = "";
  var applying = false;   // 正在应用远端数据：期间不再触发推送，避免回环
  var busy = false;
  var pushTimer = null;
  var pullTimer = null;
  var lastState = "off";
  var listeners = [];

  /* ---------- base64（UTF-8 安全） ---------- */
  function utf8ToB64(str) {
    try {
      if (typeof TextEncoder !== "undefined") {
        var bytes = new TextEncoder().encode(str), bin = "", CH = 0x8000;
        for (var i = 0; i < bytes.length; i += CH) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        }
        return btoa(bin);
      }
    } catch (e) { }
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64ToUtf8(b64) {
    try {
      if (typeof TextDecoder !== "undefined") {
        var bin = atob(String(b64).replace(/\s/g, ""));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      }
    } catch (e) { }
    return decodeURIComponent(escape(atob(String(b64).replace(/\s/g, ""))));
  }

  /* ---------- 合并策略 ---------- */
  function union(a, b) {
    var out = (a || []).slice();
    (b || []).forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    return out;
  }
  function byId(localList, remoteList) {
    var map = {}, order = [];
    (localList || []).forEach(function (it) {
      if (it && it.id != null) { map[it.id] = it; order.push(it.id); }
    });
    (remoteList || []).forEach(function (it) {
      if (!it || it.id == null) return;
      var cur = map[it.id];
      if (!cur) { map[it.id] = it; order.push(it.id); return; }
      var a = cur.ts || cur.updatedAt || cur.createdAt || 0;
      var b = it.ts || it.updatedAt || it.createdAt || 0;
      if (b > a) map[it.id] = it;
    });
    return order.map(function (k) { return map[k]; }).filter(Boolean);
  }
  function maxObj(a, b) {
    var out = {}, a1 = a || {}, b1 = b || {};
    Object.keys(a1).forEach(function (k) { out[k] = a1[k]; });
    Object.keys(b1).forEach(function (k) {
      var x = out[k], y = b1[k];
      if (x == null) out[k] = y;
      else if (typeof x === "number" && typeof y === "number") out[k] = Math.max(x, y);
    });
    return out;
  }

  function merge(local, remote) {
    if (!remote) return local;
    var L = local, R = remote;
    return {
      ddj: {
        done: union(L.ddj && L.ddj.done, R.ddj && R.ddj.done),
        today: (L.ddj && L.ddj.today) || (R.ddj && R.ddj.today) || null,
        streak: Math.max((L.ddj && L.ddj.streak) || 0, (R.ddj && R.ddj.streak) || 0),
        lastDay: (L.ddj && L.ddj.lastDay) || (R.ddj && R.ddj.lastDay) || "",
        finishedDays: union(L.ddj && L.ddj.finishedDays, R.ddj && R.ddj.finishedDays)
      },
      nce: {
        readDays: maxObj(L.nce && L.nce.readDays, R.nce && R.nce.readDays),
        lastLesson: (L.nce && L.nce.lastLesson) || (R.nce && R.nce.lastLesson) || 1
      },
      news: { read: union(L.news && L.news.read, R.news && R.news.read) },
      flute: {
        done: union(L.flute && L.flute.done, R.flute && R.flute.done),
        today: (L.flute && L.flute.today) || (R.flute && R.flute.today) || null,
        streak: Math.max((L.flute && L.flute.streak) || 0, (R.flute && R.flute.streak) || 0),
        lastDay: (L.flute && L.flute.lastDay) || (R.flute && R.flute.lastDay) || "",
        custom: Object.assign({}, (R.flute && R.flute.custom) || {}, (L.flute && L.flute.custom) || {}),
        seconds: maxObj(L.flute && L.flute.seconds, R.flute && R.flute.seconds),
        notes: byId(L.flute && L.flute.notes, R.flute && R.flute.notes),
        memoFilter: (L.flute && L.flute.memoFilter) || "open"
      },
      memo: { items: byId(L.memo && L.memo.items, R.memo && R.memo.items), filter: (L.memo && L.memo.filter) || "open" },
      ui: L.ui || {}
    };
  }

  function same(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
  }

  /* ---------- 网络 ---------- */
  function ghGet() {
    return fetch(API, {
      headers: { "Authorization": "token " + token, "Accept": "application/vnd.github+json" },
      cache: "no-store"
    }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (!j) return null;
      sha = j.sha || sha;
      try { return JSON.parse(b64ToUtf8(j.content || "")); } catch (e) { return null; }
    });
  }

  function ghPut(obj) {
    var body = JSON.stringify({
      message: "sync " + new Date().toISOString(),
      content: utf8ToB64(JSON.stringify(obj)),
      sha: sha || undefined
    });
    return fetch(API, {
      method: "PUT",
      headers: {
        "Authorization": "token " + token,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: body
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (j && j.content && j.content.sha) sha = j.content.sha;
      return true;
    });
  }

  /* ---------- 一次同步：拉取 → 合并 → 写回 ---------- */
  function syncOnce(forceWrite) {
    if (!token || busy || typeof fetch !== "function") return Promise.resolve(false);
    busy = true;
    setState("syncing");
    return ghGet().then(function (remote) {
      var local = window.Store.data;
      var merged = merge(local, remote);
      var changed = !same(merged, local);
      if (changed) {
        applying = true;
        try { window.Store.replace(merged); } finally { applying = false; }
        rerender();
      }
      if (forceWrite || changed) return ghPut(merged);
      return false;
    }).then(function (wrote) {
      saveMeta(wrote);
      setState("on");
      return true;
    }).catch(function (e) {
      setState("error", e && e.message ? e.message : "网络失败");
      return false;
    }).then(function (ok) { busy = false; return ok; });
  }

  function rerender() {
    var MOD = window.MOD || {};
    ["ddj", "nce", "news", "flute", "memo"].forEach(function (k) {
      try { if (MOD[k] && MOD[k].render) MOD[k].render(); } catch (e) { }
    });
  }

  /* ---------- 状态 ---------- */
  function saveMeta(wrote) {
    var m = { lastSyncAt: Date.now() };
    if (wrote) m.lastPushAt = Date.now();
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { }
    paint();
  }
  function meta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch (e) { return {}; }
  }
  function setState(s, msg) {
    lastState = s;
    listeners.forEach(function (f) { try { f(s, msg); } catch (e) { } });
    paint();
  }
  function ago(ts) {
    if (!ts) return "从未";
    var d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return "刚刚";
    if (d < 3600) return Math.floor(d / 60) + " 分钟前";
    if (d < 86400) return Math.floor(d / 3600) + " 小时前";
    return Math.floor(d / 86400) + " 天前";
  }

  function paint() {
    var st = document.getElementById("syncState");
    var tip = document.getElementById("syncTip");
    if (!st) return;
    if (!token) {
      st.textContent = "未开启";
      if (tip) tip.innerHTML = "开启后，电脑和手机上的<b>已读 / 打卡 / 备忘录</b>会自动同步。";
      return;
    }
    var m = meta();
    st.textContent = lastState === "syncing" ? "同步中…"
      : lastState === "error" ? "同步失败" : "已连接 · " + ago(m.lastSyncAt);
    if (tip) {
      tip.innerHTML = lastState === "error"
        ? "同步失败（多为网络问题），稍后会自动重试，或点「立即同步」。"
        : "已开启：本机数据与云端自动合并（取并集，不会互相覆盖）。";
    }
  }

  /* ---------- 对外 ---------- */
  var Sync = {
    on: function (cb) { listeners.push(cb); },
    enabled: function () { return !!token; },
    state: function () { return lastState; },
    pull: function () { return syncOnce(false); },
    push: function () { return syncOnce(true); },
    setToken: function (t) {
      t = (t || "").trim();
      if (!t) return false;
      token = t;
      try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { }
      paint();
      return syncOnce(true);
    },
    clear: function () {
      token = "";
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(META_KEY); } catch (e) { }
      paint();
    },
    pairUrl: function () {
      var base = location.origin && location.origin.indexOf("http") === 0
        ? location.origin + location.pathname : "https://work749.github.io/";
      return base + "#sync=" + encodeURIComponent(token);
    },
    /* 本地数据变更后延迟推送，避免连点产生大量提交 */
    markDirty: function () {
      if (!token || applying) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(function () { syncOnce(true); }, 2500);
    },
    start: function () {
      if (!token) return;
      syncOnce(false);
      clearInterval(pullTimer);
      pullTimer = setInterval(function () { syncOnce(false); }, 120000);
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) syncOnce(false);
      });
    }
  };
  window.SYNC = Sync;

  /* ---------- 接管保存：本地一变就排队上传 ---------- */
  function hookSave() {
    if (!window.Store || window.Store.__syncHooked) return;
    var orig = window.Store.save;
    window.Store.save = function () {
      orig.apply(window.Store, arguments);
      Sync.markDirty();
    };
    window.Store.__syncHooked = true;
  }

  /* ---------- 启动 ---------- */
  function boot() {
    try { token = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { }
    hookSave();
    paint();

    // 配对链接：另一台设备打开后自动完成配置
    var m = location.hash.match(/sync=([^&]+)/);
    if (m) {
      var t = decodeURIComponent(m[1]);
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { }
      if (t && t !== token) {
        Sync.setToken(t).then(function () { toast("同步已开启"); Sync.start(); });
      }
    }
    if (token) Sync.start();

    bindUi();
  }

  function bindUi() {
    var setup = document.getElementById("syncSetup");
    var now = document.getElementById("syncNow");
    var off = document.getElementById("syncOff");
    var pair = document.getElementById("syncPair");

    if (setup) setup.onclick = function () {
      var t = prompt(
        "粘贴 GitHub 密钥（一次性，只存在这台设备上）\n\n" +
        "获取方式：GitHub → 头像 → Settings → Developer settings →\n" +
        "Personal access tokens → Tokens (classic) → Generate new token (classic)\n" +
        "Note 随便填；Expiration 选 No expiration；只勾 public_repo。",
        token || "");
      if (!t) return;
      Sync.setToken(t).then(function (ok) {
        toast(ok ? "同步已开启" : "开启失败，请检查密钥或网络");
        if (ok) Sync.start();
      });
    };
    if (now) now.onclick = function () {
      if (!token) { toast("请先点「开启同步」"); return; }
      Sync.push().then(function (ok) { toast(ok ? "已同步" : "同步失败，稍后再试"); });
    };
    if (pair) pair.onclick = function () {
      if (!token) { toast("请先点「开启同步」"); return; }
      var url = Sync.pairUrl();
      copy(url);
      toast("配对链接已复制，发到另一台设备打开即可");
      var box = document.getElementById("syncPairBox");
      if (box) box.innerHTML = '<div class="page-desc" style="word-break:break-all;margin-top:8px">' + url + "</div>";
    };
    if (off) off.onclick = function () {
      if (!confirm("关闭同步？本机数据会保留，只是不再与其他设备同步。")) return;
      Sync.clear();
      toast("已关闭同步");
    };
  }

  function copy(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text); return;
      }
    } catch (e) { }
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    } catch (e) { }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
