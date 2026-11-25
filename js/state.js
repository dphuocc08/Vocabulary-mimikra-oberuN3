(function (global) {
    const Storage = global.MimiStorage;

    const state = {
        levels: [],
        currentLevel: "n3",
        loadedFiles: new Set(),
        isLoadingLevel: false,

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

    function initManifest() {
        state.levels = Array.isArray(global.MIMI_LEVELS) ? global.MIMI_LEVELS : [];
    }

    function loadScriptOnce(src) {
        if (!src || state.loadedFiles.has(src)) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-mimi-src="${src}"]`);
            if (existing) {
                state.loadedFiles.add(src);
                resolve();
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.async = false;
            script.dataset.mimiSrc = src;
            script.onload = () => {
                state.loadedFiles.add(src);
                resolve();
            };
            script.onerror = () => {
                reject(new Error(`Không thể tải tệp dữ liệu: ${src}`));
            };
            document.body.appendChild(script);
        });
    }

    async function loadLevel(levelId) {
        initManifest();
        const targetMeta = state.levels.find((l) => l.id === levelId) || state.levels[0];
        if (!targetMeta) {
            initData();
            return;
        }

        state.isLoadingLevel = true;
        try {
            const unitEntries = Array.isArray(targetMeta.units) ? targetMeta.units : [];
            const alreadyLoadedIds = new Set(
                (Array.isArray(global.MIMI_UNITS) ? global.MIMI_UNITS : []).map((u) => u.id)
            );

            for (const entry of unitEntries) {
                if (!alreadyLoadedIds.has(entry.id)) {
                    await loadScriptOnce(entry.file);
                }
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

    function initData() {
        initManifest();
        const rawUnits = Array.isArray(global.MIMI_UNITS) ? global.MIMI_UNITS : [];
        const seenUnitIds = new Set();
        state.allVocab = [];
        state.vocabById.clear();

        state.units = [];
        for (const unit of rawUnits) {
            if (!unit || !unit.id || seenUnitIds.has(unit.id)) continue;
            seenUnitIds.add(unit.id);

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
        const isQuiz = screenId === "quiz-screen";
        if (statsBar) statsBar.classList.toggle("hidden", !isQuiz);
        if (backupBtn) backupBtn.classList.toggle("hidden", isQuiz);
    }

    global.MimiAppState = {
        state,
        escapeHtml,
        initData,
        loadLevel,
        getCurrentLevelMeta,
        getCurrentLevelUnits,
        getCurrentLevelVocab,
        showScreen
    };
})(window);
