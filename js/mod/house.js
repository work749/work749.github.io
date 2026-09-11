/* 房产数据模块：央行 LPR + 国家统计局 70 城指数 + 重点城市成交
   数据仅显示为公开趋势样本（颗粒度：城市/项目级，**没有具体小区挂牌/成交价**） */
(function () {
  var D = function () { return (window.HOUSE_DATA) || {}; };
  var selCity = "深圳";   // 70 城指数当前选中城市
  var selDeal = "深圳";   // 重点城市成交当前选中

  // ============ 工具 ============
  function fmtPct(n) {
    if (n === null || n === undefined) return "-";
    return (n > 0 ? "+" : "") + n.toFixed(1) + "%";
  }
  function colorOf(n) {
    if (n > 0) return "var(--up)";      // 涨 = 红
    if (n < 0) return "var(--down)";    // 跌 = 绿
    return "var(--text-dim)";
  }

  // ============ 折线图（纯 SVG，无依赖） ============
  function sparkline(values, opts) {
    opts = opts || {};
    var w = opts.w || 360, h = opts.h || 90;
    var pad = { l: 28, r: 8, t: 8, b: 18 };
    var innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (min === max) { min -= 1; max += 1; }
    var range = max - min;
    var n = values.length;
    var stepX = innerW / (n - 1 || 1);
    var pts = values.map(function (v, i) {
      var x = pad.l + i * stepX;
      var y = pad.t + innerH - ((v - min) / range) * innerH;
      return [x, y];
    });
    var path = pts.map(function (p, i) { return (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    var lastVal = values[values.length - 1];
    var stroke = "var(--text-dim)";
    if (lastVal > 0) stroke = "var(--up)";
    else if (lastVal < 0) stroke = "var(--down)";
    var yTicks = [min, (min + max) / 2, max].map(function (v) {
      var y = pad.t + innerH - ((v - min) / range) * innerH;
      return '<line x1="' + pad.l + '" x2="' + (w - pad.r) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="rgba(255,255,255,0.06)"/>' +
             '<text x="' + (pad.l - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="10" fill="var(--text-dim)">' + v.toFixed(1) + '</text>';
    }).join("");
    var points = pts.map(function (p, i) {
      return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (i === pts.length - 1 ? 3 : 1.5) + '" fill="' + stroke + '"/>';
    }).join("");
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" style="display:block">' +
      yTicks +
      '<path d="' + path + '" fill="none" stroke="' + stroke + '" stroke-width="1.6"/>' +
      points +
      '<text x="' + pad.l + '" y="' + (h - 4) + '" font-size="9" fill="var(--text-dim)">' + (opts.xStart || "") + '</text>' +
      '<text x="' + (w - pad.r) + '" y="' + (h - 4) + '" text-anchor="end" font-size="9" fill="var(--text-dim)">' + (opts.xEnd || "") + '</text>' +
      '</svg>';
  }

  // ============ LPR 卡片 ============
  function renderLpr() {
    var d = D();
    var rows = d.lpr.slice().reverse().map(function (r) {
      var c1 = r.change.indexOf("-") >= 0 ? "var(--down)" : (r.change === "持平" ? "var(--text-dim)" : "var(--up)");
      return '<tr>' +
        '<td>' + esc(r.date) + '</td>' +
        '<td class="num">' + r.m1.toFixed(2) + '%</td>' +
        '<td class="num">' + r.m5.toFixed(2) + '%</td>' +
        '<td class="num" style="color:' + c1 + '">' + esc(r.change) + '</td>' +
        '</tr>';
    }).join("");
    var html = '<table class="kv-table"><thead><tr><th>公布日</th><th>1年期</th><th>5年期+</th><th>变化</th></tr></thead><tbody>' + rows + '</tbody></table>';
    $("#houseLprBody").innerHTML = html;
  }

  // ============ 70 城指数卡片 ============
  function renderIndex(kind) {
    var d = D();
    var data = (kind === "used" ? d.usedIndex : d.newIndex) || {};
    var cities = Object.keys(data);
    if (!cities.length) { $("#houseIndexBody").innerHTML = '<div class="empty">暂无数据</div>'; return; }
    if (cities.indexOf(selCity) < 0) selCity = cities[0];

    var monthLabels = d.months || [];
    var xEnd = monthLabels[monthLabels.length - 1] || "";
    var xStart = monthLabels[0] || "";

    var citySel = cities.map(function (c) {
      return '<option value="' + c + '"' + (c === selCity ? " selected" : "") + '>' + c + '</option>';
    }).join("");

    var arr = data[selCity] || [];
    var last = arr[arr.length - 1];
    var prev = arr[arr.length - 2];

    var html =
      '<div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<label class="page-desc">城市 <select class="input" id="houseCitySel" style="min-width:120px">' + citySel + '</select></label>' +
        '<span class="page-desc">最新月环比 <b style="color:' + colorOf(last) + '">' + fmtPct(last) + '</b></span>' +
        (prev !== undefined ? '<span class="page-desc">上月 <span style="color:' + colorOf(prev) + '">' + fmtPct(prev) + '</span></span>' : '') +
        '<span class="page-desc" style="margin-left:auto">单位：% (国家统计局 70 城指数)</span>' +
      '</div>' +
      '<div class="chart-wrap">' + sparkline(arr, { w: 600, h: 120, xStart: xStart, xEnd: xEnd }) + '</div>' +
      '<table class="kv-table" style="margin-top:10px"><thead><tr><th>月份</th><th class="num">环比</th></tr></thead><tbody>' +
      arr.map(function (v, i) {
        return '<tr><td>' + esc(monthLabels[i] || "") + '</td><td class="num" style="color:' + colorOf(v) + '">' + fmtPct(v) + '</td></tr>';
      }).join("") +
      '</tbody></table>';

    $("#houseIndexBody").innerHTML = html;
    var cs = $("#houseCitySel");
    if (cs) cs.onchange = function () { selCity = cs.value; renderIndex(kind); };
  }

  // ============ 重点城市成交卡片 ============
  function renderDeals() {
    var d = D();
    var data = d.deals || {};
    var cities = Object.keys(data);
    if (!cities.length) { $("#houseDealBody").innerHTML = '<div class="empty">暂无数据</div>'; return; }
    if (cities.indexOf(selDeal) < 0) selDeal = cities[0];

    var monthLabels = d.months || [];
    var xEnd = monthLabels[monthLabels.length - 1] || "";
    var xStart = monthLabels[0] || "";

    var citySel = cities.map(function (c) {
      return '<option value="' + c + '"' + (c === selDeal ? " selected" : "") + '>' + c + '</option>';
    }).join("");

    var v = data[selDeal];
    var priceDelta = (v.price[v.price.length - 1] - v.price[0]).toFixed(2);
    var priceDeltaPct = ((v.price[v.price.length - 1] - v.price[0]) / v.price[0] * 100).toFixed(2);
    var unitsLast = v.units[v.units.length - 1];
    var areaLast = v.area[v.area.length - 1];

    var html =
      '<div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<label class="page-desc">城市 <select class="input" id="houseDealSel" style="min-width:120px">' + citySel + '</select></label>' +
        '<span class="page-desc">最新月成交 <b>' + unitsLast.toFixed(1) + '</b> 千套 / <b>' + areaLast.toFixed(0) + '</b> 万㎡</span>' +
        '<span class="page-desc">13个月均价变动 <b style="color:' + (priceDelta >= 0 ? "var(--up)" : "var(--down)") + '">' +
        (priceDelta >= 0 ? "+" : "") + priceDelta + ' 元/㎡ (' + (priceDeltaPct >= 0 ? "+" : "") + priceDeltaPct + '%)' +
        '</b></span>' +
      '</div>' +
      '<div class="chart-wrap">' + sparkline(v.price, { w: 600, h: 120, xStart: xStart, xEnd: xEnd }) + '</div>' +
      '<div class="page-desc" style="margin:6px 0 2px">成交均价走势 (元/㎡)</div>' +
      '<table class="kv-table"><thead><tr><th>月份</th><th class="num">成交(千套)</th><th class="num">面积(万㎡)</th><th class="num">均价(元/㎡)</th></tr></thead><tbody>' +
      v.units.map(function (_, i) {
        return '<tr><td>' + esc(monthLabels[i] || "") + '</td><td class="num">' + v.units[i].toFixed(1) + '</td><td class="num">' + v.area[i].toFixed(0) + '</td><td class="num">' + v.price[i].toFixed(1) + '</td></tr>';
      }).join("") +
      '</tbody></table>';

    $("#houseDealBody").innerHTML = html;
    var ds = $("#houseDealSel");
    if (ds) ds.onchange = function () { selDeal = ds.value; renderDeals(); };
  }

  // ============ 主渲染 ============
  function render() {
    var d = D();
    if (!d || !d.lpr) { $("#houseLprBody").innerHTML = '<div class="empty">数据未加载</div>'; return; }
    $("#houseUpdated").textContent = dateLabel(d.updated || todayStr());
    renderLpr();
    renderIndex("new");
    renderDeals();
  }

  // 70 城指数"新房/二手房"切换
  function bindIndexTabs() {
    $$("#houseIndexTabs [data-kind]").forEach(function (b) {
      b.onclick = function () {
        $$("#houseIndexTabs [data-kind]").forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
        renderIndex(b.dataset.kind);
      };
    });
  }

  function init() {
    bindIndexTabs();
    render();
  }

  window.MOD = window.MOD || {};
  window.MOD.house = { init: init, render: render };
})();
