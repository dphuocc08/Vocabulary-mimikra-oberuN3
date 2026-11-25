(function (global) {
    const Storage = global.MimiStorage;
    const { state, escapeHtml, showScreen } = global.MimiAppState;

    function showSummary() {
        if (state.currentSessionMeta.batchKey) {
            Storage.recordBatchCompletion(
                state.currentSessionMeta.batchKey,
                state.correctCount,
                state.quizQuestions.length
            );
        }

        showScreen("summary-screen");

        document.getElementById("summary-unit-name").textContent = state.currentSessionMeta.label;
        document.getElementById("sum-total").textContent = state.quizQuestions.length;
        document.getElementById("sum-correct").textContent = state.correctCount;
        document.getElementById("sum-wrong").textContent = state.wrongCount;

        const pct = state.quizQuestions.length > 0
            ? Math.round((state.correctCount / state.quizQuestions.length) * 100)
            : 0;
        document.getElementById("sum-accuracy").textContent = `Độ chính xác: ${pct}%`;

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

    function retryWrong() {
        if (state.wrongItems.length === 0) return;
        const retrySet = [...state.wrongItems];
        global.MimiQuizController.launchQuiz(retrySet, {
            label: `Ôn lại câu sai (${retrySet.length} từ)`,
            batchKey: null,
            isMistakeBank: state.currentSessionMeta.isMistakeBank,
            sourceItems: retrySet
        });
    }

    function restartCurrentSession() {
        if (state.currentSessionMeta.isMistakeBank) {
            global.MimiQuizController.startMistakeBankQuiz();
            return;
        }
        if (state.currentSessionMeta.sourceItems && state.currentSessionMeta.sourceItems.length > 0) {
            global.MimiQuizController.launchQuiz(state.currentSessionMeta.sourceItems, state.currentSessionMeta);
            return;
        }
        global.MimiHomeView.renderHome();
    }

    function backToMenu() {
        global.MimiHomeView.renderHome();
    }

    global.MimiSummaryView = {
        showSummary,
        retryWrong,
        restartCurrentSession,
        backToMenu
    };
})(window);
