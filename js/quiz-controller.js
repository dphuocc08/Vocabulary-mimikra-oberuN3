(function (global) {
    const Storage = global.MimiStorage;
    const Engine = global.MimiQuizEngine;
    const { state, escapeHtml, showScreen } = global.MimiAppState;

    function startBatchQuiz(unitId, partName) {
        const unit = state.units.find((u) => u.id === unitId);
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
        const unit = state.units.find((u) => u.id === unitId);
        if (!unit || unit.items.length === 0) return;

        launchQuiz(unit.items, {
            label: `${unit.code} • Toàn bộ (${unit.items.length} từ)`,
            batchKey: `${unit.id}::ALL`,
            isMistakeBank: false,
            sourceItems: unit.items
        });
    }

    function startGlobalRandomQuiz(count = 20) {
        const levelVocab = global.MimiAppState.getCurrentLevelVocab();
        const meta = global.MimiAppState.getCurrentLevelMeta();
        if (levelVocab.length === 0) return;
        const picked = Engine.shuffle(levelVocab).slice(0, Math.min(count, levelVocab.length));

        launchQuiz(picked, {
            label: `Ôn tổng hợp ${meta.code} (${picked.length} từ)`,
            batchKey: null,
            isMistakeBank: false,
            sourceItems: picked
        });
    }

    function startMistakeBankQuiz() {
        const levelVocabIds = new Set(global.MimiAppState.getCurrentLevelVocab().map((v) => v.id));
        const meta = global.MimiAppState.getCurrentLevelMeta();
        const items = Storage.getWrongIds()
            .filter((id) => levelVocabIds.has(id))
            .map((id) => state.vocabById.get(id))
            .filter(Boolean);

        if (items.length === 0) return;

        launchQuiz(items, {
            label: `📕 Sổ tay từ sai ${meta.code} (${items.length} từ)`,
            batchKey: null,
            isMistakeBank: true,
            sourceItems: items
        });
    }

    function launchQuiz(items, meta) {
        const distractorPool = global.MimiAppState.getCurrentLevelVocab();
        state.quizQuestions = Engine.buildQuestions(
            items,
            distractorPool.length >= 4 ? distractorPool : state.allVocab,
            state.studyMode
        );
        state.currentIndex = 0;
        state.correctCount = 0;
        state.wrongCount = 0;
        state.wrongItems = [];
        state.currentSessionMeta = meta;

        showScreen("quiz-screen");

        document.getElementById("current-unit-badge").textContent = meta.label;
        document.getElementById("current-mode-badge").textContent =
            state.studyMode === "context_fill" ? "Điền từ ngữ cảnh" : "2 Bước: Kanji → Nghĩa";

        updateStats();
        renderQuestion();
    }

    function updateStats() {
        document.getElementById("score-correct").textContent = `✓ ${state.correctCount}`;
        document.getElementById("score-wrong").textContent = `✕ ${state.wrongCount}`;
        document.getElementById("question-counter").textContent =
            `${Math.min(state.currentIndex + 1, state.quizQuestions.length)}/${state.quizQuestions.length}`;
        const pct = state.quizQuestions.length > 0 ? (state.currentIndex / state.quizQuestions.length) * 100 : 0;
        document.getElementById("progress-bar").style.width = `${pct}%`;
    }

    function renderQuestion() {
        const q = state.quizQuestions[state.currentIndex];
        const target = q.target;
        state.currentAudioReading = Engine.getPrimaryReading(target.reading);

        state.currentResult = {
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
            state.quizStep = 1;
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
            state.quizStep = 1;
            state.currentResult.step1Correct = false;
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
            state.quizStep = 2;
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

            revealStep2(target, true, true);
            global.MimiAudio.speakWord();
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
        if (state.quizStep !== 1) return;
        const q = state.quizQuestions[state.currentIndex];
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
            return;
        }

        // Mode 1 Step 1 completed -> move to Step 2
        state.quizStep = 2;
        state.currentResult.step1Correct = isCorrect;
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
        if (state.quizStep !== 2) return;
        state.quizStep = 3;

        const q = state.quizQuestions[state.currentIndex];
        const target = q.target;
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

        renderExplanation();
        updateStats();
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
            renderQuestion();
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
        selectOption,
        submitStep2,
        overrideStep2AsCorrect,
        nextQuestion
    };
})(window);
