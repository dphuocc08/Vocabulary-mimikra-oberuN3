(function (global) {
    const Storage = global.MimiStorage;
    const AppState = global.MimiAppState;
    const { state, escapeHtml, escapeJsAttr, formatShortPart, showScreen } = AppState;

    const LEVEL_STYLES = {
        sky: {
            badge: "bg-sky-600 text-white",
            pill: "bg-sky-50 text-sky-700 border-sky-200",
            activeBtn: "border-sky-500 bg-sky-50/90 text-sky-900 ring-2 ring-sky-500/20 shadow-xs",
            codePill: "bg-sky-600 text-white",
            heroGradient: "from-sky-600 via-sky-700 to-blue-800",
            ringColor: "text-sky-500"
        },
        indigo: {
            badge: "bg-indigo-600 text-white",
            pill: "bg-indigo-50 text-indigo-700 border-indigo-200",
            activeBtn: "border-indigo-500 bg-indigo-50/90 text-indigo-900 ring-2 ring-indigo-500/20 shadow-xs",
            codePill: "bg-indigo-600 text-white",
            heroGradient: "from-indigo-600 via-indigo-700 to-violet-800",
            ringColor: "text-indigo-500"
        },
        emerald: {
            badge: "bg-emerald-600 text-white",
            pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
            activeBtn: "border-emerald-500 bg-emerald-50/90 text-emerald-900 ring-2 ring-emerald-500/20 shadow-xs",
            codePill: "bg-emerald-600 text-white",
            heroGradient: "from-emerald-600 via-emerald-700 to-teal-800",
            ringColor: "text-emerald-500"
        }
    };

    let currentSpotlightItem = null;

    function getLevelStyle(accent) {
        return LEVEL_STYLES[accent] || LEVEL_STYLES.emerald;
    }

    function setStudyMode(mode) {
        state.studyMode = Storage.setStudyMode(mode);
        renderModeSwitcher();
    }

    function renderLoadingState(levelId) {
        const container = document.getElementById("units-container");
        if (container) {
            const label = (levelId || state.currentLevel || "n3").toUpperCase();
            container.innerHTML = `
                <div class="bg-white rounded-2xl p-8 border border-slate-200 text-center text-slate-500 text-sm">
                    ⏳ Đang tải dữ liệu từ vựng <strong>JLPT ${escapeHtml(label)}</strong>...
                </div>
            `;
        }
    }

    async function selectLevel(levelId) {
        if (!levelId || state.isLoadingLevel) return;
        if (levelId === state.currentLevel && AppState.getCurrentLevelUnits().length > 0) {
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
                    <div class="bg-rose-50 rounded-2xl p-6 border border-rose-200 text-center text-rose-700 text-sm">
                        ${escapeHtml(err.message || "Không thể tải dữ liệu cấp độ này.")}
                    </div>
                `;
            }
        }
    }

    function renderHome() {
        showScreen("selection-screen");
        renderLevelHeader();
        renderContinueCard();
        renderLevelSwitcher();
        renderModeSwitcher();
        renderMistakeBanner();
        renderUnitsList();
        renderGlobalStats();
        renderSidebarProgress();
        renderSidebarUnitNav();
        renderWordSpotlight(false);
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

        // Fallback for existing legacy progress stored in completedBatches
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

            container.classList.remove("hidden");
            container.innerHTML = `
                <div class="continue-card dashboard-card bg-white rounded-2xl p-4 sm:p-5 border-2 border-emerald-400/80 shadow-sm">
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                                <span>Phiên đang học dở</span>
                            </span>
                            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">${escapeHtml(modeText)}</span>
                            <span class="text-[11px] font-medium text-slate-500">${escapeHtml(stepText)}</span>
                        </div>
                        <div class="flex items-center gap-2 text-xs font-bold">
                            <span class="text-emerald-600">✓ ${session.correctCount}</span>
                            <span class="text-slate-300">|</span>
                            <span class="text-rose-500">✕ ${session.wrongCount}</span>
                        </div>
                    </div>

                    <button id="continue-learning-btn" type="button" onclick="MimiApp.resumeSavedSession()"
                        class="w-full py-3.5 px-4 sm:px-5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-xl text-sm sm:text-base shadow-sm transition flex items-center justify-between gap-3 text-left">
                        <span class="min-w-0 truncate">▶ ${escapeHtml(buttonLabel)}</span>
                        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                    </button>

                    <div class="mt-2.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <span class="truncate">${escapeHtml(partSummary)}</span>
                        <span class="shrink-0 font-semibold text-emerald-700">${pct}%</span>
                    </div>
                    <div class="mt-1.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div class="bg-emerald-500 h-full transition-all duration-300" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
            return;
        }

        const recommendation = getRecommendedNextBatchForCurrentLevel();
        if (!recommendation) {
            container.classList.add("hidden");
            container.innerHTML = "";
            return;
        }

        if (recommendation.kind === "all_completed") {
            const lvlCode = recommendation.levelMeta.code;
            container.classList.remove("hidden");
            container.innerHTML = `
                <div class="continue-card dashboard-card bg-white rounded-2xl p-4 sm:p-5 border border-emerald-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="space-y-1">
                        <span class="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">🏆 Hoàn thành ${escapeHtml(lvlCode)}</span>
                        <div class="font-bold text-slate-900 text-sm sm:text-base">Bạn đã đi qua toàn bộ các chặng của JLPT ${escapeHtml(lvlCode)}!</div>
                        <div class="text-xs text-slate-500">Hãy ôn tổng hợp ngẫu nhiên hoặc chuyển sang cấp độ tiếp theo.</div>
                    </div>
                    <button id="continue-learning-btn" type="button" onclick="MimiApp.startGlobalRandomQuiz(20)"
                        class="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-xs transition shrink-0">
                        ⚡ Ôn tổng hợp ${escapeHtml(lvlCode)}
                    </button>
                </div>
            `;
            return;
        }

        const { entry, kind, prevLabel } = recommendation;
        const shortPart = formatShortPart(entry.batch.part);
        const unitIdAttr = escapeJsAttr(entry.unit.id);
        const partAttr = escapeJsAttr(entry.batch.part);
        const isFirst = kind === "first_batch";
        const badgeText = isFirst ? "Bắt đầu nhanh" : "Chặng tiếp theo";
        const btnPrefix = isFirst ? "Bắt đầu" : "Học tiếp";
        const buttonLabel = `${btnPrefix} ${entry.levelMeta.code} · ${entry.unit.code} · ${shortPart}`;
        const detailText = prevLabel
            ? `Vừa xong ${prevLabel} · ${entry.batch.partTitle || entry.batch.part} (${entry.batch.items.length} từ)`
            : `${entry.batch.part}${entry.batch.partTitle ? ` — ${entry.batch.partTitle}` : ""} (${entry.batch.items.length} từ)`;

        container.classList.remove("hidden");
        container.innerHTML = `
            <div class="continue-card dashboard-card bg-white rounded-2xl p-4 sm:p-5 border-2 border-emerald-300/80 shadow-xs">
                <div class="flex items-center justify-between gap-2 mb-2.5">
                    <span class="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        <span>${isFirst ? "✨" : "🚀"}</span>
                        <span>${escapeHtml(badgeText)}</span>
                    </span>
                    <span class="text-xs font-medium text-slate-500">${entry.batch.items.length} từ</span>
                </div>

                <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <button id="continue-learning-btn" type="button" onclick="MimiApp.startBatchQuiz('${unitIdAttr}', '${partAttr}')"
                        class="flex-grow py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold rounded-xl text-sm sm:text-base shadow-xs transition flex items-center justify-between gap-2 text-left">
                        <span class="min-w-0 truncate">${escapeHtml(buttonLabel)}</span>
                        <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                    </button>
                    <button type="button" onclick="MimiApp.openBatchPreview('${unitIdAttr}', '${partAttr}')"
                        class="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-sm transition shrink-0 text-center">
                        📖 Xem từ
                    </button>
                </div>

                <div class="mt-2 text-xs text-slate-500 truncate">${escapeHtml(detailText)}</div>
            </div>
        `;
    }

    function renderLevelHeader() {
        const meta = AppState.getCurrentLevelMeta();
        const style = getLevelStyle(meta.accent);

        const headerBadge = document.getElementById("header-level-badge");
        if (headerBadge) {
            headerBadge.textContent = meta.code;
            headerBadge.className = `${style.badge} font-bold px-2.5 py-1 rounded-xl text-sm shadow-xs transition group-hover:scale-105`;
        }

        const heroBanner = document.getElementById("hero-banner");
        if (heroBanner) {
            heroBanner.className = `hero-card relative overflow-hidden rounded-3xl p-6 sm:p-7 text-white shadow-md bg-gradient-to-br ${style.heroGradient}`;
        }

        const levelPill = document.getElementById("current-level-pill");
        if (levelPill) {
            levelPill.className = "inline-flex items-center space-x-2 bg-white/15 backdrop-blur-xs text-white text-xs font-bold px-3 py-1 rounded-full border border-white/25";
            levelPill.innerHTML = `<span>${escapeHtml(meta.name)}${meta.subtitle ? ` • ${escapeHtml(meta.subtitle)}` : ""}</span>`;
        }

        // Sync active level pills on header navigation bar
        const headerLevelBtns = document.querySelectorAll("[data-header-level]");
        headerLevelBtns.forEach((btn) => {
            const lvlId = btn.getAttribute("data-header-level");
            const isActive = lvlId === state.currentLevel;
            if (isActive) {
                btn.className = `px-2.5 py-1 rounded-md text-xs font-bold transition shadow-xs ${style.codePill}`;
            } else {
                btn.className = "px-2.5 py-1 rounded-md text-xs font-bold transition text-slate-600 hover:text-slate-900";
            }
        });
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

    function focusGlobalSearch() {
        showScreen("selection-screen");
        renderLevelHeader();
        renderMistakeBanner();
        const input = document.getElementById("global-search-input");
        if (input) {
            input.scrollIntoView({ behavior: "smooth", block: "center" });
            setTimeout(() => input.focus(), 120);
        }
    }

    function renderLevelSwitcher() {
        const container = document.getElementById("level-switcher");
        if (!container) return;

        container.innerHTML = state.levels.map((lvl) => {
            const isActive = lvl.id === state.currentLevel;
            const style = getLevelStyle(lvl.accent);
            const btnClass = isActive
                ? style.activeBtn
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
            const unitCount = Array.isArray(lvl.units) ? lvl.units.length : 0;

            return `
                <button type="button" onclick="MimiApp.selectLevel('${escapeHtml(lvl.id)}')"
                    class="p-3 rounded-xl border-2 text-left transition flex flex-col justify-between ${btnClass}">
                    <div class="flex items-center justify-between gap-1">
                        <span class="text-sm sm:text-base font-bold">${escapeHtml(lvl.code)}</span>
                        ${isActive ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${style.codePill}">Đang học</span>` : `<span class="text-[11px] text-slate-400 font-medium">${unitCount} bài</span>`}
                    </div>
                    <span class="text-xs text-slate-500 mt-1 line-clamp-1">${escapeHtml(lvl.subtitle || lvl.name)}</span>
                </button>
            `;
        }).join("");
    }

    function renderModeSwitcher() {
        const modes = ["two_step", "context_fill", "listen_meaning"];
        const activeClasses = "border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-sm";
        const inactiveClasses = "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50";

        for (const mode of modes) {
            const btn = document.getElementById(`mode-btn-${mode}`);
            const badge = document.getElementById(`mode-badge-${mode}`);
            const isSelected = state.studyMode === mode;
            if (btn) {
                btn.className = `p-4 rounded-xl border-2 text-left transition flex flex-col justify-between ${isSelected ? activeClasses : inactiveClasses}`;
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

        const countEl = document.getElementById("mistake-banner-count");
        const descEl = document.getElementById("mistake-banner-desc");
        const startBtn = document.getElementById("mistake-banner-start-btn");
        const viewBtn = document.getElementById("mistake-banner-view-btn");
        const cardEl = document.getElementById("mistake-banner-card");
        const headerMistakeCount = document.getElementById("header-mistake-count");

        if (headerMistakeCount) {
            headerMistakeCount.textContent = String(count);
            headerMistakeCount.classList.toggle("hidden", count === 0);
        }

        // Sync Desktop Right Sidebar Mistake Card
        const sbCard = document.getElementById("sidebar-mistake-card");
        const sbCount = document.getElementById("sidebar-mistake-count");
        const sbDesc = document.getElementById("sidebar-mistake-desc");
        const sbStartBtn = document.getElementById("sidebar-mistake-start-btn");
        const sbViewBtn = document.getElementById("sidebar-mistake-view-btn");

        if (sbCard) {
            if (count > 0) {
                sbCard.className = "hidden lg:block dashboard-card rounded-2xl p-5 border-2 border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50/40 shadow-xs space-y-3";
                sbCount.textContent = `${count} từ`;
                sbCount.className = "text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white";
                sbDesc.textContent = `Bạn có ${count} từ ${meta.code} cần ôn lại để xóa nợ khỏi sổ tay.`;
                sbStartBtn.disabled = false;
                sbStartBtn.className = "px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs shadow-xs transition";
                sbViewBtn.className = "px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-semibold rounded-xl text-xs transition";
            } else {
                sbCard.className = "hidden lg:block dashboard-card rounded-2xl p-5 border border-emerald-200 bg-emerald-50/50 shadow-xs space-y-3";
                sbCount.textContent = "0 từ";
                sbCount.className = "text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white";
                sbDesc.textContent = `Tuyệt vời! Chưa có từ sai nào ở ${meta.code}.`;
                sbStartBtn.disabled = true;
                sbStartBtn.className = "px-3 py-2 bg-slate-200 text-slate-400 font-semibold rounded-xl text-xs cursor-not-allowed";
                sbViewBtn.className = "px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold rounded-xl text-xs transition";
            }
        }

        if (!cardEl) return;

        if (count > 0) {
            cardEl.className = "lg:hidden rounded-2xl p-5 sm:p-6 border-2 border-rose-200 bg-gradient-to-r from-rose-50 via-white to-amber-50/40 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4";
            countEl.textContent = `${count} từ (${meta.code})`;
            countEl.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-rose-600 text-white";
            descEl.textContent = `Tự động lưu các từ làm sai của ${meta.name}. Làm đúng lại trong Sổ tay để tự động xóa nợ!`;
            startBtn.disabled = false;
            startBtn.className = "px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-sm shadow-sm transition flex items-center justify-center space-x-1.5";
            viewBtn.className = "px-4 py-2.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-semibold rounded-xl text-sm transition";
        } else {
            cardEl.className = "lg:hidden rounded-2xl p-5 sm:p-6 border border-emerald-200 bg-emerald-50/50 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4";
            countEl.textContent = `0 từ sai (${meta.code})`;
            countEl.className = "text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-600 text-white";
            descEl.textContent = `Tuyệt vời! Bạn chưa có từ nào bị sai ở ${meta.name} hoặc đã xóa nợ hết toàn bộ.`;
            startBtn.disabled = true;
            startBtn.className = "px-4 py-2.5 bg-slate-200 text-slate-400 font-semibold rounded-xl text-sm cursor-not-allowed flex items-center justify-center space-x-1.5";
            viewBtn.className = "px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 font-semibold rounded-xl text-sm transition";
        }
    }

    function renderGlobalStats() {
        const levelVocab = AppState.getCurrentLevelVocab();
        const masteredSet = new Set(Storage.getMasteredIds());
        const masteredCount = levelVocab.filter((v) => masteredSet.has(v.id)).length;
        const meta = AppState.getCurrentLevelMeta();
        const totalEl = document.getElementById("global-vocab-stats");
        if (totalEl) {
            totalEl.textContent = `Kho ${meta.code}: ${levelVocab.length} từ • Đã nắm: ${masteredCount}/${levelVocab.length}`;
        }
    }

    function renderUnitsList() {
        const container = document.getElementById("units-container");
        if (!container) return;

        const levelUnits = AppState.getCurrentLevelUnits();
        const meta = AppState.getCurrentLevelMeta();
        const style = getLevelStyle(meta.accent);

        if (levelUnits.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-2xl p-8 border border-dashed border-slate-300 text-center text-slate-500 text-sm">
                    Chưa có bài học nào cho <strong>${escapeHtml(meta.name)}</strong>.
                </div>
            `;
            return;
        }

        const masteredSet = new Set(Storage.getMasteredIds());
        const completedBatches = Storage.getCompletedBatches();
        const activeSession = Storage.getActiveSession();

        container.innerHTML = levelUnits.map((unit) => {
            const totalItems = unit.items.length;
            const masteredInUnit = unit.items.filter((i) => masteredSet.has(i.id)).length;
            const masteryPct = totalItems > 0 ? Math.round((masteredInUnit / totalItems) * 100) : 0;

            const batchesHtml = unit.batches.map((batch) => {
                const record = completedBatches[batch.batchKey];
                const isActiveBatch = Boolean(
                    activeSession &&
                    activeSession.unitId === unit.id &&
                    activeSession.part === batch.part
                );
                let badgeHtml = `<span class="text-xs text-slate-400 font-medium">${batch.items.length} từ</span>`;
                if (isActiveBatch) {
                    badgeHtml = `<span class="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">Đang học ${activeSession.currentIndex + 1}/${activeSession.questions.length}</span>`;
                } else if (record) {
                    badgeHtml = `<span class="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">✓ ${record.bestPct}%</span>`;
                }

                const borderCls = isActiveBatch
                    ? "border-amber-300 bg-amber-50/40"
                    : (record ? "border-emerald-300/80 bg-slate-50" : "border-slate-200 bg-slate-50");
                const unitIdAttr = escapeJsAttr(unit.id);
                const partAttr = escapeJsAttr(batch.part);

                return `
                    <div class="p-4 border ${borderCls} hover:border-emerald-400 rounded-xl text-left transition flex flex-col justify-between gap-3">
                        <div>
                            <div class="flex items-center justify-between gap-2 mb-1.5">
                                <span class="text-xs font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded">${escapeHtml(batch.part)}</span>
                                ${badgeHtml}
                            </div>
                            <div class="font-semibold text-slate-800 text-sm leading-snug">
                                ${escapeHtml(batch.partTitle || "Nhóm từ vựng")}
                            </div>
                            <div class="text-xs text-slate-500 mt-1">${batch.items.length} từ vựng</div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 pt-1">
                            <button type="button" onclick="MimiApp.openBatchPreview('${unitIdAttr}', '${partAttr}')"
                                class="py-2 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs sm:text-sm transition text-center">
                                Xem từ
                            </button>
                            <button type="button" onclick="MimiApp.startBatchQuiz('${unitIdAttr}', '${partAttr}')"
                                class="py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-xs transition text-center">
                                Làm bài
                            </button>
                        </div>
                    </div>
                `;
            }).join("");

            return `
                <div id="unit-card-${escapeHtml(unit.id)}" class="dashboard-card scroll-mt-36 bg-white rounded-2xl p-5 sm:p-6 shadow-xs border border-slate-200">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                            <div class="flex items-center space-x-2 mb-1">
                                <span class="${style.codePill} text-xs font-bold px-2.5 py-0.5 rounded-md">${escapeHtml(unit.code)}</span>
                                <span class="text-xs font-mono text-slate-500">Từ ${escapeHtml(unit.range)} (${totalItems} từ)</span>
                            </div>
                            <h3 class="text-lg sm:text-xl font-bold text-slate-900 jp-text">${escapeHtml(unit.title)}</h3>
                        </div>
                        <div class="flex flex-col sm:items-end gap-1.5">
                            <div class="text-xs font-semibold text-slate-600">
                                Tiến độ nắm vững: <span class="text-emerald-700 font-bold">${masteredInUnit}/${totalItems} (${masteryPct}%)</span>
                            </div>
                            <div class="w-full sm:w-44 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div class="bg-emerald-500 h-full transition-all duration-300" style="width: ${masteryPct}%"></div>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        ${batchesHtml}
                    </div>

                    <div class="pt-3 border-t border-slate-100 flex justify-end">
                        <button onclick="MimiApp.startUnitAllQuiz('${escapeHtml(unit.id)}')"
                            class="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center space-x-2">
                            <span>Ôn toàn bộ ${escapeHtml(unit.code)} (${totalItems} từ)</span>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderSidebarProgress() {
        const levelVocab = AppState.getCurrentLevelVocab();
        const levelUnits = AppState.getCurrentLevelUnits();
        const meta = AppState.getCurrentLevelMeta();
        const style = getLevelStyle(meta.accent);
        const masteredSet = new Set(Storage.getMasteredIds());
        const completedBatches = Storage.getCompletedBatches();

        const total = levelVocab.length;
        const mastered = levelVocab.filter((v) => masteredSet.has(v.id)).length;
        const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

        let totalBatches = 0;
        let doneBatches = 0;
        for (const u of levelUnits) {
            for (const b of u.batches) {
                totalBatches += 1;
                if (completedBatches[b.batchKey]) doneBatches += 1;
            }
        }

        const tagEl = document.getElementById("sidebar-level-tag");
        if (tagEl) {
            tagEl.textContent = meta.code;
            tagEl.className = `text-[11px] font-bold px-2 py-0.5 rounded-md ${style.codePill}`;
        }

        const pctEl = document.getElementById("sidebar-mastery-pct");
        const masteredEl = document.getElementById("sidebar-mastered-count");
        const totalEl = document.getElementById("sidebar-total-count");
        const batchesEl = document.getElementById("sidebar-batches-count");
        const ringEl = document.getElementById("sidebar-ring-circle");

        if (pctEl) pctEl.textContent = `${pct}%`;
        if (masteredEl) masteredEl.textContent = String(mastered);
        if (totalEl) totalEl.textContent = String(total);
        if (batchesEl) batchesEl.textContent = `${doneBatches}/${totalBatches}`;

        if (ringEl) {
            const circumference = 201.06;
            const offset = circumference - (pct / 100) * circumference;
            ringEl.style.strokeDashoffset = String(offset);
            ringEl.setAttribute("class", `${style.ringColor} transition-all duration-500`);
        }
    }

    function renderSidebarUnitNav() {
        const container = document.getElementById("sidebar-unit-nav");
        const countEl = document.getElementById("sidebar-unit-count");
        if (!container) return;

        const levelUnits = AppState.getCurrentLevelUnits();
        const masteredSet = new Set(Storage.getMasteredIds());
        if (countEl) countEl.textContent = `${levelUnits.length} bài`;

        if (levelUnits.length === 0) {
            container.innerHTML = `<div class="text-xs text-slate-400 py-3 text-center">Chưa có bài học.</div>`;
            return;
        }

        container.innerHTML = levelUnits.map((unit) => {
            const total = unit.items.length;
            const mastered = unit.items.filter((i) => masteredSet.has(i.id)).length;
            const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;

            return `
                <button type="button" onclick="MimiApp.scrollToUnit('${escapeHtml(unit.id)}')"
                    class="w-full px-3 py-2 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 text-left transition flex items-center justify-between gap-2 group">
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-slate-800 group-hover:text-emerald-700 truncate">${escapeHtml(unit.code)}</div>
                        <div class="text-[11px] text-slate-500 truncate">${escapeHtml(unit.title)}</div>
                    </div>
                    <span class="text-[11px] font-bold shrink-0 px-1.5 py-0.5 rounded-md ${pct === 100 ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-500 border border-slate-200"}">${pct}%</span>
                </button>
            `;
        }).join("");
    }

    function scrollToUnit(unitId) {
        const el = document.getElementById(`unit-card-${unitId}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function renderWordSpotlight(forceNew) {
        const container = document.getElementById("word-spotlight-body");
        if (!container) return;

        const levelVocab = AppState.getCurrentLevelVocab();
        if (levelVocab.length === 0) {
            container.innerHTML = `<div class="text-xs text-slate-400 py-4 text-center">Chưa có dữ liệu từ vựng.</div>`;
            return;
        }

        if (forceNew || !currentSpotlightItem || (currentSpotlightItem.level || "n3") !== state.currentLevel) {
            const idx = Math.floor(Math.random() * levelVocab.length);
            currentSpotlightItem = levelVocab[idx];
        }

        const item = currentSpotlightItem;
        const Engine = global.MimiQuizEngine;
        const reading = Engine ? Engine.getPrimaryReading(item.reading) : item.reading;
        const sentence = Engine ? Engine.fillBlank(item.sentence, item.word) : (item.sentence || "");

        container.innerHTML = `
            <div class="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <div class="text-[11px] font-semibold text-emerald-700 mb-0.5">${escapeHtml(item.unitCode || "")}</div>
                        <div class="jp-text text-xl font-bold text-slate-900 leading-snug">${escapeHtml(item.word)}</div>
                        <div class="jp-text text-xs font-semibold text-emerald-700">【${escapeHtml(item.reading)}】</div>
                    </div>
                    <button type="button" onclick="MimiApp.speakSpecific('${escapeHtml(reading)}')"
                        title="Nghe phát âm"
                        class="p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold shrink-0 transition">
                        🔊
                    </button>
                </div>
                <div class="text-sm font-semibold text-slate-800 pt-1 border-t border-slate-200/70">
                    ${escapeHtml(item.meaning)}
                </div>
                ${sentence ? `<p class="jp-text text-xs text-slate-500 leading-relaxed">${escapeHtml(sentence)}</p>` : ""}
            </div>
        `;
    }

    function refreshWordSpotlight() {
        renderWordSpotlight(true);
    }

    global.MimiHomeView = {
        selectLevel,
        selectLevelFromHeader,
        focusGlobalSearch,
        scrollToUnit,
        refreshWordSpotlight,
        setStudyMode,
        renderLoadingState,
        renderHome,
        renderContinueCard,
        renderLevelHeader,
        renderLevelSwitcher,
        renderModeSwitcher,
        renderMistakeBanner,
        renderGlobalStats,
        renderUnitsList
    };
})(window);
