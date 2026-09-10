/* 本地存储 + 通用工具 */
(function () {
  var KEY = "zengxiaoman.workspace.v1";

  var DEFAULT = {
    ddj: { done: [], today: null, streak: 0, lastDay: "", finishedDays: [] },
    nce: { readDays: {}, lastLesson: 1 },
    news: { read: [] },
    flute: { done: [], today: null, streak: 0, lastDay: "", custom: {}, seconds: {}, notes: [], memoFilter: "open" },
    memo: { items: [], filter: "open" },
    ui: { accent: "#d9a441", ddjSize: 21, perDay: 6, voiceURI: "", nceRate: 0.9 }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var data = (function () {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULT);
      var p = JSON.parse(raw);
      return {
        ddj: Object.assign(clone(DEFAULT.ddj), p.ddj || {}),
        nce: Object.assign(clone(DEFAULT.nce), p.nce || {}),
        news: Object.assign(clone(DEFAULT.news), p.news || {}),
        flute: Object.assign(clone(DEFAULT.flute), p.flute || {}),
        memo: Object.assign(clone(DEFAULT.memo), p.memo || {}),
        ui: Object.assign(clone(DEFAULT.ui), p.ui || {})
      };
    } catch (e) { return clone(DEFAULT); }
  })();

  var Store = {
    get data() { return data; },
    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(data)); }
      catch (e) { toast("保存失败：本地存储空间不足"); }
    },
    reset: function () { data = clone(DEFAULT); Store.save(); },
    replace: function (obj) { data = obj; Store.save(); }
  };
  window.Store = Store;

  /* ---------- DOM ---------- */
  window.$ = function (s, r) { return (r || document).querySelector(s); };
  window.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 日期 ---------- */
  window.todayStr = function (d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (day < 10 ? "0" + day : day);
  };
  window.dayOffset = function (n) {
    var d = new Date(); d.setDate(d.getDate() + n); return todayStr(d);
  };
  window.dateLabel = function (s) {
    if (!s) return "";
    var p = s.split("-");
    return parseInt(p[1], 10) + "月" + parseInt(p[2], 10) + "日";
  };

  /* ---------- toast ---------- */
  var toastTimer;
  window.toast = function (msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2000);
  };

  /* ---------- 语音合成 ---------- */
  var voices = [];
  function loadVoices() {
    if (!window.speechSynthesis) return;
    voices = speechSynthesis.getVoices() || [];
  }
  loadVoices();
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = loadVoices;

  window.getVoices = function (langPrefix) {
    if (!voices.length) loadVoices();
    return voices.filter(function (v) { return !langPrefix || v.lang.toLowerCase().indexOf(langPrefix) === 0; });
  };

  /* ---------- 语音合成 ----------
     APP（安卓 WebView）里没有可用的 Web Speech API，改用手机原生语音引擎：
     通过 AndroidApp.speak() 桥接，播完原生会回调 window.__ttsDone(id) 触发 onend。 */
  var nativeSeq = 0;
  var nativeCb = {};

  window.__ttsDone = function (id) {
    var c = nativeCb[id];
    if (c) { delete nativeCb[id]; if (c.onend) try { c.onend(); } catch (e) { } }
  };
  window.__ttsStart = function (id) {
    var c = nativeCb[id];
    if (c && c.onstart) try { c.onstart(); } catch (e) { }
  };

  function nativeTtsOk() {
    return !!(window.AndroidApp && typeof window.AndroidApp.speak === "function"
      && window.AndroidApp.ttsReady && window.AndroidApp.ttsReady());
  }

  window.speak = function (text, lang, opts) {
    if (!text) return null;
    opts = opts || {};
    var rate = opts.rate || (lang && lang.indexOf("en") === 0 ? (data.ui.nceRate || 0.9) : 0.95);

    if (nativeTtsOk()) {
      var id = "u" + (++nativeSeq);
      nativeCb[id] = opts;
      try {
        window.AndroidApp.speak(String(text), lang || "zh-CN", rate, id);
        return { native: true, id: id };
      } catch (e) { /* 桥接失败则回退网页语音 */ }
    }

    if (!window.speechSynthesis) {
      // APP 内原生引擎也不可用时，给明确指引，而不是干巴巴一句“不支持”
      if (window.AndroidApp) toast("手机缺少中文语音引擎，请安装「Google 文字转语音」或讯飞语音引擎");
      else toast("当前浏览器不支持语音朗读");
      return null;
    }
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = lang || "zh-CN";
    u.rate = rate;
    u.pitch = opts.pitch || 1;
    var pick = null;
    if (u.lang.indexOf("zh") === 0 && data.ui.voiceURI) {
      pick = voices.filter(function (v) { return v.voiceURI === data.ui.voiceURI; })[0];
    }
    if (!pick && lang && lang.indexOf("en") === 0) {
      pick = voices.filter(function (v) { return /^en/i.test(v.lang); })[0];
    }
    if (pick) u.voice = pick;
    if (opts.onend) u.onend = opts.onend;
    if (opts.onstart) u.onstart = opts.onstart;
    speechSynthesis.speak(u);
    return u;
  };

  window.stopSpeak = function () {
    if (window.AndroidApp && typeof window.AndroidApp.stopSpeak === "function") {
      try { window.AndroidApp.stopSpeak(); } catch (e) { }
    }
    if (window.speechSynthesis) speechSynthesis.cancel();
    nativeCb = {};
  };

  /* ---------- 转义 ---------- */
  window.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
})();
