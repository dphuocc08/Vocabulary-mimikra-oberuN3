(function (global) {
    const Storage = global.MimiStorage;
    const Engine = global.MimiQuizEngine;
    const { state, escapeHtml, showScreen } = global.MimiAppState;

    function openMistakeBank() {
        state.mistakeSearchQuery = "";
        const searchInput = document.getElementById("mistake-search-input");
        if (searchInput) searchInput.value = "";
        showScreen("mistake-bank-screen");
        renderMistakeBankList();
    }

    function renderMistakeBankList() {
        const levelVocabIds = new Set(global.MimiAppState.getCurrentLevelVocab().map((v) => v.id));
        const meta = global.MimiAppState.getCurrentLevelMeta();
        const wrongIds = Storage.getWrongIds().filter((id) => levelVocabIds.has(id));
        const items = wrongIds.map((id) => state.vocabById.get(id)).filter(Boolean);

        const countBadge = document.getElementById("mistake-page-count");
        const startAllBtn = document.getElementById("mistake-page-start-btn");
        const clearAllBtn = document.getElementById("mistake-page-clear-btn");
        const listEl = document.getElementById("mistake-bank-list");
        const emptyEl = document.getElementById("mistake-bank-empty");

        countBadge.textContent = `${items.length} từ (${meta.code})`;
        const headerMistakeCount = document.getElementById("header-mistake-count");
        if (headerMistakeCount) {
            headerMistakeCount.textContent = String(items.length);
            headerMistakeCount.classList.toggle("hidden", items.length === 0);
        }
        startAllBtn.disabled = items.length === 0;
        clearAllBtn.disabled = items.length === 0;

        if (items.length === 0) {
            listEl.innerHTML = "";
            emptyEl.classList.remove("hidden");
            return;
        }

        emptyEl.classList.add("hidden");
        const qNorm = Engine.normalizeVi(state.mistakeSearchQuery);
        const filtered = qNorm
            ? items.filter((item) =>
                item.word.toLowerCase().includes(state.mistakeSearchQuery.toLowerCase()) ||
                item.reading.includes(state.mistakeSearchQuery) ||
                Engine.normalizeVi(item.meaning).includes(qNorm)
            )
            : items;

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-sm text-slate-500">Không tìm thấy từ nào khớp với "${escapeHtml(state.mistakeSearchQuery)}".</div>`;
            return;
        }

        listEl.innerHTML = filtered.map((item) => `
            <div class="p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">#${String(item.id).padStart(3, "0")}</span>
                        <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">${escapeHtml(item.unitCode)}</span>
                        <span class="jp-text text-lg font-bold text-slate-900">${escapeHtml(item.word)}</span>
                        <span class="jp-text text-sm font-semibold text-emerald-700">【${escapeHtml(item.reading)}】</span>
                    </div>
                    <div class="text-sm text-slate-700 font-medium">${escapeHtml(item.meaning)}</div>
                    <div class="text-xs text-slate-500 jp-text">${escapeHtml(Engine.fillBlank(item.sentence, item.word))}</div>
                </div>
                <div class="flex items-center space-x-2 shrink-0">
                    <button onclick="MimiApp.speakSpecific('${escapeHtml(Engine.getPrimaryReading(item.reading))}')"
                        title="Nghe phát âm"
                        class="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition">
                        🔊 Nghe
                    </button>
                    <button onclick="MimiApp.removeFromMistakeBank(${item.id})"
                        class="px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition">
                        ✓ Đã thuộc
                    </button>
                </div>
            </div>
        `).join("");
    }

    function removeFromMistakeBank(id) {
        Storage.removeWrongId(id);
        renderMistakeBankList();
    }

    function clearAllMistakeBank() {
        const levelVocabIds = new Set(global.MimiAppState.getCurrentLevelVocab().map((v) => v.id));
        const meta = global.MimiAppState.getCurrentLevelMeta();
        const levelWrongIds = Storage.getWrongIds().filter((id) => levelVocabIds.has(id));
        if (levelWrongIds.length === 0) return;
        if (!global.confirm(`Bạn có chắc muốn xóa toàn bộ ${levelWrongIds.length} từ ${meta.code} khỏi Sổ tay từ sai không?`)) return;
        for (const id of levelWrongIds) {
            Storage.removeWrongId(id);
        }
        renderMistakeBankList();
    }

    function setupMistakeSearchListener() {
        const searchInput = document.getElementById("mistake-search-input");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                state.mistakeSearchQuery = e.target.value || "";
                renderMistakeBankList();
            });
        }
    }

    global.MimiMistakeBank = {
        openMistakeBank,
        renderMistakeBankList,
        removeFromMistakeBank,
        clearAllMistakeBank,
        setupMistakeSearchListener
    };
})(window);
