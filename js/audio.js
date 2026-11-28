(function (global) {
    const { state } = global.MimiAppState;
    const NORMAL_RATE = 0.95;
    const SLOW_RATE = 0.6;
    let activePlayId = 0;
    let autoplayWatchdog = null;

    function clearWatchdog() {
        if (autoplayWatchdog) {
            clearTimeout(autoplayWatchdog);
            autoplayWatchdog = null;
        }
    }

    function speakSpecific(reading, options) {
        const opts = options && typeof options === "object" ? options : {};
        const rate = typeof opts.rate === "number" && opts.rate > 0 ? opts.rate : NORMAL_RATE;
        clearWatchdog();

        if (!reading) {
            return { supported: true, started: false };
        }

        if (!("speechSynthesis" in global) || typeof global.SpeechSynthesisUtterance === "undefined") {
            if (typeof opts.onUnsupported === "function") opts.onUnsupported();
            return { supported: false, started: false };
        }

        const playId = ++activePlayId;
        let didStart = false;
        let didSettle = false;

        try {
            global.speechSynthesis.cancel();
            const utterance = new global.SpeechSynthesisUtterance(reading);
            utterance.lang = "ja-JP";
            utterance.rate = rate;

            utterance.onstart = () => {
                if (playId !== activePlayId) return;
                didStart = true;
                clearWatchdog();
                if (typeof opts.onStart === "function") opts.onStart(rate);
            };

            utterance.onend = () => {
                if (playId !== activePlayId) return;
                didSettle = true;
                clearWatchdog();
                if (typeof opts.onEnd === "function") opts.onEnd(rate);
            };

            utterance.onerror = (event) => {
                if (playId !== activePlayId) return;
                didSettle = true;
                clearWatchdog();
                const errCode = event && event.error ? String(event.error) : "unknown";
                if (errCode === "canceled" || errCode === "interrupted") return;
                if (errCode === "not-allowed" && typeof opts.onBlocked === "function") {
                    opts.onBlocked(errCode);
                } else if (typeof opts.onError === "function") {
                    opts.onError(errCode);
                }
            };

            global.speechSynthesis.speak(utterance);

            if (opts.isAuto && typeof opts.onBlocked === "function") {
                autoplayWatchdog = setTimeout(() => {
                    if (playId !== activePlayId || didStart || didSettle) return;
                    const isSpeaking = Boolean(global.speechSynthesis && global.speechSynthesis.speaking);
                    if (!isSpeaking) {
                        opts.onBlocked("autoplay-timeout");
                    }
                }, 850);
            }

            return { supported: true, started: true };
        } catch (err) {
            clearWatchdog();
            if (opts.isAuto && typeof opts.onBlocked === "function") {
                opts.onBlocked("exception");
            } else if (typeof opts.onError === "function") {
                opts.onError("exception");
            }
            return { supported: true, started: false };
        }
    }

    function speakWord(options) {
        return speakSpecific(state.currentAudioReading, options);
    }

    function speakWordSlow(options) {
        const opts = options && typeof options === "object" ? options : {};
        return speakSpecific(state.currentAudioReading, { ...opts, rate: SLOW_RATE });
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
                const q = state.quizQuestions[state.currentIndex];
                if (q && q.mode === "listen_meaning" && global.MimiQuizController && typeof global.MimiQuizController.playListenAudio === "function") {
                    global.MimiQuizController.playListenAudio(false);
                } else {
                    speakWord();
                }
                return;
            }

            if ((state.quizStep === 1 || state.quizStep === 3) && !isTypingInField && (e.key === "s" || e.key === "S")) {
                const q = state.quizQuestions[state.currentIndex];
                if (q && q.mode === "listen_meaning" && global.MimiQuizController && typeof global.MimiQuizController.playListenAudio === "function") {
                    e.preventDefault();
                    global.MimiQuizController.playListenAudio(true);
                }
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
        NORMAL_RATE,
        SLOW_RATE,
        speakSpecific,
        speakWord,
        speakWordSlow,
        setupKeyboardShortcuts
    };
})(window);
