(function (global) {
    const Storage = global.MimiStorage;
    const Engine = global.MimiQuizEngine;

    let UNITS = [];
    let ALL_VOCAB = [];
    const VOCAB_BY_ID = new Map();

    // Application session state
    let studyMode = "two_step"; // 'two_step' | 'context_fill'
    let quizQuestions = [];
    let currentIndex = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let wrongItems = [];
    let quizStep = 1; // 1: MCQ (Step 1 or Mode 2), 2: Typing Vietnamese meaning, 3: Explanation shown
    let currentResult = null;
    let currentSessionMeta = {
        label: "",
        batchKey: null,
        isMistakeBank: false,
        sourceItems: null
    };
    let currentAudioReading = "";
    let mistakeSearchQuery = "";

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
        ALL_VOCAB = [];
        VOCAB_BY_ID.clear();

        UNITS = rawUnits.map((unit) => {
            const batchesMap = new Map();
            const normalizedItems = (unit.items || []).map((item) => {
                const enriched = {
                    ...item,
                    unitId: unit.id,
                    unitCode: unit.code,
                    unitTitle: unit.title
                };
                ALL_VOCAB.push(enriched);
                VOCAB_BY_ID.set(enriched.id, enriched);

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

    function init() {
        initData();
        studyMode = Storage.getStudyMode();
        renderHome();
        setupKeyboardShortcuts();
        setupEventListeners();
    }

    function setupEventListeners() {
        const searchInput = document.getElementById("mistake-search-input");
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                mistakeSearchQuery = e.target.value || "";
                renderMistakeBankList();
            });
        }

        const importFileInput = document.getElementById("backup-import-file");
        if (importFileInput) {
            importFileInput.addEventListener("change", handleImportFile);
        }
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

    // ==================== HOME / SELECTION SCREEN ====================

    function setStudyMode(mode) {
        studyMode = Storage.setStudyMode(mode);
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

        twoStepBtn.className = `p-4 rounded-xl border-2 text-left transition ${studyMode === "two_step" ? activeClasses : inactiveClasses}`;
        contextBtn.className = `p-4 rounded-xl border-2 text-left transition ${studyMode === "context_fill" ? activeClasses : inactiveClasses}`;

        const badge1 = document.getElementById("mode-badge-two_step");
        const badge2 = document.getElementById("mode-badge-context_fill");
        if (badge1) badge1.classList.toggle("hidden", studyMode !== "two_step");
        if (badge2) badge2.classList.toggle("hidden", studyMode !== "context_fill");
    }

    function renderMistakeBanner() {
        const wrongIds = Storage.getWrongIds().filter((id) => VOCAB_BY_ID.has(id));
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
        const masteredCount = ALL_VOCAB.filter((v) => masteredSet.has(v.id)).length;
        const totalEl = document.getElementById("global-vocab-stats");
        if (totalEl) {
            totalEl.textContent = `Tổng kho từ: ${ALL_VOCAB.length} từ • Đã nắm: ${masteredCount}/${ALL_VOCAB.length}`;
        }
    }

    function renderUnitsList() {
        const container = document.getElementById("units-container");
        if (!container) return;

        const masteredSet = new Set(Storage.getMasteredIds());
        const completedBatches = Storage.getCompletedBatches();

        container.innerHTML = UNITS.map((unit) => {
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

    // ==================== QUIZ SESSION START ====================

    function startBatchQuiz(unitId, partName) {
        const unit = UNITS.find((u) => u.id === unitId);
        if (!unit) return;
        const batch = unit.batches.find((b) => b.part === partName);
        if (!batch || batch.items.length === 0) return;

        launchQuiz(batch.items, {
            label: `${unit.code} • ${batch.part}`,
            batchKey: batch.batchKey,
            isMistakeBank: false,
            sourceItems: batch.items
        });
    }

    function startUnitAllQuiz(unitId) {
        const unit = UNITS.find((u) => u.id === unitId);
        if (!unit || unit.items.length === 0) return;

        launchQuiz(unit.items, {
            label: `${unit.code} • Toàn bộ (${unit.items.length} từ)`,
            batchKey: `${unit.id}::ALL`,
            isMistakeBank: false,
            sourceItems: unit.items
        });
    }

    function startGlobalRandomQuiz(count = 20) {
        if (ALL_VOCAB.length === 0) return;
        const picked = Engine.shuffle(ALL_VOCAB).slice(0, Math.min(count, ALL_VOCAB.length));

        launchQuiz(picked, {
            label: `Ôn tổng hợp ngẫu nhiên (${picked.length} từ)`,
            batchKey: null,
            isMistakeBank: false,
            sourceItems: picked
        });
    }

    function startMistakeBankQuiz() {
        const items = Storage.getWrongIds()
            .map((id) => VOCAB_BY_ID.get(id))
            .filter(Boolean);

        if (items.length === 0) return;

        launchQuiz(items, {
            label: `📕 Sổ tay từ sai (${items.length} từ)`,
            batchKey: null,
            isMistakeBank: true,
            sourceItems: items
        });
    }

    function launchQuiz(items, meta) {
        quizQuestions = Engine.buildQuestions(items, ALL_VOCAB, studyMode);
        currentIndex = 0;
        correctCount = 0;
        wrongCount = 0;
        wrongItems = [];
        currentSessionMeta = meta;

        showScreen("quiz-screen");

        document.getElementById("current-unit-badge").textContent = meta.label;
        document.getElementById("current-mode-badge").textContent =
            studyMode === "context_fill" ? "Điền từ ngữ cảnh" : "2 Bước: Kanji → Nghĩa";

        updateStats();
        renderQuestion();
    }

    function updateStats() {
        document.getElementById("score-correct").textContent = `✓ ${correctCount}`;
        document.getElementById("score-wrong").textContent = `✕ ${wrongCount}`;
        document.getElementById("question-counter").textContent =
            `${Math.min(currentIndex + 1, quizQuestions.length)}/${quizQuestions.length}`;
        const pct = quizQuestions.length > 0 ? (currentIndex / quizQuestions.length) * 100 : 0;
        document.getElementById("progress-bar").style.width = `${pct}%`;
    }

    // ==================== QUIZ RENDERING & LOGIC ====================

    function renderQuestion() {
        const q = quizQuestions[currentIndex];
        const target = q.target;
        currentAudioReading = Engine.getPrimaryReading(target.reading);

        currentResult = {
            target,
            step1Correct: true,
            step2Correct: true,
            userInput: "",
            wasInMistakeBankBefore: Storage.isWrongId(target.id),
            addedToBank: false,
            graduatedFromBank: false,
            overridden: false
        };

        document.getElementById("explanation-card").classList.add("hidden");
        document.getElementById("kana-skip-banner").classList.add("hidden");
        document.getElementById("meaning-input").value = "";
        document.getElementById("meaning-input").disabled = false;
        document.getElementById("meaning-input").className =
            "flex-grow px-4 py-3 rounded-xl border-2 border-slate-300 focus:border-emerald-600 focus:outline-none text-slate-900 text-sm sm:text-base transition";
        document.getElementById("step2-submit-btn").disabled = false;

        document.getElementById("q-vocab-id").textContent =
            `#${String(target.id).padStart(3, "0")} • ${target.pos}`;

        const qTextEl = document.getElementById("question-text");
        const qTypeLabel = document.getElementById("q-type-label");
        const optionsContainer = document.getElementById("options-container");
        const step2Container = document.getElementById("step2-container");

        if (q.mode === "context_fill") {
            quizStep = 1;
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
            renderOptions(q.options);
            return;
        }

        // Mode 1: Two-step flow
        if (q.needsStep1) {
            quizStep = 1;
            currentResult.step1Correct = false;
            qTypeLabel.textContent = "Bước 1: Chọn cách đọc Hiragana đúng của từ sau";
            qTextEl.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-3xl sm:text-4xl font-bold text-slate-900 tracking-wide">${escapeHtml(target.word)}</span>
                </div>
            `;
            step2Container.classList.add("hidden");
            optionsContainer.classList.remove("hidden");
            renderOptions(q.options);
        } else {
            // Kana-only word: skip Step 1 automatically and jump straight to Step 2
            quizStep = 2;
            currentResult.step1Correct = true;
            qTypeLabel.textContent = "Từ thuần Kana — Hãy gõ nghĩa tiếng Việt theo ngữ cảnh";
            qTextEl.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="text-3xl sm:text-4xl font-bold text-slate-900 tracking-wide">${escapeHtml(target.word)}</span>
                </div>
            `;
            document.getElementById("kana-skip-banner").classList.remove("hidden");
            optionsContainer.classList.add("hidden");
            optionsContainer.innerHTML = "";

            revealStep2(target, true, true);
            speakWord();
        }
    }

    function renderOptions(options) {
        const optionsContainer = document.getElementById("options-container");
        optionsContainer.innerHTML = options.map((opt, idx) => `
            <button onclick="MimiApp.selectOption(${idx})" id="opt-btn-${idx}"
                class="option-btn w-full p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/30 text-left flex items-center space-x-3">
                <span class="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0" id="opt-badge-${idx}">${idx + 1}</span>
                <div class="flex-grow jp-text font-bold text-lg text-slate-800">${escapeHtml(opt.text)}</div>
            </button>
        `).join("");
    }

    function selectOption(selectedIndex) {
        if (quizStep !== 1) return;
        const q = quizQuestions[currentIndex];
        if (!q || !q.options[selectedIndex]) return;

        const target = q.target;
        const chosen = q.options[selectedIndex];
        const isCorrect = chosen.isCorrect;

        q.options.forEach((opt, idx) => {
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

        speakWord();

        if (q.mode === "context_fill") {
            quizStep = 3;
            currentResult.step1Correct = isCorrect;
            currentResult.step2Correct = true;
            finalizeQuestionOutcome(isCorrect);
            renderExplanation();
            updateStats();
            document.getElementById("progress-bar").style.width =
                `${((currentIndex + 1) / quizQuestions.length) * 100}%`;
            return;
        }

        // Mode 1 Step 1 completed -> move to Step 2
        quizStep = 2;
        currentResult.step1Correct = isCorrect;
        revealStep2(target, isCorrect, false);
    }

    function revealStep2(target, isStep1Ok, isKanaOnly) {
        const step2Container = document.getElementById("step2-container");
        const statusBadge = document.getElementById("step1-status-badge");

        if (isKanaOnly) {
            statusBadge.className = "text-xs font-bold text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-full";
            statusBadge.textContent = `Từ thuần Kana: ${target.reading}`;
        } else if (isStep1Ok) {
            statusBadge.className = "text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full";
            statusBadge.textContent = `✓ Đọc đúng: ${target.reading}`;
        } else {
            statusBadge.className = "text-xs font-bold text-rose-700 bg-rose-100 px-2.5 py-0.5 rounded-full";
            statusBadge.textContent = `✕ Đọc đúng là: ${target.reading}`;
        }

        const highlight = `<span class="font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">${escapeHtml(target.word)}</span>`;
        document.getElementById("step2-context-sentence").innerHTML = Engine.fillBlank(escapeHtml(target.sentence), highlight);
        document.getElementById("step2-target-word").textContent =
            target.word === target.reading ? target.word : `${target.word} (${target.reading})`;

        step2Container.classList.remove("hidden");
        const inputEl = document.getElementById("meaning-input");
        setTimeout(() => {
            inputEl.focus();
            if (global.innerWidth < 640) {
                step2Container.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        }, 60);
    }

    function submitStep2() {
        if (quizStep !== 2) return;
        quizStep = 3;

        const q = quizQuestions[currentIndex];
        const target = q.target;
        const inputEl = document.getElementById("meaning-input");
        const userInput = inputEl.value.trim();
        const step2Correct = Engine.checkVietnameseMeaning(userInput, target.meaning, target.synonyms);

        currentResult.userInput = userInput;
        currentResult.step2Correct = step2Correct;

        inputEl.disabled = true;
        document.getElementById("step2-submit-btn").disabled = true;
        inputEl.className = step2Correct
            ? "flex-grow px-4 py-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 text-emerald-900 font-medium text-sm sm:text-base"
            : "flex-grow px-4 py-3 rounded-xl border-2 border-rose-400 bg-rose-50/60 text-rose-900 font-medium text-sm sm:text-base";

        const isFullyCorrect = currentResult.step1Correct && step2Correct;
        finalizeQuestionOutcome(isFullyCorrect);

        renderExplanation();
        updateStats();
        document.getElementById("progress-bar").style.width =
            `${((currentIndex + 1) / quizQuestions.length) * 100}%`;
    }

    function finalizeQuestionOutcome(isFullyCorrect) {
        const target = currentResult.target;
        if (isFullyCorrect) {
            correctCount++;
            Storage.addMasteredId(target.id);
            if (currentSessionMeta.isMistakeBank) {
                Storage.removeWrongId(target.id);
                currentResult.graduatedFromBank = true;
            }
        } else {
            wrongCount++;
            wrongItems.push(target);
            Storage.addWrongId(target.id);
            currentResult.addedToBank = true;
        }
    }

    function overrideStep2AsCorrect() {
        if (!currentResult || currentResult.overridden || currentResult.step2Correct) return;
        const target = currentResult.target;

        currentResult.step2Correct = true;
        currentResult.overridden = true;

        const inputEl = document.getElementById("meaning-input");
        if (inputEl) {
            inputEl.className = "flex-grow px-4 py-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/60 text-emerald-900 font-medium text-sm sm:text-base";
        }

        // Flip score only if Step 1 was also passed (or skipped for Kana-only words)
        if (currentResult.step1Correct) {
            wrongCount = Math.max(0, wrongCount - 1);
            correctCount++;
            wrongItems = wrongItems.filter((item) => item.id !== target.id);
            Storage.addMasteredId(target.id);

            if (currentSessionMeta.isMistakeBank) {
                Storage.removeWrongId(target.id);
                currentResult.graduatedFromBank = true;
                currentResult.addedToBank = false;
            } else if (!currentResult.wasInMistakeBankBefore) {
                Storage.removeWrongId(target.id);
                currentResult.addedToBank = false;
            }
        }

        renderExplanation();
        updateStats();
    }

    function renderExplanation() {
        const q = quizQuestions[currentIndex];
        const target = currentResult.target;
        const isStep1Ok = currentResult.step1Correct;
        const isStep2Ok = currentResult.step2Correct;
        const userInput = currentResult.userInput;

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

        if (q.mode === "context_fill") {
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
                resTitle.textContent = currentResult.overridden
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
        if (currentResult.graduatedFromBank) {
            bankStatusEl.classList.remove("hidden");
            bankStatusEl.className = "inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 mb-3";
            bankStatusEl.textContent = "🎓 Đã xóa nợ khỏi Sổ tay từ sai!";
        } else if (currentResult.addedToBank) {
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
                const suffix = currentResult.overridden
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

            // Show manual override button only when Step 2 failed & not yet overridden
            overrideBtn.classList.toggle("hidden", isStep2Ok || currentResult.overridden);
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
            currentIndex === quizQuestions.length - 1 ? "Xem kết quả" : "Câu tiếp theo";

        setTimeout(() => {
            expCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 80);
    }

    function nextQuestion() {
        currentIndex++;
        if (currentIndex < quizQuestions.length) {
            updateStats();
            renderQuestion();
        } else {
            showSummary();
        }
    }

    // ==================== SUMMARY SCREEN ====================

    function showSummary() {
        if (currentSessionMeta.batchKey) {
            Storage.recordBatchCompletion(currentSessionMeta.batchKey, correctCount, quizQuestions.length);
        }

        showScreen("summary-screen");

        document.getElementById("summary-unit-name").textContent = currentSessionMeta.label;
        document.getElementById("sum-total").textContent = quizQuestions.length;
        document.getElementById("sum-correct").textContent = correctCount;
        document.getElementById("sum-wrong").textContent = wrongCount;

        const pct = quizQuestions.length > 0 ? Math.round((correctCount / quizQuestions.length) * 100) : 0;
        document.getElementById("sum-accuracy").textContent = `Độ chính xác: ${pct}%`;

        const wrongSection = document.getElementById("wrong-review-section");
        const wrongList = document.getElementById("wrong-list");
        const retryWrongBtn = document.getElementById("retry-wrong-btn");

        if (wrongItems.length > 0) {
            wrongSection.classList.remove("hidden");
            retryWrongBtn.classList.remove("hidden");
            wrongList.innerHTML = wrongItems.map((item) => `
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

    function retryWrong() {
        if (wrongItems.length === 0) return;
        const retrySet = [...wrongItems];
        launchQuiz(retrySet, {
            label: `Ôn lại câu sai (${retrySet.length} từ)`,
            batchKey: null,
            isMistakeBank: currentSessionMeta.isMistakeBank,
            sourceItems: retrySet
        });
    }

    function restartCurrentSession() {
        if (currentSessionMeta.isMistakeBank) {
            startMistakeBankQuiz();
            return;
        }
        if (currentSessionMeta.sourceItems && currentSessionMeta.sourceItems.length > 0) {
            launchQuiz(currentSessionMeta.sourceItems, currentSessionMeta);
            return;
        }
        renderHome();
    }

    function backToMenu() {
        renderHome();
    }

    // ==================== MISTAKE BANK SCREEN ====================

    function openMistakeBank() {
        mistakeSearchQuery = "";
        const searchInput = document.getElementById("mistake-search-input");
        if (searchInput) searchInput.value = "";
        showScreen("mistake-bank-screen");
        renderMistakeBankList();
    }

    function renderMistakeBankList() {
        const wrongIds = Storage.getWrongIds();
        const items = wrongIds.map((id) => VOCAB_BY_ID.get(id)).filter(Boolean);

        const countBadge = document.getElementById("mistake-page-count");
        const startAllBtn = document.getElementById("mistake-page-start-btn");
        const clearAllBtn = document.getElementById("mistake-page-clear-btn");
        const listEl = document.getElementById("mistake-bank-list");
        const emptyEl = document.getElementById("mistake-bank-empty");

        countBadge.textContent = `${items.length} từ`;
        startAllBtn.disabled = items.length === 0;
        clearAllBtn.disabled = items.length === 0;

        if (items.length === 0) {
            listEl.innerHTML = "";
            emptyEl.classList.remove("hidden");
            return;
        }

        emptyEl.classList.add("hidden");
        const qNorm = Engine.normalizeVi(mistakeSearchQuery);
        const filtered = qNorm
            ? items.filter((item) =>
                item.word.toLowerCase().includes(mistakeSearchQuery.toLowerCase()) ||
                item.reading.includes(mistakeSearchQuery) ||
                Engine.normalizeVi(item.meaning).includes(qNorm)
            )
            : items;

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-sm text-slate-500">Không tìm thấy từ nào khớp với "${escapeHtml(mistakeSearchQuery)}".</div>`;
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
        const count = Storage.getWrongIds().length;
        if (count === 0) return;
        if (!global.confirm(`Bạn có chắc muốn xóa toàn bộ ${count} từ khỏi Sổ tay từ sai không?`)) return;
        Storage.clearWrongIds();
        renderMistakeBankList();
    }

    // ==================== BACKUP / RESTORE MODAL ====================

    function openBackupModal() {
        const modal = document.getElementById("backup-modal");
        const statusEl = document.getElementById("backup-status-msg");
        if (statusEl) {
            statusEl.classList.add("hidden");
            statusEl.textContent = "";
        }
        if (modal) modal.classList.remove("hidden");
    }

    function closeBackupModal() {
        const modal = document.getElementById("backup-modal");
        if (modal) modal.classList.add("hidden");
    }

    function downloadBackup() {
        const json = Storage.exportBackup();
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `mimikara-n3-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showBackupStatus("Đã tải xuống tệp sao lưu thành công!", true);
    }

    function handleImportFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const summary = Storage.importBackup(e.target.result);
                studyMode = Storage.getStudyMode();
                renderHome();
                showBackupStatus(
                    `Khôi phục thành công! (${summary.masteredCount} từ đã nắm, ${summary.wrongCount} từ trong sổ tay, ${summary.batchCount} chặng).`,
                    true
                );
            } catch (err) {
                showBackupStatus(err.message || "Không thể đọc tệp sao lưu.", false);
            } finally {
                event.target.value = "";
            }
        };
        reader.readAsText(file, "UTF-8");
    }

    function showBackupStatus(message, isSuccess) {
        const statusEl = document.getElementById("backup-status-msg");
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.classList.remove("hidden", "bg-emerald-50", "text-emerald-700", "border-emerald-200", "bg-rose-50", "text-rose-700", "border-rose-200");
        if (isSuccess) {
            statusEl.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-200");
        } else {
            statusEl.classList.add("bg-rose-50", "text-rose-700", "border-rose-200");
        }
    }

    // ==================== TTS & KEYBOARD SHORTCUTS ====================

    function speakSpecific(reading) {
        if (!("speechSynthesis" in global) || !reading) return;
        global.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(reading);
        utterance.lang = "ja-JP";
        utterance.rate = 0.95;
        global.speechSynthesis.speak(utterance);
    }

    function speakWord() {
        speakSpecific(currentAudioReading);
    }

    function setupKeyboardShortcuts() {
        document.addEventListener("keydown", (e) => {
            const quizScreen = document.getElementById("quiz-screen");
            if (!quizScreen || quizScreen.classList.contains("hidden")) return;

            const activeTag = document.activeElement ? document.activeElement.tagName : "";
            const isTypingInField = activeTag === "INPUT" || activeTag === "TEXTAREA";

            if (quizStep === 1 && !isTypingInField && ["1", "2", "3", "4"].includes(e.key)) {
                e.preventDefault();
                const idx = parseInt(e.key, 10) - 1;
                selectOption(idx);
                return;
            }

            if ((quizStep === 1 || quizStep === 3) && !isTypingInField && (e.key === "r" || e.key === "R")) {
                e.preventDefault();
                speakWord();
                return;
            }

            if (quizStep === 2 && e.key === "Enter") {
                e.preventDefault();
                submitStep2();
                return;
            }

            if (quizStep === 3 && e.key === "Enter") {
                if (activeTag === "BUTTON" && document.activeElement.id !== "next-btn") {
                    return;
                }
                e.preventDefault();
                nextQuestion();
            }
        });
    }

    global.MimiApp = {
        setStudyMode,
        startBatchQuiz,
        startUnitAllQuiz,
        startGlobalRandomQuiz,
        startMistakeBankQuiz,
        selectOption,
        submitStep2,
        overrideStep2AsCorrect,
        nextQuestion,
        retryWrong,
        restartCurrentSession,
        backToMenu,
        openMistakeBank,
        removeFromMistakeBank,
        clearAllMistakeBank,
        openBackupModal,
        closeBackupModal,
        downloadBackup,
        speakWord,
        speakSpecific
    };

    global.addEventListener("DOMContentLoaded", init);
})(window);
