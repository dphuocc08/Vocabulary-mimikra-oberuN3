(function (global) {
    const Engine = global.MimiQuizEngine;
    const AppState = global.MimiAppState;
    const { state, escapeHtml } = AppState;

    const MAX_RESULTS = 40;
    let searchQuery = "";
    let filterLevel = "all"; // 'all' | 'n5' | 'n4' | 'n3'
    let debounceTimer = null;

    const LEVEL_BADGE_MAP = {
        n5: "bg-sky-100 text-sky-800 border-sky-200",
        n4: "bg-indigo-100 text-indigo-800 border-indigo-200",
        n3: "bg-emerald-100 text-emerald-800 border-emerald-200"
    };

    function getElements() {
        return {
            input: document.getElementById("global-search-input"),
            clearBtn: document.getElementById("global-search-clear"),
            panel: document.getElementById("global-search-panel"),
            status: document.getElementById("global-search-status"),
            filters: document.getElementById("global-search-filters"),
            results: document.getElementById("global-search-results")
        };
    }

    function renderFilterPills() {
        const { filters } = getElements();
        if (!filters) return;
        const options = [
            { id: "all", label: "Tất cả" },
            { id: "n5", label: "N5" },
            { id: "n4", label: "N4" },
            { id: "n3", label: "N3" }
        ];
        filters.innerHTML = options.map((opt) => {
            const active = filterLevel === opt.id;
            const cls = active
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200";
            return `<button type="button" onclick="MimiApp.setGlobalSearchLevel('${opt.id}')" class="px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${cls}">${opt.label}</button>`;
        }).join("");
    }

    function renderResults() {
        const { clearBtn, panel, status, results } = getElements();
        if (!panel || !results || !status) return;

        const trimmed = searchQuery.trim();
        if (clearBtn) {
            clearBtn.classList.toggle("hidden", trimmed.length === 0);
        }

        if (!trimmed) {
            panel.classList.add("hidden");
            results.innerHTML = "";
            return;
        }

        panel.classList.remove("hidden");
        renderFilterPills();

        if (!state.allLevelsLoaded && state.isLoadingAllLevels) {
            status.textContent = "⏳ Đang nạp toàn bộ kho từ vựng N5 – N4 – N3...";
        }

        const qLower = trimmed.toLowerCase();
        const qNormVi = Engine.normalizeVi(trimmed);

        const pool = filterLevel === "all"
            ? state.allVocab
            : state.allVocab.filter((item) => (item.level || "n3") === filterLevel);

        const exactMatches = [];
        const partialMatches = [];

        for (const item of pool) {
            const wordLower = (item.word || "").toLowerCase();
            const readingLower = (item.reading || "").toLowerCase();
            const meaningNorm = Engine.normalizeVi(item.meaning || "");
            const sentence = item.sentence || "";

            const isExact =
                wordLower === qLower ||
                readingLower === qLower ||
                (qNormVi && meaningNorm === qNormVi);

            if (isExact) {
                exactMatches.push(item);
                continue;
            }

            const isMatch =
                wordLower.includes(qLower) ||
                readingLower.includes(qLower) ||
                (qNormVi && meaningNorm.includes(qNormVi)) ||
                sentence.includes(trimmed);

            if (isMatch) {
                partialMatches.push(item);
            }
        }

        const matched = exactMatches.concat(partialMatches);
        const total = matched.length;
        const shown = matched.slice(0, MAX_RESULTS);

        const scopeLabel = filterLevel === "all"
            ? (state.allLevelsLoaded ? "N5 – N4 – N3" : "đang tải thêm cấp độ...")
            : filterLevel.toUpperCase();

        status.textContent = total > MAX_RESULTS
            ? `Hiển thị ${MAX_RESULTS}/${total} kết quả (${scopeLabel})`
            : `Tìm thấy ${total} kết quả (${scopeLabel})`;

        if (total === 0) {
            results.innerHTML = `
                <div class="text-center py-6 text-sm text-slate-500">
                    Không tìm thấy từ nào khớp với "<strong>${escapeHtml(trimmed)}</strong>".
                </div>
            `;
            return;
        }

        results.innerHTML = shown.map((item) => {
            const lvl = (item.level || "n3").toLowerCase();
            const lvlClass = LEVEL_BADGE_MAP[lvl] || LEVEL_BADGE_MAP.n3;
            const primaryReading = Engine.getPrimaryReading(item.reading);
            const filledSentence = Engine.fillBlank(item.sentence, item.word);

            return `
                <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div class="space-y-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-[11px] font-bold px-2 py-0.5 rounded border ${lvlClass}">${lvl.toUpperCase()}</span>
                            <span class="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">${escapeHtml(item.unitCode || "")}</span>
                            <span class="jp-text text-base sm:text-lg font-bold text-slate-900">${escapeHtml(item.word)}</span>
                            <span class="jp-text text-sm font-semibold text-emerald-700">【${escapeHtml(item.reading)}】</span>
                            ${item.pos ? `<span class="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">${escapeHtml(item.pos)}</span>` : ""}
                        </div>
                        <div class="text-sm text-slate-800 font-medium">${escapeHtml(item.meaning)}</div>
                        ${filledSentence ? `<div class="text-xs text-slate-500 jp-text leading-relaxed">${escapeHtml(filledSentence)}</div>` : ""}
                    </div>
                    <div class="flex items-center shrink-0">
                        <button type="button" onclick="MimiApp.speakSpecific('${escapeHtml(primaryReading)}')"
                            title="Nghe phát âm"
                            class="px-3 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition">
                            🔊 Nghe
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    }

    async function ensureAllLevelsLoaded() {
        if (state.allLevelsLoaded) return;
        try {
            await AppState.loadAllLevels();
            if (searchQuery.trim()) {
                renderResults();
            }
        } catch (err) {
            console.warn("Could not preload all levels for search:", err);
        }
    }

    function setGlobalSearchLevel(level) {
        filterLevel = level || "all";
        renderResults();
    }

    function clearGlobalSearch() {
        searchQuery = "";
        const { input } = getElements();
        if (input) {
            input.value = "";
            input.focus();
        }
        renderResults();
    }

    function setupGlobalSearchListener() {
        const { input } = getElements();
        if (!input) return;

        input.addEventListener("focus", () => {
            ensureAllLevelsLoaded();
        });

        input.addEventListener("input", (e) => {
            searchQuery = e.target.value || "";
            ensureAllLevelsLoaded();
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                renderResults();
            }, 120);
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && searchQuery) {
                clearGlobalSearch();
            }
        });
    }

    global.MimiGlobalSearch = {
        setupGlobalSearchListener,
        setGlobalSearchLevel,
        clearGlobalSearch,
        renderResults
    };
})(window);
