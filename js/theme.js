(function (global) {
    const Storage = global.MimiStorage;
    let deferredInstallPrompt = null;

    function resolveInitialTheme() {
        const saved = Storage && typeof Storage.getTheme === "function" ? Storage.getTheme() : null;
        if (saved === "dark" || saved === "light") return saved;
        if (global.matchMedia && global.matchMedia("(prefers-color-scheme: dark)").matches) {
            return "dark";
        }
        return "light";
    }

    function applyTheme(theme) {
        const isDark = theme === "dark";
        document.documentElement.classList.toggle("dark", isDark);

        const themeMeta = document.getElementById("theme-color-meta");
        if (themeMeta) {
            themeMeta.setAttribute("content", isDark ? "#0f172a" : "#059669");
        }

        const iconEl = document.getElementById("theme-toggle-icon");
        const labelEl = document.getElementById("theme-toggle-label");
        const btnEl = document.getElementById("theme-toggle-btn");
        if (iconEl) iconEl.textContent = isDark ? "☀️" : "🌙";
        if (labelEl) labelEl.textContent = isDark ? "Sáng" : "Tối";
        if (btnEl) {
            btnEl.setAttribute("title", isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối");
            btnEl.setAttribute("aria-pressed", String(isDark));
        }
    }

    function toggleTheme() {
        const isCurrentlyDark = document.documentElement.classList.contains("dark");
        const nextTheme = isCurrentlyDark ? "light" : "dark";
        if (Storage && typeof Storage.setTheme === "function") {
            Storage.setTheme(nextTheme);
        }
        applyTheme(nextTheme);
    }

    function setupPwaInstall() {
        const installBtn = document.getElementById("pwa-install-btn");
        global.addEventListener("beforeinstallprompt", (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            if (installBtn) {
                installBtn.classList.remove("hidden");
            }
        });

        global.addEventListener("appinstalled", () => {
            deferredInstallPrompt = null;
            if (installBtn) {
                installBtn.classList.add("hidden");
            }
        });
    }

    async function installPwa() {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        try {
            await deferredInstallPrompt.userChoice;
        } catch (err) {
            // Ignore dismissed prompt errors
        }
        deferredInstallPrompt = null;
        const installBtn = document.getElementById("pwa-install-btn");
        if (installBtn) {
            installBtn.classList.add("hidden");
        }
    }

    function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;
        // Service Worker requires http(s) or localhost (skip on file://)
        if (global.location.protocol !== "https:" && global.location.hostname !== "localhost" && global.location.hostname !== "127.0.0.1") {
            return;
        }
        global.addEventListener("load", () => {
            navigator.serviceWorker.register("./sw.js").catch((err) => {
                console.warn("Service Worker registration skipped:", err);
            });
        });
    }

    function init() {
        applyTheme(resolveInitialTheme());
        setupPwaInstall();
        registerServiceWorker();
    }

    global.MimiTheme = {
        init,
        applyTheme,
        toggleTheme,
        installPwa
    };
})(window);
