(function (global) {
    const state = {
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

    function initData() {
        const rawUnits = Array.isArray(global.MIMI_UNITS) ? global.MIMI_UNITS : [];
        state.allVocab = [];
        state.vocabById.clear();

        state.units = rawUnits.map((unit) => {
            const batchesMap = new Map();
            const normalizedItems = (unit.items || []).map((item) => {
                const enriched = {
                    ...item,
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

            return {
                ...unit,
                items: normalizedItems,
                batches: Array.from(batchesMap.values())
            };
        });
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
        showScreen
    };
})(window);
