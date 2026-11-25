(function (global) {
    const Storage = global.MimiStorage;
    const { state, escapeHtml, showScreen } = global.MimiAppState;

    function setStudyMode(mode) {
        state.studyMode = Storage.setStudyMode(mode);
        renderModeSwitcher();
    }

    function renderHome() {
        showScreen("selection-screen");
        renderModeSwitcher();
        renderMistakeBanner();
        renderUnitsList();
        renderGlobalStats();
    }

    function renderModeSwitcher() {
        const twoStepBtn = document.getElementById("mode-btn-two_step");
        const contextBtn = document.getElementById("mode-btn-context_fill");
        if (!twoStepBtn || !contextBtn) return;

        const activeClasses = "border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-sm";
        const inactiveClasses = "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50";

        twoStepBtn.className = `p-4 rounded-xl border-2 text-left transition ${state.studyMode === "two_step" ? activeClasses : inactiveClasses}`;
        contextBtn.className = `p-4 rounded-xl border-2 text-left transition ${state.studyMode === "context_fill" ? activeClasses : inactiveClasses}`;

        const badge1 = document.getElementById("mode-badge-two_step");
        const badge2 = document.getElementById("mode-badge-context_fill");
        if (badge1) badge1.classList.toggle("hidden", state.studyMode !== "two_step");
        if (badge2) badge2.classList.toggle("hidden", state.studyMode !== "context_fill");
    }

    function renderMistakeBanner() {
        const wrongIds = Storage.getWrongIds().filter((id) => state.vocabById.has(id));
        const count = wrongIds.length;

        const countEl = document.getElementById("mistake-banner-count");
        const descEl = document.getElementById("mistake-banner-desc");
        const startBtn = document.getElementById("mistake-banner-start-btn");
        const viewBtn = document.getElementById("mistake-banner-view-btn");
        const cardEl = document.getElementById("mistake-banner-card");

        if (!cardEl) return;

        if (count > 0) {
            cardEl.className = "rounded-2xl p-5 sm:p-6 border-2 border-rose-200 bg-gradient-to-r from-rose-50 via-white to-amber-50/40 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4";
            countEl.textContent = `${count} từ cần ôn`;
            countEl.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-rose-600 text-white";
            descEl.textContent = "Tự động lưu các từ làm sai. Làm đúng lại trong Sổ tay để tự động xóa nợ!";
            startBtn.disabled = false;
            startBtn.className = "px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-sm shadow-sm transition flex items-center justify-center space-x-1.5";
            viewBtn.className = "px-4 py-2.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-semibold rounded-xl text-sm transition";
        } else {
            cardEl.className = "rounded-2xl p-5 sm:p-6 border border-emerald-200 bg-emerald-50/50 shadow-xs mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4";
            countEl.textContent = "0 từ sai";
            countEl.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white";
            descEl.textContent = "Tuyệt vời! Bạn chưa có từ nào bị sai hoặc đã xóa nợ hết toàn bộ.";
            startBtn.disabled = true;
            startBtn.className = "px-4 py-2.5 bg-slate-200 text-slate-400 font-semibold rounded-xl text-sm cursor-not-allowed flex items-center justify-center space-x-1.5";
            viewBtn.className = "px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold rounded-xl text-sm transition";
        }
    }

    function renderGlobalStats() {
        const masteredSet = new Set(Storage.getMasteredIds());
        const masteredCount = state.allVocab.filter((v) => masteredSet.has(v.id)).length;
        const totalEl = document.getElementById("global-vocab-stats");
        if (totalEl) {
            totalEl.textContent = `Tổng kho từ: ${state.allVocab.length} từ • Đã nắm: ${masteredCount}/${state.allVocab.length}`;
        }
    }

    function renderUnitsList() {
        const container = document.getElementById("units-container");
        if (!container) return;

        const masteredSet = new Set(Storage.getMasteredIds());
        const completedBatches = Storage.getCompletedBatches();

        container.innerHTML = state.units.map((unit) => {
            const totalItems = unit.items.length;
            const masteredInUnit = unit.items.filter((i) => masteredSet.has(i.id)).length;
            const masteryPct = totalItems > 0 ? Math.round((masteredInUnit / totalItems) * 100) : 0;

            const batchesHtml = unit.batches.map((batch) => {
                const record = completedBatches[batch.batchKey];
                const badgeHtml = record
                    ? `<span class="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">✓ ${record.bestPct}%</span>`
                    : `<span class="text-xs text-slate-400 group-hover:text-emerald-600 font-medium">${batch.items.length} từ →</span>`;

                return `
                    <button onclick="MimiApp.startBatchQuiz('${escapeHtml(unit.id)}', '${escapeHtml(batch.part)}')"
                        class="group p-4 bg-slate-50 hover:bg-emerald-50 border ${record ? "border-emerald-300/80" : "border-slate-200"} hover:border-emerald-400 rounded-xl text-left transition flex flex-col justify-between">
                        <div class="flex items-center justify-between gap-2 mb-1.5">
                            <span class="text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded">${escapeHtml(batch.part)}</span>
                            ${badgeHtml}
                        </div>
                        <div class="font-semibold text-slate-800 text-sm group-hover:text-emerald-950">
                            ${escapeHtml(batch.partTitle || "Nhóm từ vựng")}
                        </div>
                        <div class="text-xs text-slate-500 mt-1">${batch.items.length} từ vựng</div>
                    </button>
                `;
            }).join("");

            return `
                <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                            <div class="flex items-center space-x-2 mb-1">
                                <span class="bg-emerald-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-md">${escapeHtml(unit.code)}</span>
                                <span class="text-xs font-mono text-slate-500">Từ ${escapeHtml(unit.range)} (${totalItems} từ)</span>
                            </div>
                            <h3 class="text-lg sm:text-xl font-bold text-slate-900 jp-text">${escapeHtml(unit.title)}</h3>
                        </div>
                        <div class="flex flex-col sm:items-end gap-1.5">
                            <div class="text-xs font-semibold text-slate-600">
                                Tiến độ nắm vững: <span class="text-emerald-700 font-bold">${masteredInUnit}/${totalItems} (${masteryPct}%)</span>
                            </div>
                            <div class="w-full sm:w-44 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div class="bg-emerald-500 h-full transition-all duration-300" style="width: ${masteryPct}%"></div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        ${batchesHtml}
                    </div>

                    <div class="pt-3 border-t border-slate-100 flex justify-end">
                        <button onclick="MimiApp.startUnitAllQuiz('${escapeHtml(unit.id)}')"
                            class="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center space-x-2">
                            <span>Ôn toàn bộ ${escapeHtml(unit.code)} (${totalItems} từ)</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    }

    global.MimiHomeView = {
        setStudyMode,
        renderHome,
        renderModeSwitcher,
        renderMistakeBanner,
        renderGlobalStats,
        renderUnitsList
    };
})(window);
