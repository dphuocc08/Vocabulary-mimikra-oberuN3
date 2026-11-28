(function (global) {
    const Storage = global.MimiStorage;
    const AppState = global.MimiAppState;
    const Audio = global.MimiAudio;
    const Theme = global.MimiTheme;
    const GlobalSearch = global.MimiGlobalSearch;
    const GrammarView = global.MimiGrammarView;
    const HomeView = global.MimiHomeView;
    const BatchPreview = global.MimiBatchPreview;
    const Quiz = global.MimiQuizController;
    const Summary = global.MimiSummaryView;
    const MistakeBank = global.MimiMistakeBank;
    const Backup = global.MimiBackupModal;

    async function init() {
        if (Theme && typeof Theme.init === "function") {
            Theme.init();
        }
        AppState.state.studyMode = Storage.getStudyMode();
        const savedLevel = Storage.getSelectedLevel();
        HomeView.renderLoadingState(savedLevel);
        try {
            await AppState.loadLevel(savedLevel);
            HomeView.renderHome();
        } catch (err) {
            console.error(err);
            const container = document.getElementById("units-container");
            if (container) {
                container.innerHTML = `
                    <div class="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2">
                        <div class="font-bold text-amber-900">Không thể tải tệp dữ liệu JSON</div>
                        <p class="text-sm text-amber-800">Trình duyệt chặn đọc tệp JSON khi mở trực tiếp bằng <code>file://</code>. Hãy chạy bằng máy chủ cục bộ (ví dụ: <code>npx serve .</code> hoặc VS Code Live Server).</p>
                    </div>
                `;
            }
        }
        Audio.setupKeyboardShortcuts();
        if (HomeView && typeof HomeView.setupN3TabKeyboard === "function") {
            HomeView.setupN3TabKeyboard();
        }
        if (Quiz && typeof Quiz.setupPersistenceListeners === "function") {
            Quiz.setupPersistenceListeners();
        }
        if (GlobalSearch && typeof GlobalSearch.setupGlobalSearchListener === "function") {
            GlobalSearch.setupGlobalSearchListener();
        }
        MistakeBank.setupMistakeSearchListener();
        Backup.setupBackupListener();
    }

    global.MimiApp = {
        // Theme & PWA
        toggleTheme: Theme ? Theme.toggleTheme : function () {},
        installPwa: Theme ? Theme.installPwa : function () {},

        // Global Search
        setGlobalSearchLevel: GlobalSearch ? GlobalSearch.setGlobalSearchLevel : function () {},
        clearGlobalSearch: GlobalSearch ? GlobalSearch.clearGlobalSearch : function () {},

        // Home / Library / Level / Mode / Grammar
        selectLevel: HomeView.selectLevel,
        selectLevelFromHeader: HomeView.selectLevelFromHeader,
        selectN3Tab: HomeView.selectN3Tab,
        jumpToLibrarySection: HomeView.jumpToLibrarySection,
        focusGlobalSearch: HomeView.focusGlobalSearch,
        scrollToUnit: HomeView.scrollToUnit,
        setStudyMode: HomeView.setStudyMode,
        openGrammarLesson: GrammarView ? GrammarView.openGrammarLesson : function () {},
        selectGrammarChoice: GrammarView ? GrammarView.selectGrammarChoice : function () {},

        // Batch preview
        openBatchPreview: BatchPreview ? BatchPreview.openBatchPreview : function () {},
        startQuizFromPreview: BatchPreview ? BatchPreview.startQuizFromPreview : function () {},
        closeBatchPreview: BatchPreview ? BatchPreview.closeBatchPreview : function () {},

        // Quiz flow
        startBatchQuiz: Quiz.startBatchQuiz,
        startUnitAllQuiz: Quiz.startUnitAllQuiz,
        startGlobalRandomQuiz: Quiz.startGlobalRandomQuiz,
        startMistakeBankQuiz: Quiz.startMistakeBankQuiz,
        resumeSavedSession: Quiz.resumeSavedSession,
        playListenAudio: Quiz.playListenAudio,
        selectOption: Quiz.selectOption,
        toggleStep2Hiragana: Quiz.toggleStep2Hiragana,
        submitStep2: Quiz.submitStep2,
        overrideStep2AsCorrect: Quiz.overrideStep2AsCorrect,
        nextQuestion: Quiz.nextQuestion,

        // Summary & Session Review
        startNextBatchFromSummary: Summary.startNextBatchFromSummary,
        previewNextBatchFromSummary: Summary.previewNextBatchFromSummary,
        openSessionReview: Summary.openSessionReview,
        closeSessionReview: Summary.closeSessionReview,
        setSessionReviewFilter: Summary.setSessionReviewFilter,
        retryWrong: Summary.retryWrong,
        restartCurrentSession: Summary.restartCurrentSession,
        backToMenu: Summary.backToMenu,

        // Mistake bank
        openMistakeBank: MistakeBank.openMistakeBank,
        removeFromMistakeBank: MistakeBank.removeFromMistakeBank,
        clearAllMistakeBank: MistakeBank.clearAllMistakeBank,

        // Backup modal
        openBackupModal: Backup.openBackupModal,
        closeBackupModal: Backup.closeBackupModal,
        downloadBackup: Backup.downloadBackup,

        // Audio
        speakWord: Audio.speakWord,
        speakWordSlow: Audio.speakWordSlow,
        speakSpecific: Audio.speakSpecific
    };

    global.addEventListener("DOMContentLoaded", init);
})(window);
