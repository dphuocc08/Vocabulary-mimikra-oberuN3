const CACHE_NAME = "mimi-jlpt-v6";

const CORE_ASSETS = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./css/styles.css",
    "./icons/icon.svg",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./js/storage.js",
    "./js/quiz-engine.js",
    "./js/state.js",
    "./js/audio.js",
    "./js/theme.js",
    "./js/global-search.js",
    "./js/home-view.js",
    "./js/quiz-controller.js",
    "./js/summary-view.js",
    "./js/mistake-bank.js",
    "./js/backup-modal.js",
    "./js/app.js",
    "./data/manifest.json"
];

async function cacheAllVocabData(cache) {
    try {
        const res = await fetch("./data/manifest.json");
        if (!res.ok) return;
        await cache.put("./data/manifest.json", res.clone());
        const levels = await res.json();
        if (!Array.isArray(levels)) return;

        const unitFiles = [];
        for (const lvl of levels) {
            if (Array.isArray(lvl.units)) {
                for (const u of lvl.units) {
                    if (u && u.file) {
                        unitFiles.push("./" + u.file.replace(/^\.?\//, ""));
                    }
                }
            }
        }

        // Cache in small batches so install stays fast and reliable on mobile
        const batchSize = 8;
        for (let i = 0; i < unitFiles.length; i += batchSize) {
            const slice = unitFiles.slice(i, i + batchSize);
            await Promise.allSettled(
                slice.map(async (url) => {
                    const r = await fetch(url);
                    if (r.ok) {
                        await cache.put(url, r);
                    }
                })
            );
        }
    } catch (err) {
        // Ignore offline/network errors during background pre-cache
    }
}

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await Promise.allSettled(
                CORE_ASSETS.map(async (url) => {
                    try {
                        const res = await fetch(url);
                        if (res.ok) {
                            await cache.put(url, res);
                        }
                    } catch (err) {
                        // Ignore individual asset failure
                    }
                })
            );
            await cacheAllVocabData(cache);
            await self.skipWaiting();
        })()
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;

    const url = new URL(req.url);
    const isSameOrigin = url.origin === self.location.origin;
    const isAllowedCdn =
        url.hostname === "cdn.tailwindcss.com" ||
        url.hostname === "fonts.googleapis.com" ||
        url.hostname === "fonts.gstatic.com";

    if (!isSameOrigin && !isAllowedCdn) return;

    // Network-First for HTML, CSS, JS, and webmanifest so updates appear immediately on reload
    const isAppShell =
        isSameOrigin &&
        (req.mode === "navigate" ||
            url.pathname.endsWith("/") ||
            url.pathname.endsWith(".html") ||
            url.pathname.endsWith(".css") ||
            url.pathname.endsWith(".js") ||
            url.pathname.endsWith(".webmanifest"));

    if (isAppShell) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                try {
                    const fresh = await fetch(req, { cache: "no-cache" });
                    if (fresh && fresh.ok) {
                        cache.put(req, fresh.clone());
                    }
                    return fresh;
                } catch (err) {
                    const cached = await cache.match(req, { ignoreSearch: true });
                    if (cached) return cached;
                    if (req.mode === "navigate") {
                        const fallback = await cache.match("./index.html");
                        if (fallback) return fallback;
                    }
                    return new Response("Offline", { status: 503, statusText: "Offline" });
                }
            })()
        );
        return;
    }

    // Stale-while-revalidate for JSON vocabulary data, icons, and CDN fonts/Tailwind
    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(req, { ignoreSearch: isSameOrigin });

            const networkPromise = fetch(req)
                .then((res) => {
                    if (res && (res.ok || res.type === "opaque")) {
                        cache.put(req, res.clone());
                    }
                    return res;
                })
                .catch(() => null);

            if (cached) {
                event.waitUntil(networkPromise);
                return cached;
            }

            const networkRes = await networkPromise;
            if (networkRes) return networkRes;

            return new Response("Offline", { status: 503, statusText: "Offline" });
        })()
    );
});
