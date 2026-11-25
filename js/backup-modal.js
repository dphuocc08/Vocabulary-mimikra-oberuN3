(function (global) {
    const Storage = global.MimiStorage;
    const { state } = global.MimiAppState;

    function openBackupModal() {
        const modal = document.getElementById("backup-modal");
        const statusEl = document.getElementById("backup-status-msg");
        if (statusEl) {
            statusEl.classList.add("hidden");
            statusEl.textContent = "";
        }
        if (modal) modal.classList.remove("hidden");
    }

    function closeBackupModal() {
        const modal = document.getElementById("backup-modal");
        if (modal) modal.classList.add("hidden");
    }

    function downloadBackup() {
        const json = Storage.exportBackup();
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `mimikara-n3-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showBackupStatus("Đã tải xuống tệp sao lưu thành công!", true);
    }

    function handleImportFile(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const summary = Storage.importBackup(e.target.result);
                state.studyMode = Storage.getStudyMode();
                await global.MimiAppState.loadLevel(Storage.getSelectedLevel());
                global.MimiHomeView.renderHome();
                showBackupStatus(
                    `Khôi phục thành công! (${summary.masteredCount} từ đã nắm, ${summary.wrongCount} từ trong sổ tay, ${summary.batchCount} chặng).`,
                    true
                );
            } catch (err) {
                showBackupStatus(err.message || "Không thể đọc tệp sao lưu.", false);
            } finally {
                event.target.value = "";
            }
        };
        reader.readAsText(file, "UTF-8");
    }

    function showBackupStatus(message, isSuccess) {
        const statusEl = document.getElementById("backup-status-msg");
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.classList.remove("hidden", "bg-emerald-50", "text-emerald-700", "border-emerald-200", "bg-rose-50", "text-rose-700", "border-rose-200");
        if (isSuccess) {
            statusEl.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-200");
        } else {
            statusEl.classList.add("bg-rose-50", "text-rose-700", "border-rose-200");
        }
    }

    function setupBackupListener() {
        const importFileInput = document.getElementById("backup-import-file");
        if (importFileInput) {
            importFileInput.addEventListener("change", handleImportFile);
        }
    }

    global.MimiBackupModal = {
        openBackupModal,
        closeBackupModal,
        downloadBackup,
        setupBackupListener
    };
})(window);
