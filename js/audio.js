(function (global) {
    const { state } = global.MimiAppState;

    function speakSpecific(reading) {
        if (!("speechSynthesis" in global) || !reading) return;
        global.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(reading);
        utterance.lang = "ja-JP";
        utterance.rate = 0.95;
        global.speechSynthesis.speak(utterance);
    }

    function speakWord() {
        speakSpecific(state.currentAudioReading);
    }

    function setupKeyboardShortcuts() {
        document.addEventListener("keydown", (e) => {
            const quizScreen = document.getElementById("quiz-screen");
            if (!quizScreen || quizScreen.classList.contains("hidden")) return;

            const activeTag = document.activeElement ? document.activeElement.tagName : "";
            const isTypingInField = activeTag === "INPUT" || activeTag === "TEXTAREA";

            if (state.quizStep === 1 && !isTypingInField && ["1", "2", "3", "4"].includes(e.key)) {
                e.preventDefault();
                const idx = parseInt(e.key, 10) - 1;
                global.MimiQuizController.selectOption(idx);
                return;
            }

            if ((state.quizStep === 1 || state.quizStep === 3) && !isTypingInField && (e.key === "r" || e.key === "R")) {
                e.preventDefault();
                speakWord();
                return;
            }

            if (state.quizStep === 2 && e.key === "Enter") {
                e.preventDefault();
                global.MimiQuizController.submitStep2();
                return;
            }

            if (state.quizStep === 3 && e.key === "Enter") {
                if (activeTag === "BUTTON" && document.activeElement.id !== "next-btn") {
                    return;
                }
                e.preventDefault();
                global.MimiQuizController.nextQuestion();
            }
        });
    }

    global.MimiAudio = {
        speakSpecific,
        speakWord,
        setupKeyboardShortcuts
    };
})(window);
