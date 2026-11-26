(function (global) {
    const Storage = global.MimiStorage;

    const state = {
        levels: [],
        manifestLoaded: false,
        currentLevel: "n3",
        loadedUnitsById: new Map(),
        isLoadingLevel: false,
        allLevelsLoaded: false,
        isLoadingAllLevels: false,

        units: [],
        allVocab: [],
        vocabById: new Map(),

        // Application session state
        studyMode: "two_step", // 'two_step' | 'context_fill'
        quizQuestions: [],
        currentIndex: 0,
        correctCount: 0,
        wrongCount: 0,
        wrongItems: [],
        quizStep: 1, // 1: MCQ (Step 1 or Mode 2), 2: Typing Vietnamese meaning, 3: Explanation shown
        currentResult: null,
        currentSessionMeta: {
            label: "",
            batchKey: null,
            isMistakeBank: false,
            sourceItems: null
        },
        currentAudioReading: "",
        mistakeSearchQuery: ""
    };

    function escapeHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    async function loadManifest() {
        if (state.manifestLoaded && state.levels.length > 0) {
            return state.levels;
        }
        const res = await fetch("data/manifest.json");
        if (!res.ok) {
            throw new Error(`Không thể tải data/manifest.json (HTTP ${res.status})`);
        }
        const data = await res.json();
        state.levels = Array.isArray(data) ? data : [];
        state.manifestLoaded = true;
        return state.levels;
    }

    async function loadUnitJsonOnce(entry) {
        if (!entry || !entry.file) return null;
        if (state.loadedUnitsById.has(entry.id)) {
            return state.loadedUnitsById.get(entry.id);
        }
        const res = await fetch(entry.file);
        if (!res.ok) {
            throw new Error(`Không thể tải tệp dữ liệu: ${entry.file} (HTTP ${res.status})`);
        }
        const unit = await res.json();
        if (unit && unit.id) {
            state.loadedUnitsById.set(unit.id, unit);
        }
        return unit;
    }

    async function loadLevel(levelId) {
        await loadManifest();
        const targetMeta = state.levels.find((l) => l.id === levelId) || state.levels[0];
        if (!targetMeta) {
            initData();
            return;
        }

        state.isLoadingLevel = true;
        try {
            const unitEntries = Array.isArray(targetMeta.units) ? targetMeta.units : [];
            const missingEntries = unitEntries.filter((entry) => !state.loadedUnitsById.has(entry.id));

            if (missingEntries.length > 0) {
                await Promise.all(missingEntries.map((entry) => loadUnitJsonOnce(entry)));
            }

            state.currentLevel = targetMeta.id;
            if (Storage && typeof Storage.setSelectedLevel === "function") {
                Storage.setSelectedLevel(targetMeta.id);
            }
            initData();
        } finally {
            state.isLoadingLevel = false;
        }
    }

    let loadAllLevelsPromise = null;

    async function loadAllLevels() {
        if (state.allLevelsLoaded) {
            return state.allVocab;
        }
        if (loadAllLevelsPromise) {
            return loadAllLevelsPromise;
        }

        state.isLoadingAllLevels = true;
        loadAllLevelsPromise = (async () => {
            try {
                await loadManifest();
                const missingEntries = [];
                for (const lvl of state.levels) {
                    const entries = Array.isArray(lvl.units) ? lvl.units : [];
                    for (const entry of entries) {
                        if (entry && entry.id && !state.loadedUnitsById.has(entry.id)) {
                            missingEntries.push(entry);
                        }
                    }
                }

                // Load in batches of 10 to keep mobile browsers responsive
                const batchSize = 10;
                for (let i = 0; i < missingEntries.length; i += batchSize) {
                    const slice = missingEntries.slice(i, i + batchSize);
                    await Promise.all(slice.map((entry) => loadUnitJsonOnce(entry)));
                }

                state.allLevelsLoaded = true;
                initData();
                return state.allVocab;
            } finally {
                state.isLoadingAllLevels = false;
                loadAllLevelsPromise = null;
            }
        })();

        return loadAllLevelsPromise;
    }

    function initData() {
        const orderedRawUnits = [];
        const seenUnitIds = new Set();

        for (const lvl of state.levels) {
            const entries = Array.isArray(lvl.units) ? lvl.units : [];
            for (const entry of entries) {
                const unit = state.loadedUnitsById.get(entry.id);
                if (unit && !seenUnitIds.has(unit.id)) {
                    seenUnitIds.add(unit.id);
                    orderedRawUnits.push(unit);
                }
            }
        }

        state.allVocab = [];
        state.vocabById.clear();
        state.units = [];

        for (const unit of orderedRawUnits) {

            const levelId = unit.level || "n3";
            const batchesMap = new Map();
            const normalizedItems = (unit.items || []).map((item) => {
                const enriched = {
                    ...item,
                    level: levelId,
                    unitId: unit.id,
                    unitCode: unit.code,
                    unitTitle: unit.title
                };
                state.allVocab.push(enriched);
                state.vocabById.set(enriched.id, enriched);

                const partName = enriched.part || "Tổng hợp";
                if (!batchesMap.has(partName)) {
                    batchesMap.set(partName, {
                        part: partName,
                        partTitle: enriched.partTitle || "",
                        batchKey: `${unit.id}::${partName}`,
                        items: []
                    });
                }
                batchesMap.get(partName).items.push(enriched);
                return enriched;
            });

            state.units.push({
                ...unit,
                level: levelId,
                items: normalizedItems,
                batches: Array.from(batchesMap.values())
            });
        }
    }

    function getCurrentLevelMeta() {
        return state.levels.find((l) => l.id === state.currentLevel) || {
            id: state.currentLevel,
            code: state.currentLevel.toUpperCase(),
            name: `JLPT ${state.currentLevel.toUpperCase()}`,
            subtitle: "",
            accent: "emerald"
        };
    }

    function getCurrentLevelUnits() {
        return state.units.filter((u) => (u.level || "n3") === state.currentLevel);
    }

    function getCurrentLevelVocab() {
        return state.allVocab.filter((v) => (v.level || "n3") === state.currentLevel);
    }

    function showScreen(screenId) {
        const screens = ["selection-screen", "quiz-screen", "summary-screen", "mistake-bank-screen"];
        for (const id of screens) {
            const el = document.getElementById(id);
            if (el) {
                el.classList.toggle("hidden", id !== screenId);
            }
        }
        const statsBar = document.getElementById("stats-bar");
        const backupBtn = document.getElementById("open-backup-btn");
        const headerNav = document.getElementById("header-nav");
        const isQuiz = screenId === "quiz-screen";
        if (statsBar) statsBar.classList.toggle("hidden", !isQuiz);
        if (backupBtn) backupBtn.classList.toggle("hidden", isQuiz);
        if (headerNav) headerNav.classList.toggle("hidden", isQuiz);

        const homeNavBtn = document.getElementById("nav-btn-home");
        const mistakesNavBtn = document.getElementById("nav-btn-mistakes");
        const activeTabCls = "header-nav-btn px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 bg-emerald-600 text-white shadow-xs";
        const inactiveHomeCls = "header-nav-btn px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200";
        const activeMistakeCls = "header-nav-btn px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 bg-rose-600 text-white shadow-xs";
        const inactiveMistakeCls = "header-nav-btn px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center space-x-1.5 bg-white hover:bg-rose-50 text-slate-700 border border-slate-200";

        if (homeNavBtn) {
            homeNavBtn.className = screenId === "selection-screen" ? activeTabCls : inactiveHomeCls;
        }
        if (mistakesNavBtn) {
            mistakesNavBtn.className = screenId === "mistake-bank-screen" ? activeMistakeCls : inactiveMistakeCls;
        }
    }

    global.MimiAppState = {
        state,
        escapeHtml,
        initData,
        loadLevel,
        loadAllLevels,
        getCurrentLevelMeta,
        getCurrentLevelUnits,
        getCurrentLevelVocab,
        showScreen
    };
})(window);
