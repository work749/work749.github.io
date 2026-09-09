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

  window.speak = function (text, lang, opts) {
    if (!window.speechSynthesis) { toast("当前浏览器不支持语音朗读"); return null; }
    opts = opts || {};
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = lang || "zh-CN";
    u.rate = opts.rate || (lang && lang.indexOf("en") === 0 ? (data.ui.nceRate || 0.9) : 0.95);
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
  window.stopSpeak = function () { if (window.speechSynthesis) speechSynthesis.cancel(); };

  /* ---------- 转义 ---------- */
  window.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
})();
