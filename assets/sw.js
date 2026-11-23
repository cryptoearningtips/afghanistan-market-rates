/* د افغانستان د بازار نرخونه — Service Worker
   Behaviour:
   - install: cache the full page + app assets, so everything seen online works offline.
   - page (navigations / HTML): NETWORK-FIRST — online visitors always get the newest
     rates first; the cached copy is only the offline fallback.
   - static assets (icons, manifest, fonts): cache-first / stale-while-revalidate.
   - price APIs (CoinGecko / Kraken / Coinbase): network-first, last good response
     cached, so offline the cards can show the last prices seen online.
   This file lives in assets/; page and asset URLs are resolved relative to it. */
var CACHE = "af-market-rates-v1";
var PAGE_URLS = ["../", "../index.html"];
var CORE = [
  "../",
  "../index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      // Add one by one so a single failure never blocks the whole install.
      return Promise.all(CORE.map(function (url) {
        return cache.add(url).catch(function () { /* keep going */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isApi(url) {
  return url.indexOf("api.coingecko.com") !== -1 ||
         url.indexOf("api.kraken.com") !== -1 ||
         url.indexOf("api.exchange.coinbase.com") !== -1;
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = req.url;

  // 1) Page / navigations: network-first, cached copy offline.
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) {
          cache.put("../index.html", copy);
          cache.put("../", res.clone());
        }).catch(function () {});
        return res;
      }).catch(function () {
        return caches.match("../index.html").then(function (hit) {
          return hit || caches.match("../");
        });
      })
    );
    return;
  }

  // 2) Price APIs: network-first, fall back to the last good response.
  if (isApi(url)) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match(req);
      })
    );
    return;
  }

  // 3) Everything else (icons, manifest, fonts, CSS): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then(function (hit) {
      var network = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === "opaque")) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); }).catch(function () {});
        }
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});
