(function (global) {
    /**
     * Check whether a string contains at least one Kanji character (or iteration mark 々).
     */
    function hasKanji(str) {
        return /[\u4e00-\u9faf\u3400-\u4dbf々]/.test(str || "");
    }

    /**
     * Return a new shuffled copy of an array using Fisher-Yates.
     */
    function shuffle(array) {
        const arr = Array.isArray(array) ? [...array] : [];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    /**
     * Normalize Vietnamese text (strip accents, đ -> d, punctuation -> spaces).
     */
    function normalizeVi(str) {
        return (str || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d")
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    /**
     * Compare user's Vietnamese input against target meaning and optional synonyms.
     * Supports short 2-char exact chunks (e.g., "đủ", "đá", "ôm") and >=3-char substring matches.
     */
    function checkVietnameseMeaning(userInput, targetMeaning, synonyms = []) {
        const normUser = normalizeVi(userInput);
        if (!normUser || normUser.length < 2) return false;

        const candidatePhrases = new Set();

        const collectChunks = (rawText) => {
            if (!rawText) return;
            // Version without parenthetical hints
            const stripped = rawText.replace(/\([^)]*\)/g, "");
            // Version keeping parenthetical content as separate searchable text
            const withParensSpace = rawText.replace(/[()]/g, " ");
            for (const source of [stripped, withParensSpace]) {
                const chunks = source.split(/[;,/]/).map((s) => normalizeVi(s)).filter(Boolean);
                for (const c of chunks) {
                    candidatePhrases.add(c);
                }
            }
        };

        collectChunks(targetMeaning);
        if (Array.isArray(synonyms)) {
            for (const syn of synonyms) {
                collectChunks(syn);
            }
        }

        for (const chunk of candidatePhrases) {
            if (normUser === chunk) return true;
            if (chunk.includes(normUser) && normUser.length >= 3) return true;
            if (normUser.includes(chunk) && chunk.length >= 3) return true;
        }

        return false;
    }

    /**
     * Return the primary Hiragana reading (before any '/').
     */
    function getPrimaryReading(reading) {
        return (reading || "").split("/")[0].trim();
    }

    /**
     * Return all Hiragana readings split by '/'.
     */
    function getAllReadings(reading) {
        return (reading || "")
            .split("/")
            .map((r) => r.trim())
            .filter(Boolean);
    }

    /**
     * Generate 3 plausible, unique Hiragana distractors that do not collide with
     * any reading of the target word, prioritizing matching ending kana and POS/unit.
     */
    function generateReadingDistractors(target, pool) {
        const targetReadings = new Set(getAllReadings(target.reading));
        const primaryTarget = getPrimaryReading(target.reading);
        const targetEnding = primaryTarget.slice(-1);

        const distractors = [];
        const used = new Set(targetReadings);

        const candidates = (pool || []).filter((item) => item && item.id !== target.id);

        const samePosAndEnding = shuffle(
            candidates.filter((item) => {
                const r = getPrimaryReading(item.reading);
                return r && !used.has(r) && item.pos === target.pos && r.slice(-1) === targetEnding;
            })
        );

        const sameEnding = shuffle(
            candidates.filter((item) => {
                const r = getPrimaryReading(item.reading);
                return r && !used.has(r) && r.slice(-1) === targetEnding;
            })
        );

        const sameUnitOrPos = shuffle(
            candidates.filter((item) => {
                const r = getPrimaryReading(item.reading);
                return r && !used.has(r) && (item.unitId === target.unitId || item.pos === target.pos);
            })
        );

        const fallback = shuffle(candidates);

        const tiers = [samePosAndEnding, sameEnding, sameUnitOrPos, fallback];
        for (const tier of tiers) {
            for (const item of tier) {
                if (distractors.length >= 3) break;
                const candidateReadings = getAllReadings(item.reading);
                const primary = getPrimaryReading(item.reading);
                // Ensure no overlap with any target reading or already chosen distractor
                const collidesWithTarget = candidateReadings.some((cr) => targetReadings.has(cr));
                if (primary && !used.has(primary) && !collidesWithTarget) {
                    used.add(primary);
                    distractors.push(primary);
                }
            }
            if (distractors.length >= 3) break;
        }

        return distractors;
    }

    /**
     * Generate 3 unique context fill-in-the-blank distractors (words),
     * prioritizing items from the same unit and POS for realistic challenge.
     */
    function generateContextDistractors(target, pool) {
        const distractors = [];
        const usedWords = new Set([target.word]);
        const candidates = (pool || []).filter((item) => item && item.id !== target.id && item.word !== target.word);

        const sameUnitAndPos = shuffle(
            candidates.filter((item) => item.unitId === target.unitId && item.pos === target.pos)
        );
        const sameUnit = shuffle(
            candidates.filter((item) => item.unitId === target.unitId)
        );
        const samePos = shuffle(
            candidates.filter((item) => item.pos === target.pos)
        );
        const fallback = shuffle(candidates);

        for (const tier of [sameUnitAndPos, sameUnit, samePos, fallback]) {
            for (const item of tier) {
                if (distractors.length >= 3) break;
                if (item.word && !usedWords.has(item.word)) {
                    usedWords.add(item.word);
                    distractors.push(item.word);
                }
            }
            if (distractors.length >= 3) break;
        }

        return distractors;
    }

    /**
     * Generate 3 unique Vietnamese meaning distractors for Listening mode,
     * prioritizing items from the same unit and POS and avoiding normalized duplicates.
     */
    function generateMeaningDistractors(target, pool) {
        const distractors = [];
        const targetNorm = normalizeVi(target.meaning);
        const usedMeanings = new Set([String(target.meaning || "").trim()]);
        const usedNorms = new Set(targetNorm ? [targetNorm] : []);
        const candidates = (pool || []).filter((item) => item && item.id !== target.id && item.meaning);

        const sameUnitAndPos = shuffle(
            candidates.filter((item) => item.unitId === target.unitId && item.pos === target.pos)
        );
        const sameUnit = shuffle(
            candidates.filter((item) => item.unitId === target.unitId)
        );
        const samePos = shuffle(
            candidates.filter((item) => item.pos === target.pos)
        );
        const fallback = shuffle(candidates);

        for (const tier of [sameUnitAndPos, sameUnit, samePos, fallback]) {
            for (const item of tier) {
                if (distractors.length >= 3) break;
                const meaning = String(item.meaning || "").trim();
                const norm = normalizeVi(meaning);
                if (meaning && !usedMeanings.has(meaning) && (!norm || !usedNorms.has(norm))) {
                    usedMeanings.add(meaning);
                    if (norm) usedNorms.add(norm);
                    distractors.push(meaning);
                }
            }
            if (distractors.length >= 3) break;
        }

        return distractors;
    }

    /**
     * Build quiz question objects for a session.
     * Never drops Kana-only words; in 'two_step' mode, Kana-only words skip Step 1 automatically.
     */
    function buildQuestions(items, allPool, mode) {
        const studyMode = mode === "context_fill" || mode === "listen_meaning" ? mode : "two_step";
        const orderedItems = shuffle(items);

        return orderedItems.map((target) => {
            if (studyMode === "context_fill") {
                const distractors = generateContextDistractors(target, allPool);
                const options = shuffle([
                    { text: target.word, isCorrect: true },
                    ...distractors.map((w) => ({ text: w, isCorrect: false }))
                ]);
                return {
                    target,
                    mode: studyMode,
                    needsStep1: false,
                    options
                };
            }

            if (studyMode === "listen_meaning") {
                const distractors = generateMeaningDistractors(target, allPool);
                const options = shuffle([
                    { text: target.meaning, isCorrect: true },
                    ...distractors.map((m) => ({ text: m, isCorrect: false }))
                ]);
                return {
                    target,
                    mode: studyMode,
                    needsStep1: false,
                    options
                };
            }

            const needsStep1 = hasKanji(target.word);
            let options = [];
            if (needsStep1) {
                const correctReading = getPrimaryReading(target.reading);
                const distractors = generateReadingDistractors(target, allPool);
                options = shuffle([
                    { text: correctReading, isCorrect: true },
                    ...distractors.map((r) => ({ text: r, isCorrect: false }))
                ]);
            }

            return {
                target,
                mode: studyMode,
                needsStep1,
                options
            };
        });
    }

    /**
     * Replace the Japanese blank placeholder （　） with a replacement string or HTML snippet.
     */
    function fillBlank(sentence, replacementHtml) {
        return (sentence || "").replace(/（[\s　]*）/g, replacementHtml);
    }

    const api = {
        hasKanji,
        shuffle,
        normalizeVi,
        checkVietnameseMeaning,
        getPrimaryReading,
        getAllReadings,
        generateReadingDistractors,
        generateContextDistractors,
        generateMeaningDistractors,
        buildQuestions,
        fillBlank
    };

    global.MimiQuizEngine = api;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof window !== "undefined" ? window : globalThis);
