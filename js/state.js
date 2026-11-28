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
        studyMode: "two_step", // 'two_step' | 'context_fill' | 'listen_meaning'
        quizQuestions: [],
        currentIndex: 0,
        correctCount: 0,
        wrongCount: 0,
        wrongItems: [],
        answerHistory: [],
        reviewFilter: "all", // 'all' | 'wrong'
        quizStep: 1, // 1: MCQ (Step 1, Mode 2, or Mode 3), 2: Typing Vietnamese meaning, 3: Explanation shown
        currentResult: null,
        currentSessionMeta: {
            label: "",
            batchKey: null,
            levelId: null,
            unitId: null,
            unitCode: null,
            part: null,
            partTitle: "",
            isBatchSession: false,
            isMistakeBank: false,
            studyMode: "two_step",
            sourceItems: null
        },
        previewBatch: null,
        nextBatchAfterSummary: null,
        n3SubjectTab: "vocab", // 'vocab' | 'grammar'
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

    function escapeJsAttr(str) {
        return escapeHtml(
            String(str || "")
                .replace(/\\/g, "\\\\")
                .replace(/'/g, "\\'")
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n")
        );
    }

    function formatShortPart(part) {
        const raw = String(part || "").trim();
        if (!raw) return "";
        const match = raw.match(/^(Chặng\s*\d+)/i);
        return match ? match[1] : raw;
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

    function getLevelMetaById(levelId) {
        return state.levels.find((l) => l.id === levelId) || null;
    }

    function getCurrentLevelMeta() {
        return getLevelMetaById(state.currentLevel) || {
            id: state.currentLevel,
            code: state.currentLevel.toUpperCase(),
            name: `JLPT ${state.currentLevel.toUpperCase()}`,
            subtitle: "",
            accent: "emerald"
        };
    }

    function isValidManifestUnit(levelId, unitId) {
        const meta = getLevelMetaById(levelId);
        if (!meta || !Array.isArray(meta.units)) return false;
        return meta.units.some((u) => u && u.id === unitId);
    }

    function getLevelUnits(levelId) {
        const targetLevel = levelId || state.currentLevel;
        return state.units.filter((u) => (u.level || "n3") === targetLevel);
    }

    function getCurrentLevelUnits() {
        return getLevelUnits(state.currentLevel);
    }

    function getCurrentLevelVocab() {
        return state.allVocab.filter((v) => (v.level || "n3") === state.currentLevel);
    }

    function findUnitAndBatch(unitId, partName) {
        const unit = state.units.find((u) => u.id === unitId);
        if (!unit) return null;
        const batch = (unit.batches || []).find((b) => b.part === partName);
        if (!batch || !Array.isArray(batch.items) || batch.items.length === 0) return null;
        const levelId = unit.level || state.currentLevel;
        const levelMeta = getLevelMetaById(levelId) || {
            id: levelId,
            code: levelId.toUpperCase(),
            name: `JLPT ${levelId.toUpperCase()}`,
            accent: "emerald"
        };
        return { levelMeta, unit, batch };
    }

    function getOrderedBatchesForLevel(levelId) {
        const targetLevel = levelId || state.currentLevel;
        const levelMeta = getLevelMetaById(targetLevel) || {
            id: targetLevel,
            code: targetLevel.toUpperCase(),
            name: `JLPT ${targetLevel.toUpperCase()}`,
            accent: "emerald"
        };
        const list = [];
        const units = getLevelUnits(targetLevel);
        for (const unit of units) {
            for (const batch of unit.batches || []) {
                if (batch && Array.isArray(batch.items) && batch.items.length > 0) {
                    list.push({ levelMeta, unit, batch });
                }
            }
        }
        return list;
    }

    function getNextBatchInLevel(unitId, partName, levelId) {
        const found = findUnitAndBatch(unitId, partName);
        const targetLevel = levelId || (found ? found.levelMeta.id : state.currentLevel);
        const ordered = getOrderedBatchesForLevel(targetLevel);
        const idx = ordered.findIndex((entry) => entry.unit.id === unitId && entry.batch.part === partName);
        if (idx < 0 || idx + 1 >= ordered.length) return null;
        return ordered[idx + 1];
    }

    function getFirstBatchInLevel(levelId) {
        const ordered = getOrderedBatchesForLevel(levelId || state.currentLevel);
        return ordered.length > 0 ? ordered[0] : null;
    }

    function showScreen(screenId) {
        const screens = ["selection-screen", "batch-preview-screen", "quiz-screen", "summary-screen", "session-review-screen", "mistake-bank-screen"];
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
        if (homeNavBtn) {
            homeNavBtn.classList.toggle("is-active", screenId === "selection-screen");
        }
        if (mistakesNavBtn) {
            mistakesNavBtn.classList.toggle("is-active", screenId === "mistake-bank-screen");
        }
    }

    global.MimiAppState = {
        state,
        escapeHtml,
        escapeJsAttr,
        formatShortPart,
        initData,
        loadLevel,
        loadAllLevels,
        getLevelMetaById,
        getCurrentLevelMeta,
        isValidManifestUnit,
        getLevelUnits,
        getCurrentLevelUnits,
        getCurrentLevelVocab,
        findUnitAndBatch,
        getOrderedBatchesForLevel,
        getNextBatchInLevel,
        getFirstBatchInLevel,
        showScreen
    };
})(window);
