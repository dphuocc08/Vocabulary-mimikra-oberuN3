(function (global) {
    const KEYS = {
        WRONG_IDS: "mimi_n3_wrong_vocab_ids",
        MASTERED_IDS: "mimi_n3_mastered_ids",
        COMPLETED_BATCHES: "mimi_n3_completed_batches",
        STUDY_MODE: "mimi_n3_study_mode",
        SELECTED_LEVEL: "mimi_selected_level",
        THEME: "mimi_theme",
        ACTIVE_SESSION: "mimi_active_batch_session",
        LAST_COMPLETED_BATCH: "mimi_last_completed_batch"
    };

    const VALID_MODES = new Set(["two_step", "context_fill", "listen_meaning"]);
    const VALID_LEVELS = new Set(["n5", "n4", "n3", "n2"]);
    const VALID_THEMES = new Set(["light", "dark"]);
    const ACTIVE_SESSION_VERSION = 1;

    function safeGetItem(key) {
        try {
            if (typeof global.localStorage === "undefined") return null;
            return global.localStorage.getItem(key);
        } catch (err) {
            return null;
        }
    }

    function safeSetItem(key, value) {
        try {
            if (typeof global.localStorage === "undefined") return false;
            global.localStorage.setItem(key, value);
            return true;
        } catch (err) {
            return false;
        }
    }

    function safeRemoveItem(key) {
        try {
            if (typeof global.localStorage === "undefined") return false;
            global.localStorage.removeItem(key);
            return true;
        } catch (err) {
            return false;
        }
    }

    function readJson(key, fallback) {
        const raw = safeGetItem(key);
        if (!raw) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return parsed ?? fallback;
        } catch (err) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            return safeSetItem(key, JSON.stringify(value));
        } catch (err) {
            return false;
        }
    }

    function sanitizeIdArray(arr) {
        if (!Array.isArray(arr)) return [];
        const seen = new Set();
        const result = [];
        for (const val of arr) {
            const num = Number(val);
            if (Number.isInteger(num) && num > 0 && !seen.has(num)) {
                seen.add(num);
                result.push(num);
            }
        }
        return result;
    }

    function getWrongIds() {
        return sanitizeIdArray(readJson(KEYS.WRONG_IDS, []));
    }

    function addWrongId(id) {
        const numId = Number(id);
        if (!Number.isInteger(numId) || numId <= 0) return getWrongIds();
        const ids = getWrongIds();
        if (!ids.includes(numId)) {
            ids.push(numId);
            writeJson(KEYS.WRONG_IDS, ids);
        }
        return ids;
    }

    function removeWrongId(id) {
        const numId = Number(id);
        const ids = getWrongIds().filter((item) => item !== numId);
        writeJson(KEYS.WRONG_IDS, ids);
        return ids;
    }

    function clearWrongIds() {
        writeJson(KEYS.WRONG_IDS, []);
        return [];
    }

    function isWrongId(id) {
        const numId = Number(id);
        return getWrongIds().includes(numId);
    }

    function getMasteredIds() {
        return sanitizeIdArray(readJson(KEYS.MASTERED_IDS, []));
    }

    function addMasteredId(id) {
        const numId = Number(id);
        if (!Number.isInteger(numId) || numId <= 0) return getMasteredIds();
        const ids = getMasteredIds();
        if (!ids.includes(numId)) {
            ids.push(numId);
            writeJson(KEYS.MASTERED_IDS, ids);
        }
        return ids;
    }

    function getCompletedBatches() {
        const data = readJson(KEYS.COMPLETED_BATCHES, {});
        if (!data || typeof data !== "object" || Array.isArray(data)) return {};
        return data;
    }

    function recordBatchCompletion(batchKey, correct, total) {
        if (!batchKey || !total || total <= 0) return getCompletedBatches();
        const batches = getCompletedBatches();
        const pct = Math.round((correct / total) * 100);
        const prev = batches[batchKey];
        const bestPct = prev && typeof prev.bestPct === "number"
            ? Math.max(prev.bestPct, pct)
            : pct;

        batches[batchKey] = {
            bestPct,
            lastPlayedAt: new Date().toISOString(),
            total
        };
        writeJson(KEYS.COMPLETED_BATCHES, batches);
        return batches;
    }

    function getStudyMode() {
        const mode = safeGetItem(KEYS.STUDY_MODE);
        return VALID_MODES.has(mode) ? mode : "two_step";
    }

    function setStudyMode(mode) {
        const nextMode = VALID_MODES.has(mode) ? mode : "two_step";
        safeSetItem(KEYS.STUDY_MODE, nextMode);
        return nextMode;
    }

    function getSelectedLevel() {
        const lvl = safeGetItem(KEYS.SELECTED_LEVEL);
        return VALID_LEVELS.has(lvl) ? lvl : "n3";
    }

    function setSelectedLevel(levelId) {
        const nextLevel = VALID_LEVELS.has(levelId) ? levelId : "n3";
        safeSetItem(KEYS.SELECTED_LEVEL, nextLevel);
        return nextLevel;
    }

    function getTheme() {
        const saved = safeGetItem(KEYS.THEME);
        return VALID_THEMES.has(saved) ? saved : null;
    }

    function setTheme(theme) {
        const nextTheme = VALID_THEMES.has(theme) ? theme : "light";
        safeSetItem(KEYS.THEME, nextTheme);
        return nextTheme;
    }

    function isNonEmptyString(val) {
        return typeof val === "string" && val.trim().length > 0;
    }

    function sanitizeActiveSession(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        if (raw.version !== ACTIVE_SESSION_VERSION) return null;

        const levelId = isNonEmptyString(raw.levelId) ? raw.levelId.trim().toLowerCase() : "";
        const unitId = isNonEmptyString(raw.unitId) ? raw.unitId.trim() : "";
        const part = isNonEmptyString(raw.part) ? raw.part.trim() : "";
        const studyMode = VALID_MODES.has(raw.studyMode) ? raw.studyMode : null;
        if (!VALID_LEVELS.has(levelId) || !unitId || !part || !studyMode) return null;

        if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;

        const cleanQuestions = [];
        for (const q of raw.questions) {
            if (!q || typeof q !== "object") return null;
            const targetId = Number(q.targetId);
            if (!Number.isInteger(targetId) || targetId <= 0) return null;

            const qMode = VALID_MODES.has(q.mode) ? q.mode : null;
            if (qMode !== studyMode) return null;

            const needsStep1 = studyMode === "two_step" ? Boolean(q.needsStep1) : false;
            const rawOptions = Array.isArray(q.options) ? q.options : [];
            const cleanOptions = [];
            for (const opt of rawOptions) {
                if (!opt || typeof opt !== "object" || !isNonEmptyString(opt.text)) return null;
                cleanOptions.push({
                    text: opt.text,
                    isCorrect: Boolean(opt.isCorrect)
                });
            }

            if (studyMode === "context_fill" || studyMode === "listen_meaning" || needsStep1) {
                if (cleanOptions.length < 2 || !cleanOptions.some((o) => o.isCorrect)) {
                    return null;
                }
            }

            cleanQuestions.push({
                targetId,
                mode: qMode,
                needsStep1,
                options: cleanOptions
            });
        }

        const total = cleanQuestions.length;
        const currentIndex = Number(raw.currentIndex);
        if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= total) {
            return null;
        }

        const quizStep = Number(raw.quizStep);
        if (!Number.isInteger(quizStep) || quizStep < 1 || quizStep > 3) {
            return null;
        }

        const currentQ = cleanQuestions[currentIndex];
        if ((studyMode === "context_fill" || studyMode === "listen_meaning") && quizStep === 2) return null;
        if (studyMode === "two_step" && !currentQ.needsStep1 && quizStep === 1) return null;

        const correctCount = Number(raw.correctCount);
        const wrongCount = Number(raw.wrongCount);
        if (
            !Number.isInteger(correctCount) || correctCount < 0 || correctCount > total ||
            !Number.isInteger(wrongCount) || wrongCount < 0 || wrongCount > total ||
            correctCount + wrongCount > total
        ) {
            return null;
        }

        const rawQState = raw.currentQuestionState && typeof raw.currentQuestionState === "object"
            ? raw.currentQuestionState
            : {};

        let selectedOptionIndex = null;
        if (rawQState.selectedOptionIndex !== null && rawQState.selectedOptionIndex !== undefined) {
            const idx = Number(rawQState.selectedOptionIndex);
            if (!Number.isInteger(idx) || idx < 0 || idx >= currentQ.options.length) {
                return null;
            }
            selectedOptionIndex = idx;
        }

        const needsSelectedOption =
            ((studyMode === "context_fill" || studyMode === "listen_meaning") && quizStep === 3) ||
            (studyMode === "two_step" && currentQ.needsStep1 && quizStep >= 2);
        if (needsSelectedOption && selectedOptionIndex === null) {
            return null;
        }

        const cleanAnswerHistory = [];
        if (Array.isArray(raw.answerHistory)) {
            const seenIdx = new Set();
            for (const entry of raw.answerHistory) {
                if (!entry || typeof entry !== "object") continue;
                const entryIndex = Number(entry.index);
                const entryTargetId = Number(entry.targetId);
                if (
                    !Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= total ||
                    seenIdx.has(entryIndex) ||
                    !Number.isInteger(entryTargetId) || entryTargetId <= 0
                ) {
                    continue;
                }
                const entryMode = VALID_MODES.has(entry.mode) ? entry.mode : studyMode;
                const entrySelIdx = Number.isInteger(Number(entry.selectedOptionIndex)) && entry.selectedOptionIndex !== null
                    ? Number(entry.selectedOptionIndex)
                    : null;
                seenIdx.add(entryIndex);
                cleanAnswerHistory.push({
                    index: entryIndex,
                    targetId: entryTargetId,
                    mode: entryMode,
                    needsStep1: entryMode === "two_step" ? Boolean(entry.needsStep1) : false,
                    isCorrect: Boolean(entry.isCorrect),
                    selectedOptionIndex: entrySelIdx,
                    selectedOptionText: typeof entry.selectedOptionText === "string" ? entry.selectedOptionText : "",
                    correctOptionText: typeof entry.correctOptionText === "string" ? entry.correctOptionText : "",
                    step1Correct: Boolean(entry.step1Correct),
                    step2Correct: entry.step2Correct === undefined ? true : Boolean(entry.step2Correct),
                    userInput: typeof entry.userInput === "string" ? entry.userInput : "",
                    overridden: Boolean(entry.overridden)
                });
            }
            cleanAnswerHistory.sort((a, b) => a.index - b.index);
        }

        return {
            version: ACTIVE_SESSION_VERSION,
            levelId,
            levelCode: isNonEmptyString(raw.levelCode) ? raw.levelCode.trim() : levelId.toUpperCase(),
            unitId,
            unitCode: isNonEmptyString(raw.unitCode) ? raw.unitCode.trim() : unitId,
            part,
            partTitle: typeof raw.partTitle === "string" ? raw.partTitle : "",
            batchKey: isNonEmptyString(raw.batchKey) ? raw.batchKey.trim() : `${unitId}::${part}`,
            label: isNonEmptyString(raw.label) ? raw.label.trim() : `${unitId} • ${part}`,
            studyMode,
            questions: cleanQuestions,
            currentIndex,
            correctCount,
            wrongCount,
            wrongItemIds: sanitizeIdArray(raw.wrongItemIds),
            answerHistory: cleanAnswerHistory,
            quizStep,
            currentQuestionState: {
                selectedOptionIndex,
                step1Correct: Boolean(rawQState.step1Correct),
                step2Correct: rawQState.step2Correct === undefined ? true : Boolean(rawQState.step2Correct),
                userInput: typeof rawQState.userInput === "string" ? rawQState.userInput : "",
                wasInMistakeBankBefore: Boolean(rawQState.wasInMistakeBankBefore),
                addedToBank: Boolean(rawQState.addedToBank),
                graduatedFromBank: Boolean(rawQState.graduatedFromBank),
                overridden: Boolean(rawQState.overridden)
            },
            updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString()
        };
    }

    function getActiveSession() {
        const rawText = safeGetItem(KEYS.ACTIVE_SESSION);
        if (!rawText) return null;
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (err) {
            safeRemoveItem(KEYS.ACTIVE_SESSION);
            return null;
        }
        const clean = sanitizeActiveSession(parsed);
        if (!clean) {
            safeRemoveItem(KEYS.ACTIVE_SESSION);
            return null;
        }
        return clean;
    }

    function saveActiveSession(session) {
        const clean = sanitizeActiveSession(session);
        if (!clean) return false;
        return writeJson(KEYS.ACTIVE_SESSION, clean);
    }

    function clearActiveSession() {
        return safeRemoveItem(KEYS.ACTIVE_SESSION);
    }

    function sanitizeLastCompletedBatch(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const levelId = isNonEmptyString(raw.levelId) ? raw.levelId.trim().toLowerCase() : "";
        const unitId = isNonEmptyString(raw.unitId) ? raw.unitId.trim() : "";
        const part = isNonEmptyString(raw.part) ? raw.part.trim() : "";
        if (!VALID_LEVELS.has(levelId) || !unitId || !part) return null;
        return {
            levelId,
            unitId,
            unitCode: isNonEmptyString(raw.unitCode) ? raw.unitCode.trim() : unitId,
            part,
            batchKey: isNonEmptyString(raw.batchKey) ? raw.batchKey.trim() : `${unitId}::${part}`,
            completedAt: typeof raw.completedAt === "string" ? raw.completedAt : new Date().toISOString()
        };
    }

    function getLastCompletedBatch() {
        const rawText = safeGetItem(KEYS.LAST_COMPLETED_BATCH);
        if (!rawText) return null;
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (err) {
            safeRemoveItem(KEYS.LAST_COMPLETED_BATCH);
            return null;
        }
        const clean = sanitizeLastCompletedBatch(parsed);
        if (!clean) {
            safeRemoveItem(KEYS.LAST_COMPLETED_BATCH);
            return null;
        }
        return clean;
    }

    function setLastCompletedBatch(info) {
        const clean = sanitizeLastCompletedBatch(info);
        if (!clean) return false;
        return writeJson(KEYS.LAST_COMPLETED_BATCH, clean);
    }

    function clearLastCompletedBatch() {
        return safeRemoveItem(KEYS.LAST_COMPLETED_BATCH);
    }

    function exportBackup() {
        const lastCompletedBatch = getLastCompletedBatch();
        const data = {
            wrongIds: getWrongIds(),
            masteredIds: getMasteredIds(),
            completedBatches: getCompletedBatches(),
            studyMode: getStudyMode(),
            selectedLevel: getSelectedLevel()
        };
        if (lastCompletedBatch) {
            data.lastCompletedBatch = lastCompletedBatch;
        }
        const payload = {
            app: "mimi-kara-n3",
            version: 2,
            exportedAt: new Date().toISOString(),
            data
        };
        return JSON.stringify(payload, null, 2);
    }

    function importBackup(jsonText) {
        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch (err) {
            throw new Error("Tệp JSON không hợp lệ hoặc bị hỏng.");
        }

        if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") {
            throw new Error("Định dạng file sao lưu không đúng chuẩn Mimi Kara N3.");
        }

        const { wrongIds, masteredIds, completedBatches, studyMode } = parsed.data;
        const cleanWrong = sanitizeIdArray(wrongIds);
        const cleanMastered = sanitizeIdArray(masteredIds);

        const cleanBatches = {};
        if (completedBatches && typeof completedBatches === "object" && !Array.isArray(completedBatches)) {
            for (const [key, val] of Object.entries(completedBatches)) {
                if (val && typeof val === "object" && typeof val.bestPct === "number") {
                    cleanBatches[key] = {
                        bestPct: Math.max(0, Math.min(100, Math.round(val.bestPct))),
                        lastPlayedAt: typeof val.lastPlayedAt === "string" ? val.lastPlayedAt : new Date().toISOString(),
                        total: Number(val.total) > 0 ? Number(val.total) : 0
                    };
                }
            }
        }

        writeJson(KEYS.WRONG_IDS, cleanWrong);
        writeJson(KEYS.MASTERED_IDS, cleanMastered);
        writeJson(KEYS.COMPLETED_BATCHES, cleanBatches);
        setStudyMode(studyMode);
        if (parsed.data.selectedLevel) {
            setSelectedLevel(parsed.data.selectedLevel);
        }

        // Clear any stale local in-progress session when restoring a backup
        clearActiveSession();
        const cleanLastBatch = sanitizeLastCompletedBatch(parsed.data.lastCompletedBatch);
        if (cleanLastBatch) {
            writeJson(KEYS.LAST_COMPLETED_BATCH, cleanLastBatch);
        } else {
            clearLastCompletedBatch();
        }

        return {
            wrongCount: cleanWrong.length,
            masteredCount: cleanMastered.length,
            batchCount: Object.keys(cleanBatches).length
        };
    }

    const api = {
        KEYS,
        getWrongIds,
        addWrongId,
        removeWrongId,
        clearWrongIds,
        isWrongId,
        getMasteredIds,
        addMasteredId,
        getCompletedBatches,
        recordBatchCompletion,
        getStudyMode,
        setStudyMode,
        getSelectedLevel,
        setSelectedLevel,
        getTheme,
        setTheme,
        sanitizeActiveSession,
        getActiveSession,
        saveActiveSession,
        clearActiveSession,
        sanitizeLastCompletedBatch,
        getLastCompletedBatch,
        setLastCompletedBatch,
        clearLastCompletedBatch,
        exportBackup,
        importBackup
    };

    global.MimiStorage = api;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof window !== "undefined" ? window : globalThis);
