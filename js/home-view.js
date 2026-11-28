(function (global) {
    const Storage = global.MimiStorage;
    const AppState = global.MimiAppState;
    const { state, escapeHtml, escapeJsAttr, formatShortPart, showScreen } = AppState;

    const SHELF_INFO = {
        n5: {
            rank: "N5",
            title: "Minna no Nihongo I",
            subtitle: "25 bài · Từ vựng & Ngữ pháp",
            cls: "n5"
        },
        n4: {
            rank: "N4",
            title: "Minna no Nihongo II",
            subtitle: "25 bài · Từ vựng & Ngữ pháp",
            cls: "n4"
        },
        n3: {
            rank: "N3",
            title: "Thư viện N3",
            subtitle: "Từ vựng & Ngữ pháp",
            cls: "n3"
        }
    };

    function setStudyMode(mode) {
        state.studyMode = Storage.setStudyMode(mode);
        renderModeSwitcher();
    }

    function renderLoadingState(levelId) {
        const container = document.getElementById("units-container");
        if (container) {
            const label = (levelId || state.currentLevel || "n3").toUpperCase();
            container.innerHTML = `
                <div class="lib-empty-note">
                    ⏳ Đang tải dữ liệu <strong>JLPT ${escapeHtml(label)}</strong>...
                </div>
            `;
        }
    }

    async function selectLevel(levelId) {
        if (!levelId || state.isLoadingLevel) return;
        if (levelId === state.currentLevel && AppState.getCurrentLevelUnits().length > 0) {
            renderHome();
            return;
        }
        renderLoadingState(levelId);
        try {
            await AppState.loadLevel(levelId);
            renderHome();
        } catch (err) {
            const container = document.getElementById("units-container");
            if (container) {
                container.innerHTML = `
                    <div class="lib-empty-note is-error">
                        ${escapeHtml(err.message || "Không thể tải dữ liệu cấp độ này.")}
                    </div>
                `;
            }
        }
    }

    async function selectLevelFromHeader(levelId) {
        if (!levelId) return;
        showScreen("selection-screen");
        if (levelId === state.currentLevel && AppState.getCurrentLevelUnits().length > 0) {
            renderHome();
            return;
        }
        await selectLevel(levelId);
    }

    function selectN3Tab(tabName) {
        state.n3SubjectTab = tabName === "grammar" ? "grammar" : "vocab";
        renderCatalogPanels();
    }

    function setupN3TabKeyboard() {
        const tabIds = ["n3-tab-vocab", "n3-tab-grammar"];
        const tabs = tabIds.map((id) => document.getElementById(id)).filter(Boolean);
        tabs.forEach((tab, index) => {
            tab.addEventListener("keydown", (event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
                selectN3Tab(next === 1 ? "grammar" : "vocab");
                if (tabs[next]) tabs[next].focus();
            });
        });
    }

    function jumpToLibrarySection(sectionId) {
        showScreen("selection-screen");
        renderLevelHeader();
        renderMistakeBanner();
        const el = document.getElementById(sectionId);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function focusGlobalSearch() {
        showScreen("selection-screen");
        if (state.n3SubjectTab !== "vocab") {
            state.n3SubjectTab = "vocab";
            renderCatalogPanels();
        }
        renderLevelHeader();
        renderMistakeBanner();
        const input = document.getElementById("global-search-input");
        if (input) {
            input.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => input.focus(), 120);
        }
    }

    function renderHome() {
        showScreen("selection-screen");
        renderLevelHeader();
        renderContinueCard();
        renderGlobalStats();
        renderLevelSwitcher();
        renderModeSwitcher();
        renderMistakeBanner();
        renderUnitsList();
        renderCatalogPanels();
    }

    function renderLevelHeader() {
        const meta = AppState.getCurrentLevelMeta();
        const levelPill = document.getElementById("header-level-pill");
        if (levelPill) {
            levelPill.textContent = meta.code;
        }

        const headerLevelBtns = document.querySelectorAll("[data-header-level]");
        headerLevelBtns.forEach((btn) => {
            const lvlId = btn.getAttribute("data-header-level");
            const isActive = lvlId === state.currentLevel;
            btn.classList.toggle("is-active", isActive);
            btn.setAttribute("aria-pressed", String(isActive));
        });
    }

    function getValidActiveSessionForHome() {
        const saved = Storage.getActiveSession();
        if (!saved) return null;

        if (!AppState.isValidManifestUnit(saved.levelId, saved.unitId)) {
            Storage.clearActiveSession();
            return null;
        }

        if (saved.levelId === state.currentLevel && global.MimiQuizController) {
            const validated = global.MimiQuizController.validateSavedSessionForLoadedData(saved);
            if (!validated) {
                Storage.clearActiveSession();
                return null;
            }
            return {
                session: saved,
                levelCode: validated.levelMeta.code,
                unitCode: validated.unit.code,
                part: validated.batch.part,
                partTitle: validated.batch.partTitle || ""
            };
        }

        const lvlMeta = AppState.getLevelMetaById(saved.levelId);
        return {
            session: saved,
            levelCode: lvlMeta ? lvlMeta.code : saved.levelCode,
            unitCode: saved.unitCode,
            part: saved.part,
            partTitle: saved.partTitle || ""
        };
    }

    function getRecommendedNextBatchForCurrentLevel() {
        const ordered = AppState.getOrderedBatchesForLevel(state.currentLevel);
        if (ordered.length === 0) return null;

        const completedBatches = Storage.getCompletedBatches();
        const lastCompleted = Storage.getLastCompletedBatch();

        if (lastCompleted) {
            if (!AppState.isValidManifestUnit(lastCompleted.levelId, lastCompleted.unitId)) {
                Storage.clearLastCompletedBatch();
            } else if (lastCompleted.levelId === state.currentLevel) {
                const existsInLevel = AppState.findUnitAndBatch(lastCompleted.unitId, lastCompleted.part);
                if (!existsInLevel) {
                    Storage.clearLastCompletedBatch();
                } else {
                    const nextAfterLast = AppState.getNextBatchInLevel(
                        lastCompleted.unitId,
                        lastCompleted.part,
                        state.currentLevel
                    );
                    if (nextAfterLast) {
                        return {
                            kind: "next_after_completed",
                            entry: nextAfterLast,
                            prevLabel: `${existsInLevel.unit.code} · ${formatShortPart(existsInLevel.batch.part)}`
                        };
                    }
                    const firstIncomplete = ordered.find((e) => !completedBatches[e.batch.batchKey]);
                    if (firstIncomplete) {
                        return {
                            kind: "next_incomplete",
                            entry: firstIncomplete,
                            prevLabel: `${existsInLevel.unit.code} · ${formatShortPart(existsInLevel.batch.part)}`
                        };
                    }
                    return {
                        kind: "all_completed",
                        entry: null,
                        levelMeta: AppState.getCurrentLevelMeta()
                    };
                }
            }
        }

        let latestCompletedEntry = null;
        let latestTimestamp = -1;
        for (const entry of ordered) {
            const rec = completedBatches[entry.batch.batchKey];
            if (rec) {
                const ts = rec.lastPlayedAt ? Date.parse(rec.lastPlayedAt) : 0;
                const safeTs = Number.isNaN(ts) ? 0 : ts;
                if (safeTs >= latestTimestamp) {
                    latestTimestamp = safeTs;
                    latestCompletedEntry = entry;
                }
            }
        }

        if (latestCompletedEntry) {
            const nextAfterLatest = AppState.getNextBatchInLevel(
                latestCompletedEntry.unit.id,
                latestCompletedEntry.batch.part,
                state.currentLevel
            );
            if (nextAfterLatest) {
                return {
                    kind: "next_after_completed",
                    entry: nextAfterLatest,
                    prevLabel: `${latestCompletedEntry.unit.code} · ${formatShortPart(latestCompletedEntry.batch.part)}`
                };
            }
            const firstIncomplete = ordered.find((e) => !completedBatches[e.batch.batchKey]);
            if (firstIncomplete) {
                return {
                    kind: "next_incomplete",
                    entry: firstIncomplete,
                    prevLabel: `${latestCompletedEntry.unit.code} · ${formatShortPart(latestCompletedEntry.batch.part)}`
                };
            }
            return {
                kind: "all_completed",
                entry: null,
                levelMeta: AppState.getCurrentLevelMeta()
            };
        }

        return {
            kind: "first_batch",
            entry: ordered[0],
            prevLabel: ""
        };
    }

    function describeQuizStep(session) {
        if (session.studyMode === "context_fill") {
            return session.quizStep === 3 ? "Đang xem giải thích" : "Điền ngữ cảnh";
        }
        if (session.studyMode === "listen_meaning") {
            return session.quizStep === 3 ? "Đang xem giải thích" : "Nghe chọn nghĩa";
        }
        if (session.quizStep === 3) return "Đang xem giải thích";
        if (session.quizStep === 2) return "Bước 2 (Gõ nghĩa)";
        return "Bước 1 (Chọn đọc)";
    }

    function getStudyModeShortLabel(mode) {
        if (mode === "context_fill") return "Ngữ cảnh";
        if (mode === "listen_meaning") return "Nghe nghĩa";
        return "2 Bước";
    }

    function renderContinueCard() {
        const container = document.getElementById("continue-learning-card");
        if (!container) return;

        const activeInfo = getValidActiveSessionForHome();
        if (activeInfo) {
            const { session, levelCode, unitCode, part, partTitle } = activeInfo;
            const total = session.questions.length;
            const qNum = session.currentIndex + 1;
            const pct = Math.round(((session.quizStep === 3 ? qNum : session.currentIndex) / total) * 100);
            const modeText = getStudyModeShortLabel(session.studyMode);
            const stepText = describeQuizStep(session);
            const buttonLabel = `Học tiếp ${levelCode} · ${unitCode} · Câu ${qNum}/${total}`;
            const partSummary = partTitle ? `${part} — ${partTitle}` : part;

            container.innerHTML = `
                <div class="lib-resume-wrap">
                    <div class="lib-resume-actions">
                        <button id="continue-learning-btn" type="button" onclick="MimiApp.resumeSavedSession()" class="lib-resume">
                            <span class="lib-resume-label">${escapeHtml(buttonLabel)}</span>
                            <span class="lib-resume-arrow" aria-hidden="true">→</span>
                        </button>
                    </div>
                    <small class="lib-resume-meta">
                        ${escapeHtml(partSummary)} · ${escapeHtml(modeText)} (${escapeHtml(stepText)}) · ✓ ${session.correctCount} / ✕ ${session.wrongCount}
                    </small>
                    <div class="lib-resume-track" aria-hidden="true">
                        <div class="lib-resume-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
            return;
        }

        const recommendation = getRecommendedNextBatchForCurrentLevel();
        if (!recommendation) {
            container.innerHTML = "";
            return;
        }

        if (recommendation.kind === "all_completed") {
            const lvlCode = recommendation.levelMeta.code;
            container.innerHTML = `
                <div class="lib-resume-wrap">
                    <div class="lib-resume-actions">
                        <button id="continue-learning-btn" type="button" onclick="MimiApp.startGlobalRandomQuiz(20)" class="lib-resume">
                            <span class="lib-resume-label">Ôn tổng hợp ${escapeHtml(lvlCode)}</span>
                            <span class="lib-resume-arrow" aria-hidden="true">→</span>
                        </button>
                    </div>
                    <small class="lib-resume-meta">🏆 Bạn đã hoàn thành toàn bộ các chặng của JLPT ${escapeHtml(lvlCode)}.</small>
                </div>
            `;
            return;
        }

        const { entry, kind, prevLabel } = recommendation;
        const shortPart = formatShortPart(entry.batch.part);
        const unitIdAttr = escapeJsAttr(entry.unit.id);
        const partAttr = escapeJsAttr(entry.batch.part);
        const isFirst = kind === "first_batch";
        const btnPrefix = isFirst ? "Học tiếp" : "Học tiếp";
        const buttonLabel = isFirst
            ? `Học tiếp ${entry.levelMeta.code} · ${entry.unit.code}`
            : `Học tiếp ${entry.levelMeta.code} · ${entry.unit.code} · ${shortPart}`;
        const detailText = prevLabel
            ? `Vừa xong ${prevLabel} · Tiếp: ${entry.batch.partTitle || entry.batch.part} (${entry.batch.items.length} từ)`
            : `${entry.unit.code} · ${entry.batch.partTitle || entry.unit.title} (${entry.batch.items.length} từ)`;

        container.innerHTML = `
            <div class="lib-resume-wrap">
                <div class="lib-resume-actions">
                    <button id="continue-learning-btn" type="button" onclick="MimiApp.startBatchQuiz('${unitIdAttr}', '${partAttr}')" class="lib-resume">
                        <span class="lib-resume-label">${escapeHtml(buttonLabel)}</span>
                        <span class="lib-resume-arrow" aria-hidden="true">→</span>
                    </button>
                    <button type="button" onclick="MimiApp.openBatchPreview('${unitIdAttr}', '${partAttr}')" class="lib-resume-secondary">
                        Xem từ
                    </button>
                </div>
                <small class="lib-resume-meta">${escapeHtml(detailText)}</small>
            </div>
        `;
    }

    function renderGlobalStats() {
        const levelVocab = AppState.getCurrentLevelVocab();
        const levelUnits = AppState.getCurrentLevelUnits();
        const meta = AppState.getCurrentLevelMeta();
        const masteredSet = new Set(Storage.getMasteredIds());
        const completedBatches = Storage.getCompletedBatches();

        const total = levelVocab.length;
        const mastered = levelVocab.filter((v) => masteredSet.has(v.id)).length;
        const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

        let totalBatches = 0;
        let doneBatches = 0;
        for (const u of levelUnits) {
            for (const b of u.batches || []) {
                totalBatches += 1;
                if (completedBatches[b.batchKey]) doneBatches += 1;
            }
        }

        const statsEl = document.getElementById("lib-progress-summary");
        if (statsEl) {
            statsEl.textContent = `${meta.code}: Đã nắm ${mastered}/${total} từ (${pct}%) · ${doneBatches}/${totalBatches} chặng`;
        }
    }

    function renderLevelSwitcher() {
        const container = document.getElementById("level-switcher");
        if (!container) return;

        container.innerHTML = state.levels.map((lvl) => {
            const isActive = lvl.id === state.currentLevel;
            const info = SHELF_INFO[lvl.id] || {
                rank: lvl.code,
                title: lvl.name,
                subtitle: lvl.subtitle || `${(lvl.units || []).length} bài`,
                cls: "n3"
            };

            return `
                <button type="button"
                    class="lib-volume ${info.cls}"
                    data-level="${escapeHtml(lvl.id)}"
                    aria-pressed="${isActive ? "true" : "false"}"
                    onclick="MimiApp.selectLevel('${escapeJsAttr(lvl.id)}')">
                    <span class="lib-rank">${escapeHtml(info.rank)}</span>
                    <span class="min-w-0">
                        <strong>${escapeHtml(info.title)}</strong>
                        <small>${escapeHtml(info.subtitle)}</small>
                    </span>
                </button>
            `;
        }).join("");
    }

    function renderModeSwitcher() {
        const modes = ["two_step", "context_fill", "listen_meaning"];
        for (const mode of modes) {
            const btn = document.getElementById(`mode-btn-${mode}`);
            const badge = document.getElementById(`mode-badge-${mode}`);
            const isSelected = state.studyMode === mode;
            if (btn) {
                btn.classList.toggle("is-selected", isSelected);
                btn.setAttribute("aria-pressed", String(isSelected));
            }
            if (badge) {
                badge.classList.toggle("hidden", !isSelected);
            }
        }
    }

    function renderMistakeBanner() {
        const levelVocabIds = new Set(AppState.getCurrentLevelVocab().map((v) => v.id));
        const wrongIds = Storage.getWrongIds().filter((id) => levelVocabIds.has(id));
        const count = wrongIds.length;
        const meta = AppState.getCurrentLevelMeta();

        const headerMistakeCount = document.getElementById("header-mistake-count");
        if (headerMistakeCount) {
            headerMistakeCount.textContent = String(count);
            headerMistakeCount.classList.toggle("hidden", count === 0);
        }

        const countEl = document.getElementById("mistake-banner-count");
        const descEl = document.getElementById("mistake-banner-desc");
        const startBtn = document.getElementById("mistake-banner-start-btn");
        const cardEl = document.getElementById("mistake-banner-card");

        if (!cardEl) return;

        cardEl.classList.toggle("has-mistakes", count > 0);
        if (countEl) {
            countEl.textContent = `${count} từ (${meta.code})`;
        }
        if (descEl) {
            descEl.textContent = count > 0
                ? `Bạn có ${count} từ ${meta.code} làm sai cần ôn để tự động xóa khỏi sổ tay.`
                : `Chưa có từ sai nào ở ${meta.code}. Từ làm sai sẽ tự lưu tại đây.`;
        }
        if (startBtn) {
            startBtn.disabled = count === 0;
        }
    }

    function renderCatalogPanels() {
        const meta = AppState.getCurrentLevelMeta();
        const hasGrammar = ["n5", "n4", "n3"].includes(state.currentLevel);
        const showGrammar = hasGrammar && state.n3SubjectTab === "grammar";

        const headingEl = document.getElementById("catalog-heading");
        const countEl = document.getElementById("catalog-count");
        const tabsBar = document.getElementById("n3-subject-tabs");
        const vocabTab = document.getElementById("n3-tab-vocab");
        const grammarTab = document.getElementById("n3-tab-grammar");
        const vocabPanel = document.getElementById("lib-vocab-panel");
        const grammarPanel = document.getElementById("lib-grammar-panel");

        if (headingEl) {
            headingEl.textContent = `Mục lục ${meta.code}`;
        }

        if (tabsBar) {
            tabsBar.hidden = !hasGrammar;
            tabsBar.classList.toggle("hidden", !hasGrammar);
            tabsBar.setAttribute("aria-label", `Nội dung ${meta.code}`);
        }

        if (vocabTab) {
            vocabTab.setAttribute("aria-selected", String(!showGrammar));
            vocabTab.tabIndex = !showGrammar ? 0 : -1;
        }
        if (grammarTab) {
            grammarTab.setAttribute("aria-selected", String(showGrammar));
            grammarTab.tabIndex = showGrammar ? 0 : -1;
        }

        if (vocabPanel) {
            vocabPanel.hidden = showGrammar;
            vocabPanel.classList.toggle("hidden", showGrammar);
        }
        if (grammarPanel) {
            grammarPanel.hidden = !showGrammar;
            grammarPanel.classList.toggle("hidden", !showGrammar);
        }

        if (showGrammar) {
            const GrammarView = global.MimiGrammarView;
            if (countEl) {
                const cachedCount = GrammarView ? GrammarView.getGrammarCount(state.currentLevel) : null;
                countEl.textContent = cachedCount !== null
                    ? `${cachedCount} bài ngữ pháp`
                    : `Ngữ pháp ${meta.code}`;
            }
            if (GrammarView) {
                GrammarView.renderGrammarSection(state.currentLevel);
            }
        } else {
            const levelUnits = AppState.getCurrentLevelUnits();
            const levelVocab = AppState.getCurrentLevelVocab();
            if (countEl) {
                const unitLabel = state.currentLevel === "n3" ? "unit" : "bài học";
                countEl.textContent = `${levelUnits.length} ${unitLabel} · ${levelVocab.length} từ`;
            }
        }
    }

    function getDefaultOpenUnitId(levelUnits, activeSession) {
        if (!levelUnits || levelUnits.length === 0) return null;
        if (activeSession && activeSession.levelId === state.currentLevel) {
            const found = levelUnits.find((u) => u.id === activeSession.unitId);
            if (found) return found.id;
        }
        const rec = getRecommendedNextBatchForCurrentLevel();
        if (rec && rec.entry && rec.entry.unit) {
            return rec.entry.unit.id;
        }
        return levelUnits[0].id;
    }

    function renderUnitsList() {
        const container = document.getElementById("units-container");
        if (!container) return;

        const levelUnits = AppState.getCurrentLevelUnits();
        const meta = AppState.getCurrentLevelMeta();

        if (levelUnits.length === 0) {
            container.innerHTML = `
                <div class="lib-empty-note">
                    Chưa có bài học nào cho <strong>${escapeHtml(meta.name)}</strong>.
                </div>
            `;
            return;
        }

        const masteredSet = new Set(Storage.getMasteredIds());
        const completedBatches = Storage.getCompletedBatches();
        const activeSession = Storage.getActiveSession();
        const defaultOpenId = getDefaultOpenUnitId(levelUnits, activeSession);

        container.innerHTML = levelUnits.map((unit) => {
            const totalItems = unit.items.length;
            const masteredInUnit = unit.items.filter((i) => masteredSet.has(i.id)).length;
            const masteryPct = totalItems > 0 ? Math.round((masteredInUnit / totalItems) * 100) : 0;
            const isOpen = unit.id === defaultOpenId;

            const batchesHtml = unit.batches.map((batch) => {
                const record = completedBatches[batch.batchKey];
                const isActiveBatch = Boolean(
                    activeSession &&
                    activeSession.unitId === unit.id &&
                    activeSession.part === batch.part
                );

                let badgeHtml = `<span class="lib-batch-badge">${batch.items.length} từ</span>`;
                if (isActiveBatch) {
                    badgeHtml = `<span class="lib-batch-badge is-active">Đang học ${activeSession.currentIndex + 1}/${activeSession.questions.length}</span>`;
                } else if (record) {
                    badgeHtml = `<span class="lib-batch-badge is-done">✓ ${record.bestPct}%</span>`;
                }

                const unitIdAttr = escapeJsAttr(unit.id);
                const partAttr = escapeJsAttr(batch.part);

                return `
                    <div class="lib-batch-card ${isActiveBatch ? "is-active" : (record ? "is-done" : "")}">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-1">
                                <span class="lib-batch-part">${escapeHtml(batch.part)}</span>
                                ${badgeHtml}
                            </div>
                            <div class="lib-batch-title">
                                ${escapeHtml(batch.partTitle || "Nhóm từ vựng")}
                            </div>
                            <div class="lib-batch-count">${batch.items.length} từ vựng</div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 pt-2">
                            <button type="button" onclick="MimiApp.openBatchPreview('${unitIdAttr}', '${partAttr}')"
                                class="lib-btn-outline">
                                Xem từ
                            </button>
                            <button type="button" onclick="MimiApp.startBatchQuiz('${unitIdAttr}', '${partAttr}')"
                                class="lib-btn-primary">
                                Làm bài
                            </button>
                        </div>
                    </div>
                `;
            }).join("");

            return `
                <details id="unit-card-${escapeHtml(unit.id)}" class="lib-unit scroll-mt-24" ${isOpen ? "open" : ""}>
                    <summary class="lib-unit-summary">
                        <small class="lib-unit-code">${escapeHtml(unit.code)}</small>
                        <span class="lib-unit-title jp-text">${escapeHtml(unit.title)}</span>
                        <span class="lib-unit-progress">${masteredInUnit}/${totalItems} (${masteryPct}%)</span>
                    </summary>
                    <div class="lib-unit-body">
                        <div class="lib-unit-bar-row">
                            <span class="lib-unit-range">Từ ${escapeHtml(unit.range)} · ${totalItems} từ</span>
                            <div class="lib-unit-track" aria-hidden="true">
                                <div class="lib-unit-fill" style="width: ${masteryPct}%"></div>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            ${batchesHtml}
                        </div>
                        <div class="lib-unit-footer">
                            <button type="button" onclick="MimiApp.startUnitAllQuiz('${escapeJsAttr(unit.id)}')"
                                class="lib-btn-unit-all">
                                <span>Ôn toàn bộ ${escapeHtml(unit.code)} (${totalItems} từ)</span>
                                <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    </div>
                </details>
            `;
        }).join("");
    }

    function scrollToUnit(unitId) {
        const el = document.getElementById(`unit-card-${unitId}`);
        if (el) {
            if (el.tagName === "DETAILS") el.open = true;
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    global.MimiHomeView = {
        selectLevel,
        selectLevelFromHeader,
        selectN3Tab,
        setupN3TabKeyboard,
        jumpToLibrarySection,
        focusGlobalSearch,
        scrollToUnit,
        setStudyMode,
        renderLoadingState,
        renderHome,
        renderContinueCard,
        renderLevelHeader,
        renderLevelSwitcher,
        renderModeSwitcher,
        renderMistakeBanner,
        renderGlobalStats,
        renderCatalogPanels,
        renderUnitsList
    };
})(window);
