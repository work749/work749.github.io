/* 冒烟测试：用 jsdom 加载页面，检查四个模块渲染与交互是否正常
   运行： node tools/smoke-test.mjs
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const NODE_WS = process.env.NODE_WS || "C:/Users/admin/.workbuddy/binaries/node/workspace";
const require = createRequire(path.join(NODE_WS, "index.js"));
const { JSDOM, VirtualConsole } = require("jsdom");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const url = pathToFileURL(path.join(root, "index.html")).href;

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

// 简易 localStorage（jsdom 在 file:// 下 origin 为 opaque）
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  };
}

const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), {
  url,
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(w) {
    Object.defineProperty(w, "localStorage", { value: memStorage(), configurable: true });
    w.scrollTo = () => {};
    w.prompt = () => null;
    w.confirm = () => true;
  }
});

const w = dom.window;
await new Promise((res) => {
  if (w.document.readyState === "complete") return res();
  w.addEventListener("load", res);
  setTimeout(res, 4000);
});
await new Promise((r) => setTimeout(r, 400));

const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const results = [];
function check(name, cond, extra = "") {
  results.push({ name, ok: !!cond, extra });
}

// ---- 数据完整性 ----
const ddj = w.DAO_DE_JING || [];
const totalCh = ddj.reduce((a, p) => a + p.chapters.length, 0);
const totalSent = ddj.reduce((a, p) => a + p.chapters.reduce((b, c) => b + c.sent.length, 0), 0);
check("道德经 81 章", totalCh === 81, `实际 ${totalCh}`);
check("道德经句数 > 400", totalSent > 400, `实际 ${totalSent}`);

let han = 0, missing = 0, mismatch = 0;
for (const p of ddj) for (const c of p.chapters) for (const s of c.sent) {
  if (s.t.length !== s.p.length) mismatch++;
  for (let i = 0; i < s.t.length; i++) {
    if (/[\u4e00-\u9fff]/.test(s.t[i])) { han++; if (!s.p[i]) missing++; }
  }
}
check("汉字与拼音数量一致", mismatch === 0, `不一致句数 ${mismatch}`);
check("汉字拼音无缺失", missing === 0, `缺失 ${missing} / ${han}`);

// ---- 模块渲染 ----
check("今日任务渲染 6 句", $$("#ddjTodayList .ddj-sent").length === 6,
  `实际 ${$$("#ddjTodayList .ddj-sent").length}`);
check("拼音 ruby 已渲染", $$("#ddjTodayList ruby").length > 30, `ruby ${$$("#ddjTodayList ruby").length}`);
check("rt 拼音内容非空", $$("#ddjTodayList rt").every((r) => r.textContent.trim().length > 0));

check("章节列表 44 章（德经）", $$("#ddjChapters .chapter-btn").length === 44,
  `实际 ${$$("#ddjChapters .chapter-btn").length}`);
$$("#ddjChapters .chapter-btn")[0].click();
check("展开章节有内容", $$("#ddjChapterView .ddj-sent").length > 0);

const lessons = w.NCE_LESSONS || [];
check("英语课文数 >= 28", lessons.length >= 28, `${lessons.length} 课`);
check("英语课文结构完整", lessons.every((l) => l.no && l.title && l.zh && l.lines.length > 0 && l.words.length > 0),
  lessons.filter((l) => !(l.no && l.title && l.zh && l.lines.length && l.words.length)).map((l) => l.no).join(","));
check("英语课号无重复", new Set(lessons.map((l) => l.no)).size === lessons.length);
check("英语课文行渲染", $$("#nceBody .line-row").length > 0, `${$$("#nceBody .line-row").length} 行`);
check("英语单词可点读", $$("#nceBody .word").length > 10, `${$$("#nceBody .word").length} 个单词`);
check("生词卡渲染", $$("#nceWords .word-card").length > 0);

check("新闻 10 条", $$("#newsList .news-item").length === 10,
  `实际 ${$$("#newsList .news-item").length}`);
check("新闻含助贷/房产两类", $$("#newsList .tag.credit").length > 0 && $$("#newsList .tag.property").length > 0);

const fluteLessons = (w.FLUTE_COURSE || []).reduce((a, s) => a + s.lessons.length, 0);
check("笛子课程 >= 34 节", $$("#fluteCourse .lesson").length === fluteLessons && fluteLessons >= 34,
  `实际 ${$$("#fluteCourse .lesson").length} / 数据 ${fluteLessons}`);
check("笛子阶段 >= 5 个", (w.FLUTE_COURSE || []).length >= 5, `${(w.FLUTE_COURSE || []).length} 个阶段`);
check("课程 id 无重复", (() => {
  const ids = [];
  (w.FLUTE_COURSE || []).forEach((s) => s.lessons.forEach((l) => ids.push(l.id)));
  return new Set(ids).size === ids.length;
})());
check("含五声音阶练习课", (() => {
  const all = [];
  (w.FLUTE_COURSE || []).forEach((s) => s.lessons.forEach((l) => all.push(l.title + (l.goal || ""))));
  return all.some((t) => t.indexOf("五声音阶") >= 0);
})());
check("每节课都有视频与要点", (() => {
  let bad = 0;
  (w.FLUTE_COURSE || []).forEach((s) => s.lessons.forEach((l) => {
    if (!l.bvid || !l.kw || !(l.tips || []).length) bad++;
  }));
  return bad === 0;
})());
check("笛子指法表 12 行", $$("#fingerBody tr").length === 12, `${$$("#fingerBody tr").length} 行`);

// ---- 交互 ----
const before = $$("#ddjTodayList .ddj-sent.ok").length;
$$("#ddjTodayList .ddj-sent [data-act='ok']")[0].click();
const after = $$("#ddjTodayList .ddj-sent.ok").length;
check("标记已背生效", after === before + 1, `${before} -> ${after}`);
check("已背数写入统计", $("#ddjDone").textContent.trim().startsWith("1"), $("#ddjDone").textContent.trim());

$("#ddjTogglePy").click();
check("隐藏拼音后无 ruby", $$("#ddjTodayList ruby").length === 0);
$("#ddjTogglePy").click();
check("恢复拼音", $$("#ddjTodayList ruby").length > 0);

// 页面切换
$$("#nav .nav-item")[2].click();
check("切换到要闻页", $("#page-news").classList.contains("active"));
$$("#nav .nav-item")[3].click();
check("切换到笛子页", $("#page-flute").classList.contains("active"));

// 笛子展开视频
if (errors.length) console.log("!! 早期错误:\n" + errors.slice(0, 8).map((e) => "   " + e).join("\n"));
const lesson = $$("#fluteCourse .lesson")[0];
lesson.querySelector("[data-act='open']").click();
const iframe = lesson.querySelector(".video-wrap iframe");
check("笛子视频 iframe 注入", !!iframe && /player\.bilibili\.com/.test(iframe.src), iframe ? iframe.src : "无");
check("提供 B 站原链接兜底", !!lesson.querySelector('a[href*="bilibili.com/video"]'));

// 温故昨日（首次使用应隐藏）
check("温故卡片存在", !!$("#ddjReviewCard"));
check("首日无历史时温故隐藏", $("#ddjReviewCard").style.display === "none",
  "display=" + $("#ddjReviewCard").style.display);

// 练习计时
$("#fluteStart").click();
$("#fluteStopTimer").click();
const secs = (w.Store.data.flute.seconds || {});
check("练习计时写入当天", Object.keys(secs).length === 1 && Object.values(secs)[0] >= 0,
  JSON.stringify(secs));
check("计时后打卡连续天数", $("#fluteStreak").textContent.indexOf("1") >= 0, $("#fluteStreak").textContent.trim());

// 备忘录（独立模块 · iPhone 便签式）
$$("#nav .nav-item").find((b) => b.dataset.page === "memo").click();
check("切换到备忘录页", $("#page-memo").classList.contains("active"));
check("备忘录两栏结构齐全", !!$("#memoNotes") && !!$("#memoEdText") && !!$("#memoNew") && !!$("#memoSearch"));

$("#memoNew").click();
check("新建便签成功", (w.Store.data.memo.items || []).length === 1);
check("新建后进入编辑区", $("#memoEditor").style.display !== "none");
check("日期自动填今天", /^\d{4}-\d{2}-\d{2}$/.test($("#memoEdDay").value) &&
  $("#memoEdDay").value === new Date().toISOString().slice(0, 10), $("#memoEdDay").value);

// 写多行内容（第一行作标题，第二行作预览）
$("#memoEdText").value = "今晚练《茉莉花》\n8-16 小节慢练三遍，录音回听";
$("#memoEdText").dispatchEvent(new w.Event("input"));
w.MOD.memo.save();
check("内容已保存", w.Store.data.memo.items[0].text.indexOf("8-16 小节") > 0);
check("列表标题取首行", $("#memoNotes .memo-note-t").textContent === "今晚练《茉莉花》",
  $("#memoNotes .memo-note-t").textContent);
check("列表显示正文预览", $("#memoNotes .memo-note-p").textContent.indexOf("8-16") >= 0,
  $("#memoNotes .memo-note-p").textContent);

// 再建一条并置顶
$("#memoNew").click();
$("#memoEdText").value = "明天去银行跑客户";
$("#memoEdText").dispatchEvent(new w.Event("input"));
w.MOD.memo.save();
check("可连续新建", (w.Store.data.memo.items || []).length === 2);
$("#memoPin").click();
check("置顶生效", w.Store.data.memo.items.find((n) => n.text.indexOf("银行") >= 0).pinned === true);
check("置顶项排在列表第一", $("#memoNotes .memo-note").textContent.indexOf("银行") >= 0,
  $("#memoNotes .memo-note").textContent.slice(0, 24));

// 搜索
$("#memoSearch").value = "茉莉";
$("#memoSearch").dispatchEvent(new w.Event("input"));
check("搜索过滤生效", $$("#memoNotes .memo-note").length === 1, `${$$("#memoNotes .memo-note").length} 条`);
$("#memoSearch").value = "";
$("#memoSearch").dispatchEvent(new w.Event("input"));
check("清空搜索恢复全部", $$("#memoNotes .memo-note").length === 2);

// 完成 / 筛选
$("#memoDone").click();
check("标记完成生效", w.Store.data.memo.items.filter((n) => n.done).length === 1);
$("#memoDone").click();
check("可取消完成", w.Store.data.memo.items.filter((n) => n.done).length === 0);
check("统计显示条数", $("#memoStatAll").textContent.indexOf("2") >= 0, $("#memoStatAll").textContent.trim());

// 闹铃
$("#memoEdTime").value = "07:00";
$("#memoEdTime").dispatchEvent(new w.Event("change"));
check("闹铃时间已保存", w.Store.data.memo.items.some((n) => n.time === "07:00"));
check("闹铃检查不报错", typeof w.MOD.memo.checkAlarms === "function" && (w.MOD.memo.checkAlarms(), true));

// 笛子页快捷区与备忘录页共用同一份数据
$$("#nav .nav-item").find((b) => b.dataset.page === "flute").click();
check("笛子页快捷备忘同步显示", $$("#memoQuickList .memo-item").length === 2,
  `${$$("#memoQuickList .memo-item").length} 条`);
$("#memoQuickText").value = "随手记：练长音 10 分钟";
$("#memoQuickAdd").click();
check("快捷添加写入同一份数据", (w.Store.data.memo.items || []).length === 3);
$$("#memoQuickList .memo-check")[0].click();
check("快捷区可直接打勾", w.Store.data.memo.items.filter((n) => n.done).length === 1);

// ---- 笛子：视频时长徽章 / 全屏 / allow 属性 ----
$$("#nav .nav-item").find((b) => b.dataset.page === "flute").click();
const vdur = $("#fluteCourse .vdur");
check("视频时长徽章显示", !!vdur && /^\d+:\d{2}$/.test((vdur.textContent || "").trim()),
  vdur ? vdur.textContent : "无");
check("全屏按钮存在", !!$("#fluteCourse [data-act='fs']"));
$("#fluteCourse [data-act='open']").click();
const ifr = $("#fluteCourse .video-wrap iframe");
check("视频 iframe 已注入", !!ifr);
check("iframe 带 allow=fullscreen", !!ifr && /fullscreen/.test(ifr.getAttribute("allow") || ""),
  ifr ? ifr.getAttribute("allow") : "无");

// ---- 道德经朗读：连读高亮 / 停止 / 语速 ----
$$("#nav .nav-item").find((b) => b.dataset.page === "ddj").click();
check("停止朗读按钮存在", !!$("#ddjStopSpeak"));
check("道德经语速滑块存在", !!$("#ddjRate"));
$("#ddjRate").value = "1.1";
$("#ddjRate").dispatchEvent(new w.Event("input"));
check("朗读语速可保存", Math.abs((w.Store.data.ui.ddjRate || 0) - 1.1) < 1e-6,
  String(w.Store.data.ui.ddjRate));
$("#ddjSpeakAll").click();
check("连读时高亮当前句", $$(".ddj-sent.speaking").length >= 1,
  `${$$(".ddj-sent.speaking").length} 句`);
let stopOk = true;
try { $("#ddjStopSpeak").click(); } catch (e) { stopOk = false; }
check("点击停止朗读不报错", stopOk);
check("停止后清除高亮", $$(".ddj-sent.speaking").length === 0);

// ---- 英语：跟读模式 ----
$$("#nav .nav-item").find((b) => b.dataset.page === "nce").click();
const nceFollow = $("#nceFollow");
check("跟读模式按钮存在", !!nceFollow);
if (nceFollow) {
  nceFollow.click();
  check("跟读模式可开启", /跟读中/.test(nceFollow.textContent), nceFollow.textContent);
  nceFollow.click();
  check("跟读模式可关闭", /跟读模式/.test(nceFollow.textContent), nceFollow.textContent);
}

// 持久化
check("localStorage 已写入", !!w.localStorage.getItem("zengxiaoman.workspace.v1"));

// ---- 跨设备同步 ----
check("同步卡片已就位", !!$("#syncSetup") && !!$("#syncNow") && !!$("#syncPair") && !!$("#syncOff"));
check("同步状态标签存在", !!$("#syncState"));
check("SYNC 模块已加载", !!w.SYNC && typeof w.SYNC.setToken === "function");
check("同步默认未开启", !!w.SYNC && w.SYNC.enabled() === false);
check("未开启时点同步不报错", (() => {
  try { $("#syncNow").click(); $("#syncPair").click(); return true; } catch (e) { return false; }
})());
check("配对链接指向永久地址", !!w.SYNC && /work749\.github\.io/.test(w.SYNC.pairUrl()));

// ---- APP 原生朗读桥接 ----
check("原生朗读回调已注册", typeof w.__ttsDone === "function" && typeof w.__ttsStart === "function");
const spoken = [];
w.AndroidApp = {
  ttsReady: () => true,
  speak: (t, lang, rate, id) => spoken.push({ t, lang, rate, id }),
  stopSpeak: () => {}
};
w.speak("上德不德，是以有德", "zh-CN", {});
check("APP 内朗读走手机原生引擎", spoken.length === 1 && spoken[0].t === "上德不德，是以有德");
let ttsEnded = false;
w.speak("第二句", "zh-CN", { onend: () => { ttsEnded = true; } });
if (spoken.length > 1) w.__ttsDone(spoken[spoken.length - 1].id);
check("原生读完回调 onend（连读不中断）", ttsEnded);
check("停止朗读不报错", (() => { try { w.stopSpeak(); return true; } catch (e) { return false; } })());

// ---- APP 内视频全屏 ----
let appFs = 0;
w.AndroidApp.enterFullscreen = () => { appFs++; };
w.AndroidApp.exitFullscreen = () => { appFs--; };
const fsLesson = $(".lesson.open");
const fsBtn = fsLesson && fsLesson.querySelector('[data-act="fs"]');
if (fsBtn) fsBtn.click();
const fsWrap = fsLesson && fsLesson.querySelector(".video-wrap");
check("APP 内全屏调用原生横屏", appFs === 1);
check("全屏容器已铺满", !!fsWrap && fsWrap.classList.contains("app-fs"));
check("全屏有退出按钮", !!fsWrap && !!fsWrap.querySelector(".fs-exit"));
w.__exitFs();
check("可退出全屏", !!fsWrap && !fsWrap.classList.contains("app-fs") && appFs === 0);
delete w.AndroidApp;

// ---- 输出 ----
let fail = 0;
for (const r of results) {
  if (!r.ok) fail++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? "  (" + r.extra + ")" : ""}`);
}
if (errors.length) {
  console.log("\n运行时错误:");
  errors.slice(0, 12).forEach((e) => console.log("  " + e));
}
console.log(`\n${results.length - fail}/${results.length} 通过`);
process.exit(fail || errors.length ? 1 : 0);
