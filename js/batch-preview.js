(function (global) {
    const Engine = global.MimiQuizEngine;
    const AppState = global.MimiAppState;
    const { state, escapeHtml, escapeJsAttr, showScreen } = AppState;

    function openBatchPreview(unitId, partName) {
        const found = AppState.findUnitAndBatch(unitId, partName);
        if (!found) return;

        const { levelMeta, unit, batch } = found;
        state.previewBatch = {
            levelId: levelMeta.id,
            unitId: unit.id,
            part: batch.part
        };

        showScreen("batch-preview-screen");

        const levelBadgeEl = document.getElementById("preview-level-badge");
        const unitCodeEl = document.getElementById("preview-unit-code");
        const partBadgeEl = document.getElementById("preview-part-badge");
        const titleEl = document.getElementById("preview-title");
        const subtitleEl = document.getElementById("preview-subtitle");
        const countEl = document.getElementById("preview-word-count");
        const modeEl = document.getElementById("preview-study-mode");
        const listEl = document.getElementById("preview-word-list");

        if (levelBadgeEl) levelBadgeEl.textContent = levelMeta.code;
        if (unitCodeEl) unitCodeEl.textContent = unit.code;
        if (partBadgeEl) partBadgeEl.textContent = batch.part;
        if (titleEl) titleEl.textContent = batch.partTitle || unit.title || batch.part;
        if (subtitleEl) subtitleEl.textContent = `${unit.code}: ${unit.title}`;
        if (countEl) countEl.textContent = `${batch.items.length} từ`;
        if (modeEl) {
            if (state.studyMode === "context_fill") {
                modeEl.textContent = "Chế độ đang chọn: Điền từ ngữ cảnh";
            } else if (state.studyMode === "listen_meaning") {
                modeEl.textContent = "Chế độ đang chọn: Nghe và chọn nghĩa";
            } else {
                modeEl.textContent = "Chế độ đang chọn: 2 Bước (Kanji → Nghĩa)";
            }
        }

        if (listEl) {
            listEl.innerHTML = batch.items.map((item, idx) => {
                const readingText = item.reading || "";
                const speakText = Engine.getPrimaryReading(readingText) || item.word || "";
                const speakAttr = escapeJsAttr(speakText);

                const wordHighlight = `<span class="font-bold text-emerald-700">${escapeHtml(item.word)}</span>`;
                const exampleJp = item.sentence
                    ? Engine.fillBlank(escapeHtml(item.sentence), wordHighlight)
                    : "";
                const exampleVi = item.sentenceVi ? escapeHtml(item.sentenceVi) : "";
                const noteText = item.note ? escapeHtml(item.note) : "";

                const exampleBlock = (exampleJp || exampleVi) ? `
                    <div class="mt-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                        ${exampleJp ? `<p class="jp-text text-sm text-slate-800 leading-relaxed">${exampleJp}</p>` : ""}
                        ${exampleVi ? `<p class="text-xs text-slate-500 leading-relaxed">→ ${exampleVi}</p>` : ""}
                    </div>
                ` : "";

                const noteBlock = noteText ? `
                    <div class="mt-2 text-xs text-amber-800 bg-amber-50/70 border border-amber-200/70 rounded-lg px-2.5 py-1.5">
                        <span class="font-semibold">Ghi chú:</span> ${noteText}
                    </div>
                ` : "";

                return `
                    <article class="preview-word-card p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0 space-y-1">
                                <div class="flex flex-wrap items-center gap-1.5">
                                    <span class="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">${idx + 1}</span>
                                    ${item.pos ? `<span class="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">${escapeHtml(item.pos)}</span>` : ""}
                                </div>
                                <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5">
                                    <span class="jp-text text-xl sm:text-2xl font-bold text-slate-900">${escapeHtml(item.word)}</span>
                                    ${readingText ? `<span class="jp-text text-sm sm:text-base font-semibold text-emerald-700">【${escapeHtml(readingText)}】</span>` : ""}
                                </div>
                            </div>
                            <button type="button" onclick="MimiApp.speakSpecific('${speakAttr}')"
                                title="Nghe phát âm"
                                aria-label="Nghe phát âm ${escapeHtml(item.word)}"
                                class="px-3 py-2 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 text-slate-700 text-xs sm:text-sm font-semibold transition shrink-0 flex items-center gap-1">
                                <span>🔊</span>
                                <span>Nghe</span>
                            </button>
                        </div>

                        <div class="mt-2 text-sm sm:text-base font-semibold text-slate-800">
                            ${escapeHtml(item.meaning)}
                        </div>

                        ${exampleBlock}
                        ${noteBlock}
                    </article>
                `;
            }).join("");
        }

        if (typeof global.scrollTo === "function") {
            global.scrollTo({ top: 0, behavior: "auto" });
        }
    }

    function startQuizFromPreview() {
        if (!state.previewBatch) {
            closeBatchPreview();
            return;
        }
        const { unitId, part } = state.previewBatch;
        global.MimiQuizController.startBatchQuiz(unitId, part);
    }

    function closeBatchPreview() {
        state.previewBatch = null;
        global.MimiHomeView.renderHome();
    }

    global.MimiBatchPreview = {
        openBatchPreview,
        startQuizFromPreview,
        closeBatchPreview
    };
})(window);
