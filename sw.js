/* 离线缓存：安装到桌面/手机后离线可用
   策略：网络优先（保证打开就是最新版），断网时回落本地缓存 */
var CACHE = "zxm-workspace-v8";
var FILES = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/store.js",
  "./js/app.js",
  "./js/mod/ddj.js",
  "./js/mod/nce.js",
  "./js/mod/news.js",
  "./js/mod/flute.js",
  "./js/mod/memo.js",
  "./js/data/daodejing.js",
  "./js/data/nce.js",
  "./js/data/news.js",
  "./js/data/flute.js",
  "./img/icon.svg",
  "./manifest.json"
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) {
      return c.add(f).catch(function () { });
    }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("message", function (e) {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      // 断网：用缓存兜底，导航请求回落到首页
      return caches.match(req).then(function (hit) {
        return hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error());
      });
    })
  );
});
