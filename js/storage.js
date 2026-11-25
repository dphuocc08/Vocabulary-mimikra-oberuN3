(function (global) {
    const KEYS = {
        WRONG_IDS: "mimi_n3_wrong_vocab_ids",
        MASTERED_IDS: "mimi_n3_mastered_ids",
        COMPLETED_BATCHES: "mimi_n3_completed_batches",
        STUDY_MODE: "mimi_n3_study_mode",
        SELECTED_LEVEL: "mimi_selected_level"
    };

    const VALID_MODES = new Set(["two_step", "context_fill"]);
    const VALID_LEVELS = new Set(["n5", "n4", "n3", "n2"]);

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

    function exportBackup() {
        const payload = {
            app: "mimi-kara-n3",
            version: 2,
            exportedAt: new Date().toISOString(),
            data: {
                wrongIds: getWrongIds(),
                masteredIds: getMasteredIds(),
                completedBatches: getCompletedBatches(),
                studyMode: getStudyMode(),
                selectedLevel: getSelectedLevel()
            }
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
        exportBackup,
        importBackup
    };

    global.MimiStorage = api;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof window !== "undefined" ? window : globalThis);
