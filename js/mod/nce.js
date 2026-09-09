/* 新概念英语模块：点读 / 跟读 / 听写 */
(function () {
  var LESSONS = window.NCE_LESSONS || [];
  var cur = 0;
  var dictation = false;
  var playIdx = -1;

  function lesson() { return LESSONS[cur]; }

  function renderList() {
    $("#nceCount").textContent = "共 " + LESSONS.length + " 课";
    $("#nceList").innerHTML = LESSONS.map(function (l, i) {
      return '<button class="nce-chip' + (i === cur ? " active" : "") + '" data-i="' + i + '">L' + l.no + "</button>";
    }).join("");
    $("#nceList").onclick = function (e) {
      var b = e.target.closest(".nce-chip");
      if (!b) return;
      cur = parseInt(b.dataset.i, 10);
      Store.data.nce.lastLesson = cur; Store.save();
      stopSpeak(); render();
    };
  }

  function wordsHtml(text) {
    return text.split(/(\s+)/).map(function (tk) {
      if (!tk.trim()) return tk;
      if (/^[A-Za-z]/.test(tk.replace(/[^A-Za-z]/g, ""))) {
        return '<span class="word">' + esc(tk) + "</span>";
      }
      return esc(tk);
    }).join("");
  }

  function renderBody() {
    var l = lesson();
    if (!l) return;
    $("#nceTitle").textContent = "Lesson " + l.no + "　" + l.title + "　（" + l.zh + "）";

    var hideZh = !!Store.data.nce.hideZh;
    $("#nceBody").innerHTML = l.lines.map(function (ln, i) {
      return '<div class="line-row" data-i="' + i + '">' +
        '<div class="line-en' + (dictation ? " blur" : "") + '"><span class="num">' + (i + 1) + '</span>' + wordsHtml(ln.en) + "</div>" +
        '<div class="line-zh' + (hideZh ? " hide" : "") + '">' + esc(ln.zh) + "</div></div>";
    }).join("");

    $("#nceBody").onclick = function (e) {
      var w = e.target.closest(".word");
      var row = e.target.closest(".line-row");
      if (!row) return;
      var i = parseInt(row.dataset.i, 10);
      if (w) { speak(w.textContent.replace(/[^A-Za-z'-]/g, ""), "en-US"); return; }
      $$(".line-row", $("#nceBody")).forEach(function (r) { r.classList.remove("playing"); });
      row.classList.add("playing");
      speak(l.lines[i].en, "en-US");
    };

    $("#nceWords").innerHTML = (l.words || []).map(function (w) {
      return '<div class="word-card" data-w="' + esc(w.w) + '"><div class="w">' + esc(w.w) + "</div>" +
        '<div class="ph">' + esc(w.ph) + '</div><div class="z">' + esc(w.zh) + "</div></div>";
    }).join("") || '<div class="page-desc">本课暂无生词</div>';
    $("#nceWords").onclick = function (e) {
      var c = e.target.closest(".word-card");
      if (c) speak(c.dataset.w, "en-US");
    };
  }

  function playAll() {
    var l = lesson(); if (!l) return;
    stopSpeak();
    playIdx = -1;
    (function next() {
      playIdx++;
      if (playIdx >= l.lines.length) { playIdx = -1; return; }
      $$(".line-row", $("#nceBody")).forEach(function (r) { r.classList.remove("playing"); });
      var row = $('.line-row[data-i="' + playIdx + '"]', $("#nceBody"));
      if (row) { row.classList.add("playing"); row.scrollIntoView({ block: "center", behavior: "smooth" }); }
      speak(l.lines[playIdx].en, "en-US", { onend: next });
    })();
  }

  function render() {
    renderList();
    renderBody();
    $("#nceToggleZh").textContent = Store.data.nce.hideZh ? "显示中文" : "隐藏中文";
    $("#nceDictation").textContent = dictation ? "退出听写" : "听写模式";
    var rd = Store.data.nce.readDays[todayStr()] || [];
    var btn = $("#nceDone");
    btn.textContent = rd.indexOf(lesson().no) >= 0 ? "今日已读 ✓" : "今日已读打卡";
    btn.classList.toggle("done", rd.indexOf(lesson().no) >= 0);
  }

  function bind() {
    $("#ncePlayAll").onclick = playAll;
    $("#nceStop").onclick = function () { stopSpeak(); playIdx = -1; $$(".line-row").forEach(function (r) { r.classList.remove("playing"); }); };
    $("#nceToggleZh").onclick = function () { Store.data.nce.hideZh = !Store.data.nce.hideZh; Store.save(); render(); };
    $("#nceDictation").onclick = function () { dictation = !dictation; render(); toast(dictation ? "英文已遮挡，点击句子可显示" : "已退出听写模式"); };
    $("#nceDone").onclick = function () {
      var d = Store.data.nce, k = todayStr();
      d.readDays[k] = d.readDays[k] || [];
      var no = lesson().no, i = d.readDays[k].indexOf(no);
      if (i >= 0) d.readDays[k].splice(i, 1); else d.readDays[k].push(no);
      Store.save(); render();
    };
    var rate = $("#nceRate");
    rate.value = Store.data.ui.nceRate || 0.9;
    rate.oninput = function () { Store.data.ui.nceRate = parseFloat(rate.value); Store.save(); };
  }

  window.MOD = window.MOD || {};
  window.MOD.nce = {
    init: function () {
      cur = Math.min(Store.data.nce.lastLesson || 0, LESSONS.length - 1);
      bind(); render();
    },
    render: render
  };
})();
