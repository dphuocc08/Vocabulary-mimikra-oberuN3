(function (global) {
    const Storage = global.MimiStorage;
    const Engine = global.MimiQuizEngine;
    const AppState = global.MimiAppState;
    const { state, escapeHtml, escapeJsAttr, formatShortPart, showScreen } = AppState;

    function showSummary() {
        const meta = state.currentSessionMeta || {};

        if (meta.batchKey) {
            Storage.recordBatchCompletion(
                meta.batchKey,
                state.correctCount,
                state.quizQuestions.length
            );
        }

        state.nextBatchAfterSummary = null;
        if (meta.isBatchSession && meta.unitId && meta.part) {
            Storage.clearActiveSession();
            Storage.setLastCompletedBatch({
                levelId: meta.levelId || state.currentLevel,
                unitId: meta.unitId,
                unitCode: meta.unitCode || meta.unitId,
                part: meta.part,
                batchKey: meta.batchKey || `${meta.unitId}::${meta.part}`,
                completedAt: new Date().toISOString()
            });
            state.nextBatchAfterSummary = AppState.getNextBatchInLevel(
                meta.unitId,
                meta.part,
                meta.levelId || state.currentLevel
            );
        }

        showScreen("summary-screen");

        document.getElementById("summary-unit-name").textContent = meta.label || "";
        document.getElementById("sum-total").textContent = state.quizQuestions.length;
        document.getElementById("sum-correct").textContent = state.correctCount;
        document.getElementById("sum-wrong").textContent = state.wrongCount;

        const pct = state.quizQuestions.length > 0
            ? Math.round((state.correctCount / state.quizQuestions.length) * 100)
            : 0;
        document.getElementById("sum-accuracy").textContent = `Độ chính xác: ${pct}%`;

        renderNextBatchSection(meta);

        const reviewBtn = document.getElementById("open-session-review-btn");
        const historyCount = Array.isArray(state.answerHistory) ? state.answerHistory.length : 0;
        if (reviewBtn) {
            reviewBtn.classList.toggle("hidden", historyCount === 0);
            reviewBtn.textContent = `📋 Xem lại đáp án (${historyCount} câu)`;
        }

        const wrongSection = document.getElementById("wrong-review-section");
        const wrongList = document.getElementById("wrong-list");
        const retryWrongBtn = document.getElementById("retry-wrong-btn");

        if (state.wrongItems.length > 0) {
            wrongSection.classList.remove("hidden");
            retryWrongBtn.classList.remove("hidden");
            wrongList.innerHTML = state.wrongItems.map((item) => `
                <div class="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                        <span class="jp-text font-bold text-slate-900 text-base">${escapeHtml(item.word)}</span>
                        <span class="jp-text text-emerald-700 text-sm ml-1.5">(${escapeHtml(item.reading)})</span>
                        <span class="text-xs text-slate-500 ml-1">• ${escapeHtml(item.pos)}</span>
                    </div>
                    <div class="text-sm font-medium text-rose-800">${escapeHtml(item.meaning)}</div>
                </div>
            `).join("");
        } else {
            wrongSection.classList.add("hidden");
            retryWrongBtn.classList.add("hidden");
        }
    }

    function renderNextBatchSection(meta) {
        const container = document.getElementById("summary-next-batch");
        if (!container) return;

        if (!meta || !meta.isBatchSession) {
            container.classList.add("hidden");
            container.innerHTML = "";
            return;
        }

        const next = state.nextBatchAfterSummary;
        if (next) {
            const shortPart = formatShortPart(next.batch.part);
            const subtitle = next.batch.partTitle
                ? `${next.batch.part} — ${next.batch.partTitle} (${next.batch.items.length} từ)`
                : `${next.batch.part} (${next.batch.items.length} từ)`;

            container.classList.remove("hidden");
            container.innerHTML = `
                <div class="p-4 sm:p-5 rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                    <div class="min-w-0 space-y-1">
                        <div class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                            <span>🚀 Chặng tiếp theo</span>
                        </div>
                        <div class="font-bold text-slate-900 text-base truncate">
                            ${escapeHtml(next.levelMeta.code)} · ${escapeHtml(next.unit.code)} · ${escapeHtml(shortPart)}
                        </div>
                        <div class="text-xs text-slate-600 line-clamp-2">${escapeHtml(subtitle)}</div>
                    </div>
                    <div class="flex flex-col xs:flex-row sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                        <button type="button" onclick="MimiApp.previewNextBatchFromSummary()"
                            class="px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold rounded-xl text-sm transition text-center">
                            Xem từ
                        </button>
                        <button id="summary-next-batch-btn" type="button" onclick="MimiApp.startNextBatchFromSummary()"
                            class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-xs transition flex items-center justify-center gap-1.5">
                            <span>Làm chặng tiếp theo</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                        </button>
                    </div>
                </div>
            `;
        } else {
            const levelCode = meta.levelCode || (meta.levelId ? meta.levelId.toUpperCase() : state.currentLevel.toUpperCase());
            container.classList.remove("hidden");
            container.innerHTML = `
                <div class="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 text-center text-sm font-semibold text-emerald-800">
                    🏆 Bạn đã hoàn thành chặng cuối cùng của JLPT ${escapeHtml(levelCode)}!
                </div>
            `;
        }
    }

    function startNextBatchFromSummary() {
        const next = state.nextBatchAfterSummary;
        if (!next) {
            backToMenu();
            return;
        }
        global.MimiQuizController.startBatchQuiz(next.unit.id, next.batch.part);
    }

    function previewNextBatchFromSummary() {
        const next = state.nextBatchAfterSummary;
        if (!next || !global.MimiBatchPreview) {
            backToMenu();
            return;
        }
        global.MimiBatchPreview.openBatchPreview(next.unit.id, next.batch.part);
    }

    function retryWrong() {
        if (state.wrongItems.length === 0) return;
        const retrySet = [...state.wrongItems];
        global.MimiQuizController.launchQuiz(retrySet, {
            label: `Ôn lại câu sai (${retrySet.length} từ)`,
            batchKey: null,
            levelId: state.currentLevel,
            unitId: null,
            unitCode: null,
            part: null,
            partTitle: "",
            isBatchSession: false,
            isMistakeBank: state.currentSessionMeta.isMistakeBank,
            studyMode: state.studyMode,
            sourceItems: retrySet
        });
    }

    function restartCurrentSession() {
        if (state.currentSessionMeta.isMistakeBank) {
            global.MimiQuizController.startMistakeBankQuiz();
            return;
        }
        if (state.currentSessionMeta.isBatchSession && state.currentSessionMeta.unitId && state.currentSessionMeta.part) {
            global.MimiQuizController.startBatchQuiz(state.currentSessionMeta.unitId, state.currentSessionMeta.part);
            return;
        }
        if (state.currentSessionMeta.sourceItems && state.currentSessionMeta.sourceItems.length > 0) {
            global.MimiQuizController.launchQuiz(state.currentSessionMeta.sourceItems, {
                ...state.currentSessionMeta,
                studyMode: state.studyMode
            });
            return;
        }
        global.MimiHomeView.renderHome();
    }

    function backToMenu() {
        if (global.MimiQuizController && typeof global.MimiQuizController.flushDraftInputToSession === "function") {
            global.MimiQuizController.flushDraftInputToSession();
        }
        global.MimiHomeView.renderHome();
    }

    function getModeDisplayLabel(mode) {
        if (mode === "context_fill") return "Điền từ ngữ cảnh";
        if (mode === "listen_meaning") return "Nghe và chọn nghĩa";
        return "2 Bước (Kanji → Nghĩa)";
    }

    function openSessionReview() {
        state.reviewFilter = "all";
        showScreen("session-review-screen");
        renderSessionReview();
        if (typeof global.scrollTo === "function") {
            global.scrollTo({ top: 0, behavior: "auto" });
        }
    }

    function closeSessionReview() {
        showScreen("summary-screen");
    }

    function setSessionReviewFilter(filter) {
        state.reviewFilter = filter === "wrong" ? "wrong" : "all";
        renderSessionReview();
    }

    function renderReviewItemCard(entry, totalCount) {
        const q = state.quizQuestions[entry.index];
        const target = (q && q.target) || state.vocabById.get(entry.targetId);
        if (!target) return "";

        const qNum = entry.index + 1;
        const isCorrect = Boolean(entry.isCorrect);
        const statusBadge = isCorrect
            ? `<span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">✓ Đúng</span>`
            : `<span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">✕ Sai</span>`;
        const cardBorder = isCorrect ? "border-emerald-200/80" : "border-rose-200";
        const readingForAudio = Engine.getPrimaryReading(target.reading) || target.word || "";
        const audioAttr = escapeJsAttr(readingForAudio);

        let bodyHtml = "";

        if (entry.mode === "two_step") {
            const wordHighlight = `<span class="font-bold text-emerald-700">${escapeHtml(target.word)}</span>`;
            const contextJp = target.sentence ? Engine.fillBlank(escapeHtml(target.sentence), wordHighlight) : "";

            const step1Block = entry.needsStep1 ? `
                <div class="p-3 rounded-xl border ${entry.step1Correct ? "bg-emerald-50/60 border-emerald-200" : "bg-rose-50/70 border-rose-200"} space-y-1 text-xs sm:text-sm">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-bold text-slate-700">Bước 1: Chọn cách đọc</span>
                        <span class="font-bold ${entry.step1Correct ? "text-emerald-700" : "text-rose-700"}">${entry.step1Correct ? "✓ Đúng" : "✕ Sai"}</span>
                    </div>
                    <div class="flex flex-wrap gap-x-4 gap-y-1">
                        <div>
                            <span class="text-slate-500">Bạn chọn: </span>
                            <span class="jp-text font-semibold ${entry.step1Correct ? "text-emerald-800" : "text-rose-800"}">${escapeHtml(entry.selectedOptionText || "(Không rõ)")}</span>
                        </div>
                        <div>
                            <span class="text-slate-500">Đáp án đúng: </span>
                            <span class="jp-text font-bold text-slate-900">${escapeHtml(entry.correctOptionText || target.reading)}</span>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                    ✨ Từ thuần Kana — chỉ làm Bước 2 (Gõ nghĩa)
                </div>
            `;

            const step2StatusText = entry.overridden
                ? "✓ Đúng (Đánh dấu thủ công)"
                : (entry.step2Correct ? "✓ Đúng" : "✕ Sai");
            const userInputDisplay = entry.userInput
                ? `"${escapeHtml(entry.userInput)}"`
                : `<span class="italic text-slate-400">(Bỏ trống)</span>`;

            const step2Block = `
                <div class="p-3 rounded-xl border ${entry.step2Correct ? "bg-emerald-50/60 border-emerald-200" : "bg-rose-50/70 border-rose-200"} space-y-1 text-xs sm:text-sm">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-bold text-slate-700">Bước 2: Gõ nghĩa tiếng Việt</span>
                        <span class="font-bold ${entry.step2Correct ? "text-emerald-700" : "text-rose-700"}">${step2StatusText}</span>
                    </div>
                    <div class="space-y-0.5">
                        <div>
                            <span class="text-slate-500">Bạn nhập: </span>
                            <span class="font-semibold ${entry.step2Correct ? "text-emerald-800" : "text-rose-800"}">${userInputDisplay}</span>
                        </div>
                        <div>
                            <span class="text-slate-500">Đáp án đúng: </span>
                            <span class="font-bold text-slate-900">${escapeHtml(target.meaning)}</span>
                        </div>
                    </div>
                </div>
            `;

            bodyHtml = `
                <div class="mt-2.5 space-y-2.5">
                    <div>
                        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span class="jp-text text-xl font-bold text-slate-900">${escapeHtml(target.word)}</span>
                            <span class="jp-text text-sm font-semibold text-emerald-700">【${escapeHtml(target.reading)}】</span>
                            ${target.pos ? `<span class="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">${escapeHtml(target.pos)}</span>` : ""}
                        </div>
                        ${contextJp ? `<p class="jp-text text-xs sm:text-sm text-slate-600 mt-1">${contextJp}</p>` : ""}
                    </div>
                    ${step1Block}
                    ${step2Block}
                </div>
            `;
        } else if (entry.mode === "context_fill") {
            const blankSpan = `<span class="inline-block px-2 py-0.2 mx-0.5 rounded bg-slate-100 border border-dashed border-slate-400 text-slate-500 font-bold">（　）</span>`;
            const blankedSentence = Engine.fillBlank(escapeHtml(target.sentence || ""), blankSpan);

            bodyHtml = `
                <div class="mt-2.5 space-y-2.5">
                    <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                        <p class="jp-text text-sm sm:text-base font-semibold text-slate-900 leading-relaxed">${blankedSentence}</p>
                        ${target.sentenceVi ? `<p class="text-xs text-slate-500">Gợi ý: ${escapeHtml(target.sentenceVi)}</p>` : ""}
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                        <div class="p-2.5 rounded-xl border ${isCorrect ? "bg-emerald-50/60 border-emerald-200" : "bg-rose-50/70 border-rose-200"}">
                            <div class="text-[11px] font-semibold text-slate-500 mb-0.5">Đáp án bạn chọn</div>
                            <div class="jp-text font-bold ${isCorrect ? "text-emerald-800" : "text-rose-800"}">${escapeHtml(entry.selectedOptionText || "(Không rõ)")}</div>
                        </div>
                        <div class="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
                            <div class="text-[11px] font-semibold text-slate-500 mb-0.5">Đáp án đúng</div>
                            <div class="jp-text font-bold text-slate-900">${escapeHtml(target.word)} <span class="font-semibold text-emerald-700">【${escapeHtml(target.reading)}】</span></div>
                            <div class="text-xs text-slate-600 mt-0.5">${escapeHtml(target.meaning)}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // listen_meaning
            const wordHighlight = `<span class="font-bold text-emerald-700">${escapeHtml(target.word)}</span>`;
            const exampleJp = target.sentence ? Engine.fillBlank(escapeHtml(target.sentence), wordHighlight) : "";

            bodyHtml = `
                <div class="mt-2.5 space-y-2.5">
                    <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span class="text-xs font-semibold text-slate-500">🎧 Từ đã nghe:</span>
                            <span class="jp-text text-lg sm:text-xl font-bold text-slate-900">${escapeHtml(target.word)}</span>
                            <span class="jp-text text-sm font-semibold text-emerald-700">【${escapeHtml(target.reading)}】</span>
                            ${target.pos ? `<span class="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">${escapeHtml(target.pos)}</span>` : ""}
                        </div>
                        ${exampleJp ? `<p class="jp-text text-xs text-slate-600 pt-0.5">${exampleJp}</p>` : ""}
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                        <div class="p-2.5 rounded-xl border ${isCorrect ? "bg-emerald-50/60 border-emerald-200" : "bg-rose-50/70 border-rose-200"}">
                            <div class="text-[11px] font-semibold text-slate-500 mb-0.5">Nghĩa bạn chọn</div>
                            <div class="font-bold ${isCorrect ? "text-emerald-800" : "text-rose-800"}">${escapeHtml(entry.selectedOptionText || "(Không rõ)")}</div>
                        </div>
                        <div class="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
                            <div class="text-[11px] font-semibold text-slate-500 mb-0.5">Đáp án đúng</div>
                            <div class="font-bold text-slate-900">${escapeHtml(target.meaning)}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        const slowAudioBtn = entry.mode === "listen_meaning"
            ? `<button type="button" onclick="MimiApp.speakSpecific('${audioAttr}', { rate: 0.6 })" title="Nghe chậm"
                class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition">🐢 Chậm</button>`
            : "";

        return `
            <article class="p-4 sm:p-5 rounded-2xl bg-white border ${cardBorder} shadow-xs">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">Câu ${qNum}/${totalCount}</span>
                        ${statusBadge}
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button type="button" onclick="MimiApp.speakSpecific('${audioAttr}')" title="Nghe phát âm"
                            class="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 text-xs font-semibold transition">
                            🔊 Nghe
                        </button>
                        ${slowAudioBtn}
                    </div>
                </div>
                ${bodyHtml}
            </article>
        `;
    }

    function renderSessionReview() {
        const meta = state.currentSessionMeta || {};
        const history = Array.isArray(state.answerHistory)
            ? [...state.answerHistory].sort((a, b) => a.index - b.index)
            : [];
        const total = history.length;
        const wrongEntries = history.filter((entry) => !entry.isCorrect);
        const wrongTotal = wrongEntries.length;
        const filter = state.reviewFilter === "wrong" ? "wrong" : "all";
        const visible = filter === "wrong" ? wrongEntries : history;

        const titleEl = document.getElementById("review-session-label");
        const modeEl = document.getElementById("review-session-mode");
        const scoreEl = document.getElementById("review-session-score");
        const allBtn = document.getElementById("review-filter-all");
        const wrongBtn = document.getElementById("review-filter-wrong");
        const emptyEl = document.getElementById("session-review-empty");
        const listEl = document.getElementById("session-review-list");

        if (titleEl) titleEl.textContent = meta.label || "Lượt ôn tập vừa hoàn thành";
        if (modeEl) modeEl.textContent = getModeDisplayLabel(meta.studyMode || state.studyMode);
        if (scoreEl) scoreEl.textContent = `✓ ${state.correctCount} · ✕ ${state.wrongCount} · ${total} câu`;

        const activeAllCls = "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 text-white shadow-xs transition";
        const inactiveCls = "px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition";
        const activeWrongCls = "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-rose-600 text-white shadow-xs transition";

        if (allBtn) {
            allBtn.textContent = `Tất cả (${total})`;
            allBtn.className = filter === "all" ? activeAllCls : inactiveCls;
            allBtn.setAttribute("aria-pressed", String(filter === "all"));
        }
        if (wrongBtn) {
            wrongBtn.textContent = `Chỉ xem câu sai (${wrongTotal})`;
            wrongBtn.className = filter === "wrong" ? activeWrongCls : inactiveCls;
            wrongBtn.setAttribute("aria-pressed", String(filter === "wrong"));
        }

        if (!listEl || !emptyEl) return;

        if (visible.length === 0) {
            listEl.innerHTML = "";
            emptyEl.classList.remove("hidden");
            const emptyTitle = document.getElementById("review-empty-title");
            const emptyDesc = document.getElementById("review-empty-desc");
            if (filter === "wrong" && total > 0) {
                if (emptyTitle) emptyTitle.textContent = "Không có câu sai nào trong lượt này!";
                if (emptyDesc) emptyDesc.textContent = `Xuất sắc — bạn đã trả lời đúng toàn bộ ${total} câu.`;
            } else {
                if (emptyTitle) emptyTitle.textContent = "Chưa có dữ liệu câu trả lời để xem lại.";
                if (emptyDesc) emptyDesc.textContent = "Hãy hoàn thành một lượt ôn tập để xem chi tiết từng câu.";
            }
            return;
        }

        emptyEl.classList.add("hidden");
        listEl.innerHTML = visible.map((entry) => renderReviewItemCard(entry, total)).join("");
    }

    global.MimiSummaryView = {
        showSummary,
        startNextBatchFromSummary,
        previewNextBatchFromSummary,
        openSessionReview,
        closeSessionReview,
        setSessionReviewFilter,
        retryWrong,
        restartCurrentSession,
        backToMenu
    };
})(window);
