(function (global) {
    const AppState = global.MimiAppState;
    const { escapeHtml, escapeJsAttr } = AppState;

    const grammarCache = new Map();
    const loadingPromises = new Map();
    const selectedIndexByLevel = new Map();
    const selectedChoiceByLesson = new Map();

    let currentLevelId = "n3";

    function getGrammarFilePath(levelId) {
        return `data/${levelId}/grammar.json`;
    }

    async function loadGrammar(levelId) {
        const lvl = (levelId || "n3").toLowerCase();
        if (grammarCache.has(lvl)) {
            return grammarCache.get(lvl);
        }
        if (loadingPromises.has(lvl)) {
            return loadingPromises.get(lvl);
        }

        const promise = (async () => {
            try {
                const res = await fetch(getGrammarFilePath(lvl));
                if (!res.ok) {
                    throw new Error(`Không thể tải ngữ pháp ${lvl.toUpperCase()} (HTTP ${res.status})`);
                }
                const data = await res.json();
                const lessons = Array.isArray(data && data.lessons) ? data.lessons : [];
                grammarCache.set(lvl, lessons);
                return lessons;
            } finally {
                loadingPromises.delete(lvl);
            }
        })();

        loadingPromises.set(lvl, promise);
        return promise;
    }

    function getCachedLessons(levelId) {
        const lvl = (levelId || "n3").toLowerCase();
        return grammarCache.get(lvl) || null;
    }

    function getGrammarCount(levelId) {
        const cached = getCachedLessons(levelId);
        return cached ? cached.length : null;
    }

    function getActiveIndex(levelId, total) {
        const saved = selectedIndexByLevel.get(levelId);
        if (Number.isInteger(saved) && saved >= 0 && saved < total) {
            return saved;
        }
        return 0;
    }

    async function renderGrammarSection(levelId) {
        const lvl = (levelId || AppState.state.currentLevel || "n3").toLowerCase();
        currentLevelId = lvl;

        const navEl = document.getElementById("grammar-lesson-nav");
        const bodyEl = document.getElementById("grammar-lesson-body");
        if (!navEl || !bodyEl) return;

        let lessons = getCachedLessons(lvl);
        if (!lessons) {
            navEl.innerHTML = "";
            bodyEl.innerHTML = `<div class="lib-empty-note">⏳ Đang tải ngữ pháp ${escapeHtml(lvl.toUpperCase())}...</div>`;
            try {
                lessons = await loadGrammar(lvl);
            } catch (err) {
                bodyEl.innerHTML = `<div class="lib-empty-note">${escapeHtml(err.message || "Không thể tải dữ liệu ngữ pháp.")}</div>`;
                return;
            }
        }

        if (AppState.state.currentLevel !== lvl) {
            return;
        }

        const countEl = document.getElementById("catalog-count");
        if (countEl && AppState.state.n3SubjectTab === "grammar") {
            countEl.textContent = `${lessons.length} bài ngữ pháp`;
        }

        if (lessons.length === 0) {
            navEl.innerHTML = "";
            bodyEl.innerHTML = `<div class="lib-empty-note">Chưa có bài ngữ pháp nào cho cấp độ này.</div>`;
            return;
        }

        const activeIndex = getActiveIndex(lvl, lessons.length);
        selectedIndexByLevel.set(lvl, activeIndex);

        navEl.classList.toggle("is-long-list", lessons.length > 4);
        renderLessonNav(lessons, activeIndex);
        renderActiveLesson(lessons[activeIndex], activeIndex);
    }

    function renderLessonNav(lessons, activeIndex) {
        const navEl = document.getElementById("grammar-lesson-nav");
        if (!navEl) return;

        navEl.innerHTML = lessons.map((lesson, idx) => {
            const isActive = idx === activeIndex;
            const codeLine = lesson.code
                ? `<span class="lib-lesson-code">${escapeHtml(lesson.code)}</span>`
                : "";
            const subText = lesson.code
                ? String(lesson.topic || "").replace(new RegExp(`^${lesson.code}\\s*[·•:-]?\\s*`), "")
                : (lesson.topic || "");

            return `
                <button type="button" onclick="MimiApp.openGrammarLesson(${idx})"
                    aria-pressed="${isActive ? "true" : "false"}">
                    ${codeLine}
                    <b lang="ja">${escapeHtml(lesson.pattern)}</b>
                    <small>${escapeHtml(subText)}</small>
                </button>
            `;
        }).join("");
    }

    function renderActiveLesson(lesson, activeIndex) {
        const bodyEl = document.getElementById("grammar-lesson-body");
        if (!bodyEl || !lesson) return;

        const lessonKey = lesson.id || `${currentLevelId}-${activeIndex}`;
        const pickedIdx = selectedChoiceByLesson.has(lessonKey)
            ? selectedChoiceByLesson.get(lessonKey)
            : null;

        const points = Array.isArray(lesson.points) ? lesson.points : [];
        const pointsHtml = points.length > 0 ? `
            <div class="lib-grammar-points">
                <h4 class="lib-grammar-subhead">Các mẫu chính trong bài</h4>
                <ul class="lib-points-list">
                    ${points.map((pt) => `
                        <li>
                            <b lang="ja">${escapeHtml(pt.pattern)}</b>
                            <span>${escapeHtml(pt.rule)}</span>
                        </li>
                    `).join("")}
                </ul>
            </div>
        ` : "";

        const allExamples = [];
        if (lesson.example) {
            allExamples.push({ jp: lesson.example, vi: lesson.translation || "" });
        }
        if (Array.isArray(lesson.examples)) {
            for (const ex of lesson.examples) {
                if (ex && ex.jp) {
                    allExamples.push({ jp: ex.jp, vi: ex.vi || "" });
                }
            }
        }

        const examplesHtml = allExamples.map((ex) => {
            const audioAttr = escapeJsAttr(ex.jp);
            return `
                <div class="lib-grammar-example-row">
                    <div class="min-w-0">
                        <p class="lib-grammar-example" lang="ja">${escapeHtml(ex.jp)}</p>
                        ${ex.vi ? `<p class="lib-grammar-translation">${escapeHtml(ex.vi)}</p>` : ""}
                    </div>
                    <button type="button" onclick="MimiApp.speakSpecific('${audioAttr}')"
                        title="Nghe câu ví dụ"
                        aria-label="Nghe câu ví dụ"
                        class="lib-audio-chip shrink-0">
                        🔊 Nghe
                    </button>
                </div>
            `;
        }).join("");

        const options = Array.isArray(lesson.options) ? lesson.options : [];
        const choicesHtml = options.map((opt, idx) => {
            const isPicked = pickedIdx === idx;
            const isCorrectOpt = idx === lesson.correct;
            let stateCls = "";
            if (pickedIdx !== null) {
                if (isPicked && isCorrectOpt) {
                    stateCls = " is-correct";
                } else if (isPicked && !isCorrectOpt) {
                    stateCls = " is-wrong";
                }
            }
            return `
                <button type="button" lang="ja"
                    class="lib-choice-btn${stateCls}"
                    aria-pressed="${isPicked ? "true" : "false"}"
                    onclick="MimiApp.selectGrammarChoice(${idx})">
                    ${escapeHtml(opt)}
                </button>
            `;
        }).join("");

        let feedbackHtml = `<p class="lib-grammar-feedback" role="status"></p>`;
        if (pickedIdx !== null && options[lesson.correct] !== undefined) {
            const isRight = pickedIdx === lesson.correct;
            const prefix = isRight
                ? "✓ Đúng. "
                : `✕ Đáp án phù hợp là ${options[lesson.correct]}. `;
            const fbClass = isRight ? "lib-grammar-feedback is-correct" : "lib-grammar-feedback is-wrong";
            feedbackHtml = `<p class="${fbClass}" role="status">${escapeHtml(prefix + (lesson.explanation || ""))}</p>`;
        }

        bodyEl.innerHTML = `
            <small class="lib-grammar-label">${escapeHtml(lesson.topic)}</small>
            <h3 lang="ja" class="lib-grammar-pattern">${escapeHtml(lesson.pattern)}</h3>
            <p class="lib-grammar-usage">${escapeHtml(lesson.usage)}</p>
            <p class="lib-grammar-construction">
                <b>Cấu trúc</b>
                <span>${escapeHtml(lesson.rule)}</span>
            </p>
            ${pointsHtml}
            <h4 class="lib-grammar-subhead">Ví dụ</h4>
            <div class="lib-grammar-examples-stack">${examplesHtml}</div>
            <h4 class="lib-grammar-subhead">Thử một câu</h4>
            <p class="lib-grammar-question" lang="ja">${escapeHtml(lesson.question)}</p>
            <div class="lib-grammar-choices">${choicesHtml}</div>
            ${feedbackHtml}
        `;
    }

    function openGrammarLesson(index) {
        const lessons = getCachedLessons(currentLevelId);
        if (!lessons || index < 0 || index >= lessons.length) return;
        selectedIndexByLevel.set(currentLevelId, index);
        renderLessonNav(lessons, index);
        renderActiveLesson(lessons[index], index);
    }

    function selectGrammarChoice(choiceIndex) {
        const lessons = getCachedLessons(currentLevelId);
        const activeIndex = getActiveIndex(currentLevelId, lessons ? lessons.length : 0);
        if (!lessons || !lessons[activeIndex]) return;
        const lesson = lessons[activeIndex];
        if (!Array.isArray(lesson.options) || choiceIndex < 0 || choiceIndex >= lesson.options.length) return;

        const lessonKey = lesson.id || `${currentLevelId}-${activeIndex}`;
        selectedChoiceByLesson.set(lessonKey, choiceIndex);
        renderActiveLesson(lesson, activeIndex);
    }

    global.MimiGrammarView = {
        loadGrammar,
        getGrammarCount,
        renderGrammarSection,
        openGrammarLesson,
        selectGrammarChoice
    };
})(window);
