/* 主程序：路由、设置、主题、数据导入导出 */
(function () {
  var ACCENTS = ["#d9a441", "#4ecdc4", "#5b9df9", "#a78bfa"];

  function applyAccent(c) {
    document.documentElement.style.setProperty("--accent", c);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#0a0b0d");
  }

  function renderSwatches() {
    $("#swatches").innerHTML = ACCENTS.map(function (c) {
      return '<div class="swatch' + (Store.data.ui.accent === c ? " on" : "") + '" data-c="' + c + '" style="background:' + c + '"></div>';
    }).join("");
    $("#swatches").onclick = function (e) {
      var s = e.target.closest(".swatch");
      if (!s) return;
      Store.data.ui.accent = s.dataset.c; Store.save();
      applyAccent(s.dataset.c); renderSwatches();
    };
  }

  function fillVoices() {
    var sel = $("#setVoice");
    var zh = getVoices("zh");
    sel.innerHTML = '<option value="">系统默认</option>' +
      zh.map(function (v) {
        return '<option value="' + esc(v.voiceURI) + '"' + (Store.data.ui.voiceURI === v.voiceURI ? " selected" : "") + ">" +
          esc(v.name) + "（" + esc(v.lang) + "）</option>";
      }).join("");
    sel.onchange = function () { Store.data.ui.voiceURI = sel.value; Store.save(); toast("已切换朗读音色"); };
  }

  function bindSettings() {
    var size = $("#setDdjSize");
    size.value = Store.data.ui.ddjSize || 21;
    size.onchange = function () {
      Store.data.ui.ddjSize = parseInt(size.value, 10) || 21; Store.save();
      if (window.MOD && MOD.ddj) MOD.ddj.render();
    };
    var per = $("#setPerDay");
    per.value = Store.data.ui.perDay || 6;
    per.onchange = function () {
      Store.data.ui.perDay = parseInt(per.value, 10) || 6;
      Store.data.ddj.today = null;
      Store.save(); if (window.MOD && MOD.ddj) MOD.ddj.render(); toast("每日句数已更新");
    };

    $("#btnExport").onclick = function () {
      var name = "曾小满工作台备份-" + todayStr() + ".json";
      var text = JSON.stringify(Store.data, null, 2);
      // 安卓 App 内：交给原生保存到系统「下载」目录
      try {
        if (window.AndroidApp && typeof AndroidApp.saveFile === "function") {
          AndroidApp.saveFile(name, btoa(unescape(encodeURIComponent(text))));
          toast("已保存到手机「下载」目录");
          return;
        }
      } catch (e) { }
      var blob = new Blob([text], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      toast("已导出");
    };
    $("#btnImport").onclick = function () { $("#fileImport").click(); };
    $("#fileImport").onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var obj = JSON.parse(r.result);
          if (!obj || typeof obj !== "object") throw new Error("bad");
          Store.replace(obj);
          location.reload();
        } catch (err) { toast("文件格式不对"); }
      };
      r.readAsText(f);
    };
    $("#btnClear").onclick = function () {
      if (!confirm("确定清空全部打卡记录？此操作不可恢复。")) return;
      Store.reset(); location.reload();
    };
  }

  function go(page) {
    $$(".page").forEach(function (p) { p.classList.toggle("active", p.id === "page-" + page); });
    $$("#nav .nav-item").forEach(function (b) { b.classList.toggle("active", b.dataset.page === page); });
    $$("#tabbar .tab").forEach(function (b) { b.classList.toggle("active", b.dataset.page === page); });
    window.scrollTo({ top: 0 });
    try { localStorage.setItem("zengxiaoman.lastPage", page); } catch (e) { }
  }

  function bindNav() {
    $$("#nav .nav-item, #tabbar .tab").forEach(function (b) {
      b.onclick = function () { go(b.dataset.page); };
    });
  }

  /* ---------- 离线缓存 / 更新 ---------- */
  function hardReload() {
    location.href = location.pathname + "?t=" + Date.now();
  }
  function clearCacheThen(fn) {
    if (window.caches && caches.keys) {
      caches.keys().then(function (ks) {
        return Promise.all(ks.map(function (k) { return caches.delete(k); }));
      }).then(function () {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          return navigator.serviceWorker.getRegistrations().then(function (rs) {
            return Promise.all(rs.map(function (r) { return r.unregister(); }));
          });
        }
      }).then(fn).catch(fn);
    } else fn();
  }

  function initSW() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      // 发现新版本 → 自动重载一次（同一会话只重载一次，避免死循环）
      reg.addEventListener("updatefound", function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", function () {
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            try {
              if (!sessionStorage.getItem("zxm.sw.reload")) {
                sessionStorage.setItem("zxm.sw.reload", "1");
                location.reload();
              }
            } catch (e) { location.reload(); }
          }
        });
      });
      setInterval(function () { try { reg.update(); } catch (e) { } }, 600000);
    }).catch(function () { });

    var btn = $("#btnUpdate");
    if (btn) btn.onclick = function () { clearCacheThen(hardReload); };
  }

  function init() {
    applyAccent(Store.data.ui.accent || ACCENTS[0]);
    $("#todayLabel").textContent = dateLabel(todayStr()) + " · " +
      ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date().getDay()];

    bindNav(); renderSwatches(); bindSettings(); fillVoices();

    ["ddj", "nce", "news", "house", "flute", "memo"].forEach(function (k) {
      if (window.MOD && MOD[k] && MOD[k].init) MOD[k].init();
    });

    var last = "";
    try { last = localStorage.getItem("zengxiaoman.lastPage") || "ddj"; } catch (e) { last = "ddj"; }
    go(last);

    initSW();

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(function () { });
    }
    setTimeout(fillVoices, 600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
