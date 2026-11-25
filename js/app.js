(function (global) {
    const Storage = global.MimiStorage;
    const AppState = global.MimiAppState;
    const Audio = global.MimiAudio;
    const HomeView = global.MimiHomeView;
    const Quiz = global.MimiQuizController;
    const Summary = global.MimiSummaryView;
    const MistakeBank = global.MimiMistakeBank;
    const Backup = global.MimiBackupModal;

    function init() {
        AppState.initData();
        AppState.state.studyMode = Storage.getStudyMode();
        HomeView.renderHome();
        Audio.setupKeyboardShortcuts();
        MistakeBank.setupMistakeSearchListener();
        Backup.setupBackupListener();
    }

    global.MimiApp = {
        // Home / Mode
        setStudyMode: HomeView.setStudyMode,

        // Quiz flow
        startBatchQuiz: Quiz.startBatchQuiz,
        startUnitAllQuiz: Quiz.startUnitAllQuiz,
        startGlobalRandomQuiz: Quiz.startGlobalRandomQuiz,
        startMistakeBankQuiz: Quiz.startMistakeBankQuiz,
        selectOption: Quiz.selectOption,
        submitStep2: Quiz.submitStep2,
        overrideStep2AsCorrect: Quiz.overrideStep2AsCorrect,
        nextQuestion: Quiz.nextQuestion,

        // Summary
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
        speakSpecific: Audio.speakSpecific
    };

    global.addEventListener("DOMContentLoaded", init);
})(window);
