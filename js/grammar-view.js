(function (global) {
    const AppState = global.MimiAppState;
    const Engine = global.MimiQuizEngine;
    const { escapeHtml, escapeJsAttr } = AppState;

    const grammarCache = new Map();
    const loadingPromises = new Map();
    const selectedIndexByLevel = new Map();
    const selectedChoiceByLesson = new Map();
    const searchQueryByLevel = new Map();

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

    function filterLessonsWithIndex(lessons, query) {
        const trimmed = String(query || "").trim();
        if (!trimmed) {
            return lessons.map((lesson, index) => ({ lesson, index }));
        }
        const qLower = trimmed.toLowerCase();
        const qNormVi = Engine && typeof Engine.normalizeVi === "function"
            ? Engine.normalizeVi(trimmed)
            : qLower;

        return lessons
            .map((lesson, index) => ({ lesson, index }))
            .filter(({ lesson }) => {
                const pattern = String(lesson.pattern || "").toLowerCase();
                const romaji = String(lesson.romaji || "").toLowerCase();
                const code = String(lesson.code || "").toLowerCase();
                const topic = String(lesson.topic || "");
                const usage = String(lesson.usage || "");
                const topicNorm = Engine ? Engine.normalizeVi(topic) : topic.toLowerCase();
                const usageNorm = Engine ? Engine.normalizeVi(usage) : usage.toLowerCase();

                return (
                    pattern.includes(qLower) ||
                    romaji.includes(qLower) ||
                    code.includes(qLower) ||
                    topic.toLowerCase().includes(qLower) ||
                    (qNormVi && (topicNorm.includes(qNormVi) || usageNorm.includes(qNormVi)))
                );
            });
    }

    function ensureSearchInput() {
        const navEl = document.getElementById("grammar-lesson-nav");
        if (!navEl || !navEl.parentElement) return null;

        let searchWrap = document.getElementById("grammar-search-wrap");
        if (!searchWrap) {
            searchWrap = document.createElement("div");
            searchWrap.id = "grammar-search-wrap";
            searchWrap.className = "lib-grammar-search-wrap";
            searchWrap.innerHTML = `
                <input id="grammar-search-input" type="search" autocomplete="off"
                    placeholder="Tìm mẫu ngữ pháp (tiếng Nhật, romaji, nghĩa)..."
                    class="lib-grammar-search" />
            `;
            navEl.parentElement.insertBefore(searchWrap, navEl);

            const inputEl = searchWrap.querySelector("#grammar-search-input");
            if (inputEl) {
                inputEl.addEventListener("input", (e) => {
                    searchQueryByLevel.set(currentLevelId, e.target.value || "");
                    const lessons = getCachedLessons(currentLevelId);
                    if (lessons) {
                        const activeIdx = getActiveIndex(currentLevelId, lessons.length);
                        renderLessonNav(lessons, activeIdx);
                    }
                });
            }
        }
        return searchWrap.querySelector("#grammar-search-input");
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

        const searchInput = ensureSearchInput();
        const searchWrap = document.getElementById("grammar-search-wrap");
        if (searchWrap) {
            searchWrap.classList.toggle("hidden", lessons.length <= 4);
        }
        if (searchInput) {
            searchInput.value = searchQueryByLevel.get(lvl) || "";
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

        const query = searchQueryByLevel.get(currentLevelId) || "";
        const filtered = filterLessonsWithIndex(lessons, query);

        if (filtered.length === 0) {
            navEl.innerHTML = `<div class="lib-empty-note text-xs">Không tìm thấy mẫu khớp với "${escapeHtml(query)}".</div>`;
            return;
        }

        navEl.innerHTML = filtered.map(({ lesson, index }) => {
            const isActive = index === activeIndex;
            const codeLine = lesson.code
                ? `<span class="lib-lesson-code">${escapeHtml(lesson.code)}</span>`
                : "";
            const subText = lesson.code
                ? String(lesson.topic || "").replace(new RegExp(`^${lesson.code}\\s*[·•:-]?\\s*`), "")
                : (lesson.topic || "");

            return `
                <button type="button" onclick="MimiApp.openGrammarLesson(${index})"
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
            allExamples.push({
                jp: lesson.example,
                romaji: lesson.exampleRomaji || "",
                vi: lesson.translation || ""
            });
        }
        if (Array.isArray(lesson.examples)) {
            for (const ex of lesson.examples) {
                if (ex && ex.jp) {
                    allExamples.push({
                        jp: ex.jp,
                        romaji: ex.romaji || "",
                        vi: ex.vi || ex.en || ""
                    });
                }
            }
        }

        const examplesHtml = allExamples.map((ex) => {
            const audioAttr = escapeJsAttr(ex.jp);
            return `
                <div class="lib-grammar-example-row">
                    <div class="min-w-0">
                        <p class="lib-grammar-example" lang="ja">${escapeHtml(ex.jp)}</p>
                        ${ex.romaji ? `<p class="lib-grammar-romaji">${escapeHtml(ex.romaji)}</p>` : ""}
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
        const hasQuiz = Boolean(lesson.question && options.length > 0);
        let quizSectionHtml = "";

        if (hasQuiz) {
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

            quizSectionHtml = `
                <h4 class="lib-grammar-subhead">Thử một câu</h4>
                <p class="lib-grammar-question" lang="ja">${escapeHtml(lesson.question)}</p>
                <div class="lib-grammar-choices">${choicesHtml}</div>
                ${feedbackHtml}
            `;
        }

        const romajiBadge = lesson.romaji
            ? `<span class="lib-grammar-pattern-romaji">${escapeHtml(lesson.romaji)}</span>`
            : "";

        bodyEl.innerHTML = `
            <small class="lib-grammar-label">${escapeHtml(lesson.topic)}</small>
            <h3 lang="ja" class="lib-grammar-pattern">${escapeHtml(lesson.pattern)} ${romajiBadge}</h3>
            <p class="lib-grammar-usage">${escapeHtml(lesson.usage)}</p>
            <p class="lib-grammar-construction">
                <b>Cấu trúc</b>
                <span>${escapeHtml(lesson.rule)}</span>
            </p>
            ${pointsHtml}
            <h4 class="lib-grammar-subhead">Ví dụ</h4>
            <div class="lib-grammar-examples-stack">${examplesHtml}</div>
            ${quizSectionHtml}
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
