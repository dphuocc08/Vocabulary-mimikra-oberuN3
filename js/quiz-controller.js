(function (global) {
    const Storage = global.MimiStorage;
    const Engine = global.MimiQuizEngine;
    const AppState = global.MimiAppState;
    const { state, escapeHtml, showScreen } = AppState;

    let draftSaveTimer = null;
    let step2HiraganaVisible = false;

    function getModeBadgeText(mode) {
        if (mode === "context_fill") return "Điền từ ngữ cảnh";
        if (mode === "listen_meaning") return "Nghe & chọn nghĩa";
        return "2 Bước: Kanji → Nghĩa";
    }

    function buildSerializableSession() {
        const meta = state.currentSessionMeta;
        if (!meta || !meta.isBatchSession) return null;
        if (!Array.isArray(state.quizQuestions) || state.quizQuestions.length === 0) return null;
        if (state.currentIndex < 0 || state.currentIndex >= state.quizQuestions.length) return null;

        const levelId = meta.levelId || state.currentLevel;
        const levelMeta = AppState.getLevelMetaById(levelId);
        const studyMode = meta.studyMode || state.studyMode;
        const result = state.currentResult || {};

        return {
            version: 1,
            levelId,
            levelCode: meta.levelCode || (levelMeta ? levelMeta.code : levelId.toUpperCase()),
            unitId: meta.unitId,
            unitCode: meta.unitCode || meta.unitId,
            part: meta.part,
            partTitle: meta.partTitle || "",
            batchKey: meta.batchKey || `${meta.unitId}::${meta.part}`,
            label: meta.label || `${meta.unitCode || meta.unitId} • ${meta.part}`,
            studyMode,
            questions: state.quizQuestions.map((q) => ({
                targetId: q.target.id,
                mode: q.mode,
                needsStep1: Boolean(q.needsStep1),
                options: Array.isArray(q.options)
                    ? q.options.map((opt) => ({
                        text: opt.text,
                        isCorrect: Boolean(opt.isCorrect)
                    }))
                    : []
            })),
            currentIndex: state.currentIndex,
            correctCount: state.correctCount,
            wrongCount: state.wrongCount,
            wrongItemIds: state.wrongItems.map((item) => item.id),
            answerHistory: Array.isArray(state.answerHistory)
                ? state.answerHistory.map((entry) => ({ ...entry }))
                : [],
            quizStep: state.quizStep,
            currentQuestionState: {
                selectedOptionIndex: Number.isInteger(result.selectedOptionIndex) ? result.selectedOptionIndex : null,
                step1Correct: Boolean(result.step1Correct),
                step2Correct: result.step2Correct === undefined ? true : Boolean(result.step2Correct),
                userInput: typeof result.userInput === "string" ? result.userInput : "",
                wasInMistakeBankBefore: Boolean(result.wasInMistakeBankBefore),
                addedToBank: Boolean(result.addedToBank),
                graduatedFromBank: Boolean(result.graduatedFromBank),
                overridden: Boolean(result.overridden)
            },
            updatedAt: new Date().toISOString()
        };
    }

    function persistActiveSessionIfBatch() {
        const payload = buildSerializableSession();
        if (!payload) return false;
        return Storage.saveActiveSession(payload);
    }

    function flushDraftInputToSession() {
        if (draftSaveTimer) {
            clearTimeout(draftSaveTimer);
            draftSaveTimer = null;
        }
        const quizScreen = document.getElementById("quiz-screen");
        if (!quizScreen || quizScreen.classList.contains("hidden")) return;
        if (!state.currentSessionMeta || !state.currentSessionMeta.isBatchSession) return;
        if (state.quizStep === 2 && state.currentResult) {
            const inputEl = document.getElementById("meaning-input");
            if (inputEl && !inputEl.disabled) {
                state.currentResult.userInput = inputEl.value || "";
            }
        }
        persistActiveSessionIfBatch();
    }

    function setupPersistenceListeners() {
        const inputEl = document.getElementById("meaning-input");
        if (inputEl) {
            inputEl.addEventListener("input", () => {
                if (state.quizStep !== 2 || !state.currentResult) return;
                if (!state.currentSessionMeta || !state.currentSessionMeta.isBatchSession) return;
                state.currentResult.userInput = inputEl.value || "";
                if (draftSaveTimer) clearTimeout(draftSaveTimer);
                draftSaveTimer = setTimeout(() => {
                    draftSaveTimer = null;
                    persistActiveSessionIfBatch();
                }, 120);
            });
        }

        global.addEventListener("pagehide", flushDraftInputToSession);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                flushDraftInputToSession();
            }
        });
    }

    function validateSavedSessionForLoadedData(saved) {
        if (!saved) return null;
        if (!AppState.isValidManifestUnit(saved.levelId, saved.unitId)) return null;

        const found = AppState.findUnitAndBatch(saved.unitId, saved.part);
        if (!found) return null;

        const { levelMeta, unit, batch } = found;
        if ((unit.level || "n3") !== saved.levelId) return null;

        const batchItemIds = new Set(batch.items.map((item) => item.id));
        const rebuiltQuestions = [];

        for (const sq of saved.questions) {
            const target = state.vocabById.get(sq.targetId);
            if (!target || !batchItemIds.has(target.id)) {
                return null;
            }
            rebuiltQuestions.push({
                target,
                mode: sq.mode,
                needsStep1: sq.needsStep1,
                options: sq.options.map((o) => ({ text: o.text, isCorrect: Boolean(o.isCorrect) }))
            });
        }

        if (rebuiltQuestions.length === 0 || saved.currentIndex >= rebuiltQuestions.length) {
            return null;
        }

        const currentQ = rebuiltQuestions[saved.currentIndex];
        if ((saved.studyMode === "context_fill" || saved.studyMode === "listen_meaning") && saved.quizStep === 2) return null;
        if (saved.studyMode === "two_step" && !currentQ.needsStep1 && saved.quizStep === 1) return null;

        const qState = saved.currentQuestionState || {};
        const needsSelectedOption =
            ((saved.studyMode === "context_fill" || saved.studyMode === "listen_meaning") && saved.quizStep === 3) ||
            (saved.studyMode === "two_step" && currentQ.needsStep1 && saved.quizStep >= 2);
        if (needsSelectedOption) {
            if (
                !Number.isInteger(qState.selectedOptionIndex) ||
                qState.selectedOptionIndex < 0 ||
                qState.selectedOptionIndex >= currentQ.options.length
            ) {
                return null;
            }
        }

        return {
            levelMeta,
            unit,
            batch,
            rebuiltQuestions
        };
    }

    function startBatchQuiz(unitId, partName) {
        const found = AppState.findUnitAndBatch(unitId, partName);
        if (!found) return;
        const { levelMeta, unit, batch } = found;

        launchQuiz(batch.items, {
            label: `${unit.code} • ${batch.part}`,
            batchKey: batch.batchKey,
            levelId: levelMeta.id,
            levelCode: levelMeta.code,
            unitId: unit.id,
            unitCode: unit.code,
            part: batch.part,
            partTitle: batch.partTitle || "",
            isBatchSession: true,
            isMistakeBank: false,
            studyMode: state.studyMode,
            sourceItems: batch.items
        });
    }

    function startUnitAllQuiz(unitId) {
        const unit = state.units.find((u) => u.id === unitId);
        if (!unit || unit.items.length === 0) return;

        launchQuiz(unit.items, {
            label: `${unit.code} • Toàn bộ (${unit.items.length} từ)`,
            batchKey: `${unit.id}::ALL`,
            levelId: unit.level || state.currentLevel,
            unitId: unit.id,
            unitCode: unit.code,
            part: null,
            partTitle: "",
            isBatchSession: false,
            isMistakeBank: false,
            studyMode: state.studyMode,
            sourceItems: unit.items
        });
    }

    function startGlobalRandomQuiz(count = 20) {
        const levelVocab = AppState.getCurrentLevelVocab();
        const meta = AppState.getCurrentLevelMeta();
        if (levelVocab.length === 0) return;
        const picked = Engine.shuffle(levelVocab).slice(0, Math.min(count, levelVocab.length));

        launchQuiz(picked, {
            label: `Ôn tổng hợp ${meta.code} (${picked.length} từ)`,
            batchKey: null,
            levelId: meta.id,
            unitId: null,
            unitCode: null,
            part: null,
            partTitle: "",
            isBatchSession: false,
            isMistakeBank: false,
            studyMode: state.studyMode,
            sourceItems: picked
        });
    }

    function startMistakeBankQuiz() {
        const levelVocabIds = new Set(AppState.getCurrentLevelVocab().map((v) => v.id));
        const meta = AppState.getCurrentLevelMeta();
        const items = Storage.getWrongIds()
            .filter((id) => levelVocabIds.has(id))
            .map((id) => state.vocabById.get(id))
            .filter(Boolean);

        if (items.length === 0) return;

        launchQuiz(items, {
            label: `📕 Sổ tay từ sai ${meta.code} (${items.length} từ)`,
            batchKey: null,
            levelId: meta.id,
            unitId: null,
            unitCode: null,
            part: null,
            partTitle: "",
            isBatchSession: false,
            isMistakeBank: true,
            studyMode: state.studyMode,
            sourceItems: items
        });
    }

    function launchQuiz(items, meta) {
        const sessionMode = meta && meta.studyMode ? meta.studyMode : state.studyMode;
        const distractorPool = AppState.getCurrentLevelVocab();
        state.quizQuestions = Engine.buildQuestions(
            items,
            distractorPool.length >= 4 ? distractorPool : state.allVocab,
            sessionMode
        );
        state.currentIndex = 0;
        state.correctCount = 0;
        state.wrongCount = 0;
        state.wrongItems = [];
        state.answerHistory = [];
        state.reviewFilter = "all";
        state.currentSessionMeta = {
            ...meta,
            studyMode: sessionMode,
            isBatchSession: Boolean(meta && meta.isBatchSession)
        };

        showScreen("quiz-screen");
        if (global.MimiHomeView && typeof global.MimiHomeView.renderLevelHeader === "function") {
            global.MimiHomeView.renderLevelHeader();
        }

        document.getElementById("current-unit-badge").textContent = state.currentSessionMeta.label;
        document.getElementById("current-mode-badge").textContent = getModeBadgeText(sessionMode);

        updateStats();
        renderQuestion(null);
    }

    async function resumeSavedSession() {
        const saved = Storage.getActiveSession();
        if (!saved) {
            if (global.MimiHomeView) global.MimiHomeView.renderHome();
            return false;
        }

        if (!AppState.isValidManifestUnit(saved.levelId, saved.unitId)) {
            Storage.clearActiveSession();
            if (global.MimiHomeView) global.MimiHomeView.renderHome();
            return false;
        }

        if (state.currentLevel !== saved.levelId || AppState.getCurrentLevelUnits().length === 0) {
            try {
                await AppState.loadLevel(saved.levelId);
            } catch (err) {
                console.error("Failed to load level for saved session:", err);
                return false;
            }
        }

        const validated = validateSavedSessionForLoadedData(saved);
        if (!validated) {
            Storage.clearActiveSession();
            if (global.MimiHomeView) global.MimiHomeView.renderHome();
            return false;
        }

        const { levelMeta, unit, batch, rebuiltQuestions } = validated;

        state.studyMode = Storage.setStudyMode(saved.studyMode);
        state.quizQuestions = rebuiltQuestions;
        state.currentIndex = saved.currentIndex;
        state.correctCount = Math.min(saved.correctCount, rebuiltQuestions.length);
        state.wrongCount = Math.min(saved.wrongCount, rebuiltQuestions.length);
        state.wrongItems = (saved.wrongItemIds || [])
            .map((id) => state.vocabById.get(id))
            .filter(Boolean);
        state.answerHistory = Array.isArray(saved.answerHistory)
            ? saved.answerHistory.map((entry) => ({ ...entry }))
            : [];
        state.reviewFilter = "all";
        state.currentSessionMeta = {
            label: `${unit.code} • ${batch.part}`,
            batchKey: batch.batchKey,
            levelId: levelMeta.id,
            levelCode: levelMeta.code,
            unitId: unit.id,
            unitCode: unit.code,
            part: batch.part,
            partTitle: batch.partTitle || "",
            isBatchSession: true,
            isMistakeBank: false,
            studyMode: saved.studyMode,
            sourceItems: batch.items
        };

        showScreen("quiz-screen");
        if (global.MimiHomeView && typeof global.MimiHomeView.renderLevelHeader === "function") {
            global.MimiHomeView.renderLevelHeader();
        }

        document.getElementById("current-unit-badge").textContent = state.currentSessionMeta.label;
        document.getElementById("current-mode-badge").textContent = getModeBadgeText(saved.studyMode);

        updateStats();
        renderQuestion(saved);
        return true;
    }

    function updateStats() {
        document.getElementById("score-correct").textContent = `✓ ${state.correctCount}`;
        document.getElementById("score-wrong").textContent = `✕ ${state.wrongCount}`;
        document.getElementById("question-counter").textContent =
            `${Math.min(state.currentIndex + 1, state.quizQuestions.length)}/${state.quizQuestions.length}`;
        const pct = state.quizQuestions.length > 0 ? (state.currentIndex / state.quizQuestions.length) * 100 : 0;
        document.getElementById("progress-bar").style.width = `${pct}%`;
    }

    function applyOptionSelectionStyles(options, selectedIndex) {
        const chosen = options[selectedIndex];
        const isCorrect = Boolean(chosen && chosen.isCorrect);

        options.forEach((opt, idx) => {
            const btn = document.getElementById(`opt-btn-${idx}`);
            const badge = document.getElementById(`opt-badge-${idx}`);
            if (!btn || !badge) return;
            btn.disabled = true;

            if (opt.isCorrect) {
                btn.className = "option-btn w-full p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-left flex items-center space-x-3 shadow-sm";
                badge.className = "w-7 h-7 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0";
                badge.textContent = "✓";
            } else if (idx === selectedIndex && !isCorrect) {
                btn.className = "option-btn w-full p-4 rounded-xl border-2 border-rose-500 bg-rose-50 text-left flex items-center space-x-3";
                badge.className = "w-7 h-7 rounded-lg bg-rose-500 text-white font-bold text-xs flex items-center justify-center shrink-0";
                badge.textContent = "✕";
            } else {
                btn.className = "option-btn w-full p-4 rounded-xl border-2 border-slate-100 bg-slate-50/60 text-left flex items-center space-x-3 opacity-50";
            }
        });
    }

    function setListenAudioStatus(kind, message) {
        const statusEl = document.getElementById("listen-audio-status");
        if (!statusEl) return;

        if (kind === "blocked") {
            statusEl.className = "mt-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs sm:text-sm font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-2.5";
            statusEl.innerHTML = `
                <span>⚠️ ${escapeHtml(message)}</span>
                <button id="listen-replay-blocked-btn" type="button" onclick="MimiApp.playListenAudio(false)"
                    class="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition shrink-0 text-center">
                    🔊 Nghe lại ngay
                </button>
            `;
            return;
        }

        if (kind === "playing") {
            statusEl.className = "mt-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium";
            statusEl.textContent = message;
            return;
        }

        if (kind === "unsupported" || kind === "error") {
            statusEl.className = "mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-2";
            statusEl.innerHTML = kind === "error"
                ? `
                    <span>⚠️ ${escapeHtml(message)}</span>
                    <button type="button" onclick="MimiApp.playListenAudio(false)"
                        class="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-semibold text-xs transition shrink-0">
                        🔊 Thử nghe lại
                    </button>
                `
                : `<span>⚠️ ${escapeHtml(message)}</span>`;
            return;
        }

        statusEl.className = "mt-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 text-xs sm:text-sm font-normal";
        statusEl.textContent = message;
    }

    function playListenAudio(isSlow, isAuto) {
        const q = state.quizQuestions[state.currentIndex];
        const showStatus = Boolean(q && q.mode === "listen_meaning");
        const speedLabel = isSlow ? "🐢 Đang phát chậm..." : "🔊 Đang phát âm...";
        const AudioApi = global.MimiAudio;

        if (!AudioApi) return;

        if (showStatus) {
            setListenAudioStatus("playing", speedLabel);
        }

        const callbacks = {
            isAuto: Boolean(isAuto),
            onStart: () => {
                if (showStatus) setListenAudioStatus("playing", speedLabel);
            },
            onEnd: () => {
                if (showStatus) {
                    setListenAudioStatus("ready", "Đã phát âm. Bấm Nghe / Nghe chậm hoặc phím R / S để nghe lại.");
                }
            },
            onBlocked: () => {
                if (showStatus) {
                    setListenAudioStatus("blocked", "Trình duyệt chặn phát tự động. Hãy bấm nút Nghe lại để nghe từ này.");
                }
            },
            onError: () => {
                if (showStatus) {
                    setListenAudioStatus("error", "Không thể phát âm tự động lúc này. Hãy bấm thử nghe lại.");
                }
            },
            onUnsupported: () => {
                if (showStatus) {
                    setListenAudioStatus("unsupported", "Trình duyệt hiện tại không hỗ trợ đọc tiếng Nhật (Web Speech API).");
                }
            }
        };

        if (isSlow) {
            AudioApi.speakWordSlow(callbacks);
        } else {
            AudioApi.speakWord(callbacks);
        }
    }

    function revealListenWord(target) {
        const revealedEl = document.getElementById("listen-revealed-word");
        if (!revealedEl || !target) return;
        revealedEl.classList.remove("hidden");
        revealedEl.innerHTML = `
            <div class="mt-4 pt-4 border-t border-slate-200/80 flex flex-wrap items-baseline gap-2">
                <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Từ vừa nghe:</span>
                <span class="jp-text text-2xl sm:text-3xl font-bold text-slate-900">${escapeHtml(target.word)}</span>
                <span class="jp-text text-base sm:text-lg font-semibold text-emerald-700">【${escapeHtml(target.reading)}】</span>
            </div>
        `;
    }

    function renderQuestion(restoredSession) {
        const q = state.quizQuestions[state.currentIndex];
        const target = q.target;
        state.currentAudioReading = Engine.getPrimaryReading(target.reading) || target.word || "";

        const isRestoring = Boolean(restoredSession);
        const restoredQState = isRestoring && restoredSession.currentQuestionState
            ? restoredSession.currentQuestionState
            : null;

        if (isRestoring) {
            state.currentResult = {
                target,
                selectedOptionIndex: Number.isInteger(restoredQState.selectedOptionIndex)
                    ? restoredQState.selectedOptionIndex
                    : null,
                step1Correct: Boolean(restoredQState.step1Correct),
                step2Correct: restoredQState.step2Correct === undefined ? true : Boolean(restoredQState.step2Correct),
                userInput: typeof restoredQState.userInput === "string" ? restoredQState.userInput : "",
                wasInMistakeBankBefore: Boolean(restoredQState.wasInMistakeBankBefore),
                addedToBank: Boolean(restoredQState.addedToBank),
                graduatedFromBank: Boolean(restoredQState.graduatedFromBank),
                overridden: Boolean(restoredQState.overridden)
            };
        } else {
            state.currentResult = {
                target,
                selectedOptionIndex: null,
                step1Correct: true,
                step2Correct: true,
                userInput: "",
                wasInMistakeBankBefore: Storage.isWrongId(target.id),
                addedToBank: false,
                graduatedFromBank: false,
                overridden: false
            };
        }

        const inputEl = document.getElementById("meaning-input");
        const submitBtn = document.getElementById("step2-submit-btn");
        document.getElementById("explanation-card").classList.add("hidden");
        document.getElementById("kana-skip-banner").classList.add("hidden");
        inputEl.value = "";
        inputEl.disabled = false;
        inputEl.className =
            "flex-grow px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-emerald-600 focus:outline-none text-slate-900 text-sm sm:text-base transition";
        submitBtn.disabled = false;

        document.getElementById("q-vocab-id").textContent =
            `#${String(target.id).padStart(3, "0")} • ${target.pos}`;

        const qTextEl = document.getElementById("question-text");
        const qTypeLabel = document.getElementById("q-type-label");
        const optionsContainer = document.getElementById("options-container");
        const step2Container = document.getElementById("step2-container");

        if (q.mode === "listen_meaning") {
            state.quizStep = isRestoring ? restoredSession.quizStep : 1;
            qTypeLabel.textContent = "Nghe phát âm tiếng Nhật và chọn nghĩa tiếng Việt đúng";
            qTextEl.innerHTML = `
                <div class="font-sans rounded-2xl bg-slate-50 border border-slate-200 p-4 sm:p-5">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="space-y-0.5">
                            <div class="text-sm sm:text-base font-bold text-slate-900">🎧 Nghe từ vựng tiếng Nhật</div>
                            <p class="text-xs text-slate-500">Chữ tiếng Nhật và cách đọc được ẩn cho đến khi bạn chọn đáp án.</p>
                        </div>
                        <div class="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                            <button id="listen-play-btn" type="button" onclick="MimiApp.playListenAudio(false)"
                                class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-xs transition flex items-center justify-center gap-1.5">
                                <span>🔊</span>
                                <span>Nghe</span>
                            </button>
                            <button id="listen-slow-btn" type="button" onclick="MimiApp.playListenAudio(true)"
                                class="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-sm transition flex items-center justify-center gap-1.5">
                                <span>🐢</span>
                                <span>Nghe chậm</span>
                            </button>
                        </div>
                    </div>
                    <div id="listen-audio-status" role="status" aria-live="polite" class="mt-3 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 text-xs sm:text-sm font-normal">
                        Bấm Nghe hoặc Nghe chậm để nghe phát âm tiếng Nhật.
                    </div>
                    <div id="listen-revealed-word" class="hidden"></div>
                </div>
            `;
            step2Container.classList.add("hidden");
            optionsContainer.classList.remove("hidden");
            renderOptions(q.options, "listen_meaning");

            if (isRestoring && state.quizStep === 3) {
                applyOptionSelectionStyles(q.options, state.currentResult.selectedOptionIndex);
                revealListenWord(target);
                setListenAudioStatus("ready", "Bấm Nghe hoặc Nghe chậm để nghe lại từ này.");
                renderExplanation();
                document.getElementById("progress-bar").style.width =
                    `${((state.currentIndex + 1) / state.quizQuestions.length) * 100}%`;
            } else {
                persistActiveSessionIfBatch();
                playListenAudio(false, true);
            }
            return;
        }

        if (q.mode === "context_fill") {
            state.quizStep = isRestoring ? restoredSession.quizStep : 1;
            qTypeLabel.textContent = "Chọn từ vựng phù hợp điền vào chỗ trống";
            const blankSpan = `<span class="inline-block px-3 py-0.5 mx-1 rounded-lg bg-slate-100 border border-dashed border-slate-400 text-slate-400 font-bold">（　）</span>`;
            const renderedSentence = Engine.fillBlank(escapeHtml(target.sentence), blankSpan);
            qTextEl.innerHTML = `
                <div class="text-lg sm:text-2xl font-bold text-slate-900 leading-relaxed mb-2">${renderedSentence}</div>
                <div class="text-sm font-sans font-medium text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/70">
                    Gợi ý nghĩa câu: ${escapeHtml(target.sentenceVi)}
                </div>
            `;
            step2Container.classList.add("hidden");
            optionsContainer.classList.remove("hidden");
            renderOptions(q.options, "context_fill");

            if (isRestoring && state.quizStep === 3) {
                applyOptionSelectionStyles(q.options, state.currentResult.selectedOptionIndex);
                renderExplanation();
                document.getElementById("progress-bar").style.width =
                    `${((state.currentIndex + 1) / state.quizQuestions.length) * 100}%`;
            } else {
                persistActiveSessionIfBatch();
            }
            return;
        }

        // Mode 1: Two-step flow
        if (q.needsStep1) {
            state.quizStep = isRestoring ? restoredSession.quizStep : 1;
            if (!isRestoring) {
                state.currentResult.step1Correct = false;
            }
            qTypeLabel.textContent = "Bước 1: Chọn cách đọc Hiragana đúng của từ sau";
            qTextEl.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-3xl sm:text-4xl font-bold text-slate-900 tracking-wide">${escapeHtml(target.word)}</span>
                </div>
            `;
            step2Container.classList.add("hidden");
            optionsContainer.classList.remove("hidden");
            renderOptions(q.options);

            if (isRestoring && state.quizStep === 2) {
                applyOptionSelectionStyles(q.options, state.currentResult.selectedOptionIndex);
                revealStep2(target, state.currentResult.step1Correct, false, false);
                inputEl.value = state.currentResult.userInput || "";
            } else if (isRestoring && state.quizStep === 3) {
                applyOptionSelectionStyles(q.options, state.currentResult.selectedOptionIndex);
                revealStep2(target, state.currentResult.step1Correct, false, true);
                inputEl.value = state.currentResult.userInput || "";
                inputEl.disabled = true;
                submitBtn.disabled = true;
                inputEl.className = state.currentResult.step2Correct
                    ? "flex-grow px-4 py-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 text-emerald-900 font-medium text-sm sm:text-base"
                    : "flex-grow px-4 py-3 rounded-xl border-2 border-rose-400 bg-rose-50/60 text-rose-900 font-medium text-sm sm:text-base";
                renderExplanation();
                document.getElementById("progress-bar").style.width =
                    `${((state.currentIndex + 1) / state.quizQuestions.length) * 100}%`;
            } else {
                persistActiveSessionIfBatch();
            }
        } else {
            // Kana-only word: skip Step 1 automatically and jump straight to Step 2
            state.quizStep = isRestoring ? restoredSession.quizStep : 2;
            state.currentResult.step1Correct = true;
            qTypeLabel.textContent = "Từ thuần Kana — Hãy gõ nghĩa tiếng Việt theo ngữ cảnh";
            qTextEl.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-3xl sm:text-4xl font-bold text-slate-900 tracking-wide">${escapeHtml(target.word)}</span>
                </div>
            `;
            document.getElementById("kana-skip-banner").classList.remove("hidden");
            optionsContainer.classList.add("hidden");
            optionsContainer.innerHTML = "";

            if (isRestoring && state.quizStep === 3) {
                revealStep2(target, true, true, true);
                inputEl.value = state.currentResult.userInput || "";
                inputEl.disabled = true;
                submitBtn.disabled = true;
                inputEl.className = state.currentResult.step2Correct
                    ? "flex-grow px-4 py-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 text-emerald-900 font-medium text-sm sm:text-base"
                    : "flex-grow px-4 py-3 rounded-xl border-2 border-rose-400 bg-rose-50/60 text-rose-900 font-medium text-sm sm:text-base";
                renderExplanation();
                document.getElementById("progress-bar").style.width =
                    `${((state.currentIndex + 1) / state.quizQuestions.length) * 100}%`;
            } else {
                revealStep2(target, true, true, false);
                if (isRestoring) {
                    inputEl.value = state.currentResult.userInput || "";
                } else {
                    persistActiveSessionIfBatch();
                    global.MimiAudio.speakWord();
                }
            }
        }
    }

    function renderOptions(options, mode) {
        const optionsContainer = document.getElementById("options-container");
        const textCls = mode === "listen_meaning"
            ? "flex-grow font-sans font-semibold text-sm sm:text-base text-slate-800 leading-snug"
            : "flex-grow jp-text font-bold text-lg text-slate-800";
        optionsContainer.innerHTML = options.map((opt, idx) => `
            <button onclick="MimiApp.selectOption(${idx})" id="opt-btn-${idx}"
                class="option-btn w-full p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/30 text-left flex items-center space-x-3">
                <span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0" id="opt-badge-${idx}">${idx + 1}</span>
                <div class="${textCls}">${escapeHtml(opt.text)}</div>
            </button>
        `).join("");
    }

    function selectOption(selectedIndex) {
        if (state.quizStep !== 1) return;
        const q = state.quizQuestions[state.currentIndex];
        if (!q || !q.options[selectedIndex]) return;

        const target = q.target;
        const chosen = q.options[selectedIndex];
        const isCorrect = chosen.isCorrect;

        state.currentResult.selectedOptionIndex = selectedIndex;
        applyOptionSelectionStyles(q.options, selectedIndex);

        if (q.mode === "listen_meaning") {
            state.quizStep = 3;
            state.currentResult.step1Correct = isCorrect;
            state.currentResult.step2Correct = true;
            revealListenWord(target);
            finalizeQuestionOutcome(isCorrect);
            renderExplanation();
            updateStats();
            document.getElementById("progress-bar").style.width =
                `${((state.currentIndex + 1) / state.quizQuestions.length) * 100}%`;
            persistActiveSessionIfBatch();
            return;
        }

        global.MimiAudio.speakWord();

        if (q.mode === "context_fill") {
            state.quizStep = 3;
            state.currentResult.step1Correct = isCorrect;
            state.currentResult.step2Correct = true;
            finalizeQuestionOutcome(isCorrect);
            renderExplanation();
            updateStats();
            document.getElementById("progress-bar").style.width =
                `${((state.currentIndex + 1) / state.quizQuestions.length) * 100}%`;
            persistActiveSessionIfBatch();
            return;
        }

        // Mode 1 Step 1 completed -> move to Step 2
        state.quizStep = 2;
        state.currentResult.step1Correct = isCorrect;
        revealStep2(target, isCorrect, false, false);
        persistActiveSessionIfBatch();
    }

    function syncStep2HiraganaUi(target, canToggle) {
        const wordEl = document.getElementById("step2-target-word");
        const readingEl = document.getElementById("step2-target-reading");
        const toggleBtn = document.getElementById("step2-hiragana-toggle");
        if (!wordEl || !readingEl || !toggleBtn) return;

        wordEl.textContent = target ? (target.word || "") : "";

        const hasDistinctReading = Boolean(
            target && target.reading && target.word && target.word !== target.reading
        );
        const showToggle = Boolean(canToggle && hasDistinctReading);

        if (!showToggle) {
            readingEl.textContent = "";
            readingEl.classList.add("hidden");
            toggleBtn.classList.add("hidden");
            toggleBtn.setAttribute("aria-pressed", "false");
            toggleBtn.textContent = "Hiện Hiragana";
            return;
        }

        const isVisible = Boolean(step2HiraganaVisible);
        readingEl.textContent = isVisible ? `（${target.reading}）` : "";
        readingEl.classList.toggle("hidden", !isVisible);

        toggleBtn.classList.remove("hidden");
        toggleBtn.setAttribute("aria-pressed", String(isVisible));
        toggleBtn.textContent = isVisible ? "Ẩn Hiragana" : "Hiện Hiragana";
        toggleBtn.className = isVisible
            ? "step2-hira-toggle shrink-0 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold transition inline-flex items-center justify-center"
            : "step2-hira-toggle shrink-0 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold transition inline-flex items-center justify-center";
    }

    function toggleStep2Hiragana() {
        if (state.quizStep !== 2) return;
        const q = state.quizQuestions[state.currentIndex];
        if (!q || q.mode !== "two_step" || !q.target) return;
        const target = q.target;
        if (!target.reading || target.word === target.reading) return;

        step2HiraganaVisible = !step2HiraganaVisible;
        syncStep2HiraganaUi(target, true);
    }

    function revealStep2(target, isStep1Ok, isKanaOnly, skipFocus) {
        const step2Container = document.getElementById("step2-container");
        const statusBadge = document.getElementById("step1-status-badge");

        if (isKanaOnly) {
            statusBadge.className = "text-xs font-bold text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full";
            statusBadge.textContent = "Từ thuần Kana";
        } else if (isStep1Ok) {
            statusBadge.className = "text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full";
            statusBadge.textContent = "✓ Bước 1: Đọc đúng";
        } else {
            statusBadge.className = "text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full";
            statusBadge.textContent = "✕ Bước 1: Nhầm cách đọc";
        }

        const highlight = `<span class="font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">${escapeHtml(target.word)}</span>`;
        document.getElementById("step2-context-sentence").innerHTML = Engine.fillBlank(escapeHtml(target.sentence), highlight);

        step2HiraganaVisible = false;
        syncStep2HiraganaUi(target, state.quizStep === 2);

        step2Container.classList.remove("hidden");
        if (!skipFocus) {
            const inputEl = document.getElementById("meaning-input");
            setTimeout(() => {
                inputEl.focus();
                if (global.innerWidth < 640) {
                    step2Container.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
            }, 60);
        }
    }

    function submitStep2() {
        if (state.quizStep !== 2) return;
        if (draftSaveTimer) {
            clearTimeout(draftSaveTimer);
            draftSaveTimer = null;
        }
        state.quizStep = 3;

        const q = state.quizQuestions[state.currentIndex];
        const target = q.target;
        syncStep2HiraganaUi(target, false);
        const inputEl = document.getElementById("meaning-input");
        const userInput = inputEl.value.trim();
        const step2Correct = Engine.checkVietnameseMeaning(userInput, target.meaning, target.synonyms);

        state.currentResult.userInput = userInput;
        state.currentResult.step2Correct = step2Correct;

        inputEl.disabled = true;
        document.getElementById("step2-submit-btn").disabled = true;
        inputEl.className = step2Correct
            ? "flex-grow px-4 py-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 text-emerald-900 font-medium text-sm sm:text-base"
            : "flex-grow px-4 py-3 rounded-xl border-2 border-rose-400 bg-rose-50/60 text-rose-900 font-medium text-sm sm:text-base";

        const isFullyCorrect = state.currentResult.step1Correct && step2Correct;
        finalizeQuestionOutcome(isFullyCorrect);

        renderExplanation();
        updateStats();
        document.getElementById("progress-bar").style.width =
            `${((state.currentIndex + 1) / state.quizQuestions.length) * 100}%`;
        persistActiveSessionIfBatch();
    }

    function recordAnswerHistoryEntry(isFullyCorrect) {
        const q = state.quizQuestions[state.currentIndex];
        if (!q || !state.currentResult) return;
        const target = q.target;
        const selIdx = Number.isInteger(state.currentResult.selectedOptionIndex)
            ? state.currentResult.selectedOptionIndex
            : null;
        const selectedOptionText = selIdx !== null && q.options && q.options[selIdx]
            ? q.options[selIdx].text
            : "";

        let correctOptionText = "";
        if (q.mode === "two_step") {
            correctOptionText = q.needsStep1 ? (target.reading || "") : "";
        } else if (q.mode === "context_fill") {
            correctOptionText = target.word || "";
        } else if (q.mode === "listen_meaning") {
            correctOptionText = target.meaning || "";
        }

        const entry = {
            index: state.currentIndex,
            targetId: target.id,
            mode: q.mode,
            needsStep1: q.mode === "two_step" ? Boolean(q.needsStep1) : false,
            isCorrect: Boolean(isFullyCorrect),
            selectedOptionIndex: selIdx,
            selectedOptionText,
            correctOptionText,
            step1Correct: Boolean(state.currentResult.step1Correct),
            step2Correct: Boolean(state.currentResult.step2Correct),
            userInput: typeof state.currentResult.userInput === "string" ? state.currentResult.userInput : "",
            overridden: Boolean(state.currentResult.overridden)
        };

        if (!Array.isArray(state.answerHistory)) {
            state.answerHistory = [];
        }
        const existingPos = state.answerHistory.findIndex((item) => item.index === state.currentIndex);
        if (existingPos >= 0) {
            state.answerHistory[existingPos] = entry;
        } else {
            state.answerHistory.push(entry);
            state.answerHistory.sort((a, b) => a.index - b.index);
        }
    }

    function finalizeQuestionOutcome(isFullyCorrect) {
        const target = state.currentResult.target;
        if (isFullyCorrect) {
            state.correctCount++;
            Storage.addMasteredId(target.id);
            if (state.currentSessionMeta.isMistakeBank) {
                Storage.removeWrongId(target.id);
                state.currentResult.graduatedFromBank = true;
            }
        } else {
            state.wrongCount++;
            state.wrongItems.push(target);
            Storage.addWrongId(target.id);
            state.currentResult.addedToBank = true;
        }
        recordAnswerHistoryEntry(isFullyCorrect);
    }

    function overrideStep2AsCorrect() {
        if (!state.currentResult || state.currentResult.overridden || state.currentResult.step2Correct) return;
        const target = state.currentResult.target;

        state.currentResult.step2Correct = true;
        state.currentResult.overridden = true;

        const inputEl = document.getElementById("meaning-input");
        if (inputEl) {
            inputEl.className = "flex-grow px-4 py-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 text-emerald-900 font-medium text-sm sm:text-base";
        }

        // Flip score only if Step 1 was also passed (or skipped for Kana-only words)
        if (state.currentResult.step1Correct) {
            state.wrongCount = Math.max(0, state.wrongCount - 1);
            state.correctCount++;
            state.wrongItems = state.wrongItems.filter((item) => item.id !== target.id);
            Storage.addMasteredId(target.id);

            if (state.currentSessionMeta.isMistakeBank) {
                Storage.removeWrongId(target.id);
                state.currentResult.graduatedFromBank = true;
                state.currentResult.addedToBank = false;
            } else if (!state.currentResult.wasInMistakeBankBefore) {
                Storage.removeWrongId(target.id);
                state.currentResult.addedToBank = false;
            }
        }

        recordAnswerHistoryEntry(Boolean(state.currentResult.step1Correct && state.currentResult.step2Correct));
        renderExplanation();
        updateStats();
        persistActiveSessionIfBatch();
    }

    function renderExplanation() {
        const q = state.quizQuestions[state.currentIndex];
        const target = state.currentResult.target;
        const isStep1Ok = state.currentResult.step1Correct;
        const isStep2Ok = state.currentResult.step2Correct;
        const userInput = state.currentResult.userInput;

        const expCard = document.getElementById("explanation-card");
        const resIcon = document.getElementById("result-icon");
        const resTitle = document.getElementById("result-title");
        const resSub = document.getElementById("result-subtitle");

        expCard.classList.remove(
            "hidden",
            "bg-emerald-50/90", "border-emerald-300",
            "bg-rose-50/90", "border-rose-300",
            "bg-amber-50/90", "border-amber-300"
        );

        if (q.mode === "listen_meaning") {
            if (isStep1Ok) {
                expCard.classList.add("bg-emerald-50/90", "border-emerald-300");
                resIcon.className = "w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white shrink-0";
                resIcon.textContent = "✓";
                resTitle.className = "font-bold text-base sm:text-lg text-emerald-900";
                resTitle.textContent = "Chính xác! Bạn đã nghe và chọn đúng nghĩa";
                resSub.className = "text-xs sm:text-sm text-emerald-700";
                resSub.textContent = `${target.word} (${target.reading}) — ${target.meaning}`;
            } else {
                expCard.classList.add("bg-rose-50/90", "border-rose-300");
                resIcon.className = "w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center font-bold text-white shrink-0";
                resIcon.textContent = "✕";
                resTitle.className = "font-bold text-base sm:text-lg text-rose-900";
                resTitle.textContent = "Chưa chính xác! Nghĩa đúng là: " + target.meaning;
                resSub.className = "text-xs sm:text-sm text-rose-700";
                resSub.textContent = `${target.word} (${target.reading})`;
            }
        } else if (q.mode === "context_fill") {
            if (isStep1Ok) {
                expCard.classList.add("bg-emerald-50/90", "border-emerald-300");
                resIcon.className = "w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white shrink-0";
                resIcon.textContent = "✓";
                resTitle.className = "font-bold text-base sm:text-lg text-emerald-900";
                resTitle.textContent = "Chính xác! Điền đúng từ theo ngữ cảnh";
                resSub.className = "text-xs sm:text-sm text-emerald-700";
                resSub.textContent = `${target.word} (${target.reading}) — ${target.meaning}`;
            } else {
                expCard.classList.add("bg-rose-50/90", "border-rose-300");
                resIcon.className = "w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center font-bold text-white shrink-0";
                resIcon.textContent = "✕";
                resTitle.className = "font-bold text-base sm:text-lg text-rose-900";
                resTitle.textContent = "Chưa chính xác! Đáp án đúng là " + target.word;
                resSub.className = "text-xs sm:text-sm text-rose-700";
                resSub.textContent = `Cách đọc: ${target.reading} — Nghĩa: ${target.meaning}`;
            }
        } else {
            if (isStep1Ok && isStep2Ok) {
                expCard.classList.add("bg-emerald-50/90", "border-emerald-300");
                resIcon.className = "w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white shrink-0";
                resIcon.textContent = "✓";
                resTitle.className = "font-bold text-base sm:text-lg text-emerald-900";
                resTitle.textContent = state.currentResult.overridden
                    ? "Đã xác nhận đúng! (Đánh dấu thủ công)"
                    : "Xuất sắc! Đúng cả cách đọc và nghĩa";
                resSub.className = "text-xs sm:text-sm text-emerald-700";
                resSub.textContent = "Bạn đã nắm vững từ vựng này trong ngữ cảnh.";
            } else if (isStep1Ok || isStep2Ok) {
                expCard.classList.add("bg-amber-50/90", "border-amber-300");
                resIcon.className = "w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center font-bold text-white shrink-0";
                resIcon.textContent = "!";
                resTitle.className = "font-bold text-base sm:text-lg text-amber-900";
                resTitle.textContent = isStep1Ok
                    ? "Đúng cách đọc, nhưng nghĩa chưa khớp!"
                    : "Đúng nghĩa, nhưng chọn nhầm cách đọc!";
                resSub.className = "text-xs sm:text-sm text-amber-800";
                resSub.textContent = `Cách đọc: ${target.reading} — Nghĩa: ${target.meaning}`;
            } else {
                expCard.classList.add("bg-rose-50/90", "border-rose-300");
                resIcon.className = "w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center font-bold text-white shrink-0";
                resIcon.textContent = "✕";
                resTitle.className = "font-bold text-base sm:text-lg text-rose-900";
                resTitle.textContent = "Cần ôn lại từ này!";
                resSub.className = "text-xs sm:text-sm text-rose-700";
                resSub.textContent = `Cách đọc: ${target.reading} — Nghĩa: ${target.meaning}`;
            }
        }

        // Mistake bank badge
        const bankStatusEl = document.getElementById("exp-bank-status");
        if (state.currentResult.graduatedFromBank) {
            bankStatusEl.classList.remove("hidden");
            bankStatusEl.className = "inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 mb-3";
            bankStatusEl.textContent = "🎓 Đã xóa nợ khỏi Sổ tay từ sai!";
        } else if (state.currentResult.addedToBank) {
            bankStatusEl.classList.remove("hidden");
            bankStatusEl.className = "inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200 mb-3";
            bankStatusEl.textContent = "📕 Đã lưu vào Sổ tay từ sai để ôn lại sau";
        } else {
            bankStatusEl.classList.add("hidden");
        }

        document.getElementById("exp-word").textContent = target.word;
        document.getElementById("exp-reading").textContent = `【${target.reading}】`;
        document.getElementById("exp-pos").textContent = target.pos;
        document.getElementById("exp-meaning").textContent = target.meaning;

        const userRow = document.getElementById("exp-user-input-row");
        const userText = document.getElementById("exp-user-input");
        const overrideBtn = document.getElementById("override-btn");

        if (q.mode === "two_step") {
            userRow.classList.remove("hidden");
            if (userInput) {
                const suffix = state.currentResult.overridden
                    ? "(Đã xác nhận đúng)"
                    : (isStep2Ok ? "(Khớp)" : "(Chưa khớp)");
                userText.innerHTML = `"${escapeHtml(userInput)}" <span class="ml-1">${suffix}</span>`;
                userText.className = isStep2Ok
                    ? "font-semibold text-emerald-700"
                    : "font-semibold text-rose-600";
            } else {
                userText.textContent = "(Bỏ trống)";
                userText.className = "italic text-slate-400";
            }

            overrideBtn.classList.toggle("hidden", isStep2Ok || state.currentResult.overridden);
        } else {
            userRow.classList.add("hidden");
            overrideBtn.classList.add("hidden");
        }

        const answerHighlight = `<span class="font-bold text-emerald-700 underline decoration-2 underline-offset-4">${escapeHtml(target.word)}</span>`;
        const fullSentence = Engine.fillBlank(escapeHtml(target.sentence), answerHighlight);
        document.getElementById("exp-example").innerHTML = `
            <div class="font-medium text-slate-900">${fullSentence}</div>
            <div class="text-xs text-slate-500 mt-1 font-sans">→ ${escapeHtml(target.sentenceVi)}</div>
        `;

        const noteContainer = document.getElementById("exp-note-container");
        if (target.note) {
            noteContainer.classList.remove("hidden");
            document.getElementById("exp-note").textContent = target.note;
        } else {
            noteContainer.classList.add("hidden");
        }

        const nextBtn = document.getElementById("next-btn");
        nextBtn.querySelector("span").textContent =
            state.currentIndex === state.quizQuestions.length - 1 ? "Xem kết quả" : "Câu tiếp theo";

        setTimeout(() => {
            expCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 80);
    }

    function nextQuestion() {
        state.currentIndex++;
        if (state.currentIndex < state.quizQuestions.length) {
            updateStats();
            renderQuestion(null);
        } else {
            global.MimiSummaryView.showSummary();
        }
    }

    global.MimiQuizController = {
        startBatchQuiz,
        startUnitAllQuiz,
        startGlobalRandomQuiz,
        startMistakeBankQuiz,
        launchQuiz,
        resumeSavedSession,
        validateSavedSessionForLoadedData,
        setupPersistenceListeners,
        flushDraftInputToSession,
        playListenAudio,
        selectOption,
        toggleStep2Hiragana,
        submitStep2,
        overrideStep2AsCorrect,
        nextQuestion
    };
})(window);
