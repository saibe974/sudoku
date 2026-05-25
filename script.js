document.addEventListener('DOMContentLoaded', function () {
    const SIZE = 9;

    const gridEl = document.getElementById('grid');
    const gridWrapperEl = document.querySelector('.grid-wrapper');
    const givenModeEl = document.getElementById('givenMode');
    const statusEl = document.getElementById('status');

    const downloadBtn = document.getElementById('downloadBtn');
    const fileInput = document.getElementById('fileInput');
    const photoInput = document.getElementById('photoInput');
    const photoPreviewPanelEl = document.getElementById('photoPreviewPanel');
    const photoPreviewImgEl = document.getElementById('photoPreviewImg');
    const photoPreviewFrameEl = document.getElementById('photoPreviewFrame');
    const photoCornersOverlayEl = document.getElementById('photoCornersOverlay');
    const photoCornersPolygonEl = document.getElementById('photoCornersPolygon');
    const overlayNumpadEl = document.getElementById('overlayNumpad');
    const photoNextStepBtn = document.getElementById('photoNextStepBtn');
    const photoPrevStepBtn = document.getElementById('photoPrevStepBtn');
    const photoRunBtn = document.getElementById('photoRunBtn');
    const photoCancelBtn = document.getElementById('photoCancelBtn');
    const photoWarpPanelEl = document.getElementById('photoWarpPanel');
    const photoWarpPreviewImgEl = document.getElementById('photoWarpPreviewImg');
    const photoWarpLinesOverlayEl = document.getElementById('photoWarpLinesOverlay');
    const photoWarpGridOverlayEl = document.getElementById('photoWarpGridOverlay');
    const ocrBrightnessEl = document.getElementById('ocrBrightness');
    const ocrContrastEl = document.getElementById('ocrContrast');
    const ocrBlockSizeEl = document.getElementById('ocrBlockSize');
    const ocrThresholdCEl = document.getElementById('ocrThresholdC');
    const ocrDenoiseEl = document.getElementById('ocrDenoise');
    const ocrLineCleanupEl = document.getElementById('ocrLineCleanup');
    const ocrStrictBorderEl = document.getElementById('ocrStrictBorder');
    const ocrResetTuningBtn = document.getElementById('ocrResetTuningBtn');
    const ocrSaveTuningBtn = document.getElementById('ocrSaveTuningBtn');
    const photoWarpSettingsMetaEl = document.getElementById('photoWarpSettingsMeta');
    const exampleBtn = document.getElementById('exampleBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const clearValuesBtn = document.getElementById('clearValuesBtn');
    const gridPlayMenuEl = document.getElementById('gridPlayMenu');
    const gridMenuValuesBtn = document.getElementById('gridMenuValuesBtn');
    const gridMenuCandidatesBtn = document.getElementById('gridMenuCandidatesBtn');
    const gridMenuHintBtn = document.getElementById('gridMenuHintBtn');
    const gridMenuSolveBtn = document.getElementById('gridMenuSolveBtn');
    const toggleCandidatesBtn = document.getElementById('toggleCandidatesBtn');
    const toggleValuesBtn = document.getElementById('toggleValuesBtn');
    const hintBtn = document.getElementById('hintBtn');
    const nextStepBtn = document.getElementById('nextStepBtn');
    const burgerMenuBtn = document.getElementById('burgerMenuBtn');
    const mainToolsEl = document.getElementById('mainTools');

    let pendingPhotoFile = null;
    let pendingPhotoUrl = null;
    let pendingPhotoCornerRatios = null;
    let pendingWarpValues = null;
    let pendingWarpAnalysis = null;
    let pendingWarpGrayBase = null;
    let pendingWarpGeometry = null;
    let overlayCellOcrInProgress = false;
    let overlayNumpadTarget = null;
    let dragCornerIndex = -1;
    let hasManualCornerEdits = false;
    let usingFallbackCorners = false;
    let photoImportInProgress = false;
    let statusHideTimer = null;

    const STATUS_AUTO_HIDE_MS = 4000;
    const MOBILE_BREAKPOINT = 768;
    const LIGHT_THEME_BREAKPOINT = 980;

    const DEFAULT_OCR_TUNING = {
        brightness: 0,
        contrast: 130,
        blockSize: 15,
        thresholdC: 6,
        denoise: 1
    };

    function setStatus(msg, type = '') {
        if (!statusEl) return;

        if (statusHideTimer) {
            clearTimeout(statusHideTimer);
            statusHideTimer = null;
        }

        statusEl.classList.remove('status-hidden');
        statusEl.textContent = msg;
        statusEl.className = 'status ' + (type || '');

        statusHideTimer = setTimeout(() => {
            if (!statusEl) return;
            statusEl.classList.add('status-hidden');
        }, STATUS_AUTO_HIDE_MS);
    }

    function applyThemeByWidth() {
        const useLight = window.innerWidth <= LIGHT_THEME_BREAKPOINT;
        document.body.classList.toggle('theme-light', useLight);
        document.body.classList.toggle('theme-dark', !useLight);
    }

    function syncMobileToolsState() {
        const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
        if (!isMobile) {
            document.body.classList.remove('mobile-tools-open');
        }

        if (mainToolsEl) {
            const open = !isMobile || document.body.classList.contains('mobile-tools-open');
            mainToolsEl.setAttribute('aria-hidden', open ? 'false' : 'true');
        }

        if (burgerMenuBtn) {
            const expanded = isMobile && document.body.classList.contains('mobile-tools-open');
            burgerMenuBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }
    }

    function callCandidatesRender() {
        if (window.SudokuUI && typeof window.SudokuUI.reRender === 'function') {
            window.SudokuUI.reRender();
        }
    }

    function setGridPlayMenuVisible(visible) {
        if (!gridPlayMenuEl) return;
        gridPlayMenuEl.hidden = !visible;
    }

    function computeGridHasValues(values) {
        if (!Array.isArray(values) || values.length !== SIZE) return false;
        for (let r = 0; r < SIZE; r++) {
            if (!Array.isArray(values[r])) continue;
            for (let c = 0; c < SIZE; c++) {
                const v = Number(values[r][c] || 0);
                if (v >= 1 && v <= 9) return true;
            }
        }
        return false;
    }

    function refreshGridPlayMenuVisibility() {
        const state = getState();
        setGridPlayMenuVisible(computeGridHasValues(state.values));
    }

    function buildGrid() {
        if (!gridEl) return;

        if (gridEl.rows && gridEl.rows.length > 0) return;

        const tbody = document.createElement('tbody');
        for (let r = 0; r < SIZE; r++) {
            const tr = document.createElement('tr');
            for (let c = 0; c < SIZE; c++) {
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.maxLength = 1;
                input.className = 'cell-input';
                input.dataset.r = r;
                input.dataset.c = c;

                input.addEventListener('beforeinput', (e) => {
                    if (e.inputType === 'insertText' && !/[1-9]/.test(e.data || '')) {
                        e.preventDefault();
                    }
                });

                input.addEventListener('keydown', (e) => {
                    const row = Number(input.dataset.r);
                    const col = Number(input.dataset.c);

                    if (e.key === 'Backspace' || e.key === 'Delete') {
                        input.value = '';
                        e.preventDefault();
                        updateConflicts();
                        callCandidatesRender();
                        return;
                    }

                    const navTo = (nr, nc) => {
                        const next = document.querySelector('input[data-r="' + nr + '"][data-c="' + nc + '"]');
                        if (next) next.focus();
                    };

                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        navTo(Math.max(0, row - 1), col);
                    }
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        navTo(Math.min(SIZE - 1, row + 1), col);
                    }
                    if (e.key === 'ArrowLeft') {
                        e.preventDefault();
                        navTo(row, Math.max(0, col - 1));
                    }
                    if (e.key === 'ArrowRight') {
                        e.preventDefault();
                        navTo(row, Math.min(SIZE - 1, col + 1));
                    }
                });

                input.addEventListener('input', () => {
                    input.value = input.value.replace(/[^1-9]/g, '').slice(0, 1);
                    updateConflicts();
                    callCandidatesRender();
                });

                td.appendChild(input);
                td.addEventListener('click', () => {
                    if (!givenModeEl || !givenModeEl.checked) return;
                    td.classList.toggle('given');
                });

                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        gridEl.appendChild(tbody);
    }

    function getState() {
        const values = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
        const givens = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
        const candidates = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => []));

        if (!gridEl || !gridEl.rows) {
            return { values, givens, candidates };
        }

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const td = gridEl.rows[r].cells[c];
                const input = td.querySelector('input');
                const v = Number(input ? input.value : 0);
                values[r][c] = (v >= 1 && v <= 9) ? v : 0;
                givens[r][c] = td.classList.contains('given');
                const candsRaw = td.dataset && typeof td.dataset.candidates === 'string'
                    ? td.dataset.candidates
                    : '[]';
                try {
                    const parsed = JSON.parse(candsRaw);
                    candidates[r][c] = Array.isArray(parsed) ? parsed : [];
                } catch (_) {
                    candidates[r][c] = [];
                }
            }
        }

        return { values, givens, candidates };
    }

    function setState(state) {
        if (!gridEl || !gridEl.rows) return;

        const values = state && state.values;
        const givens = state && state.givens;

        if (!Array.isArray(values) || values.length !== SIZE) {
            throw new Error('values doit etre 9x9');
        }
        if (!Array.isArray(givens) || givens.length !== SIZE) {
            throw new Error('givens doit etre 9x9');
        }

        for (let r = 0; r < SIZE; r++) {
            if (!Array.isArray(values[r]) || values[r].length !== SIZE) {
                throw new Error('values doit etre 9x9');
            }
            if (!Array.isArray(givens[r]) || givens[r].length !== SIZE) {
                throw new Error('givens doit etre 9x9');
            }

            for (let c = 0; c < SIZE; c++) {
                const td = gridEl.rows[r].cells[c];
                const input = td.querySelector('input');
                const v = Number(values[r][c] || 0);
                if (input) input.value = (v >= 1 && v <= 9) ? String(v) : '';
                td.classList.toggle('given', !!givens[r][c]);
            }
        }

        if (state && Array.isArray(state.candidates)) {
            for (let r = 0; r < SIZE; r++) {
                for (let c = 0; c < SIZE; c++) {
                    const td = gridEl.rows[r].cells[c];
                    const cands = state.candidates[r] && state.candidates[r][c] ? state.candidates[r][c] : [];
                    td.dataset.candidates = JSON.stringify(cands);
                }
            }
        }

        updateConflicts();
        callCandidatesRender();
        setGridPlayMenuVisible(computeGridHasValues(values));
    }

    function updateConflicts() {
        if (!gridEl || !gridEl.rows) return;

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                gridEl.rows[r].cells[c].classList.remove('cell-error');
            }
        }

        const state = getState();
        const values = state.values;

        const markDuplicates = (cells) => {
            const seen = new Map();
            cells.forEach((item) => {
                if (!item.v) return;
                if (!seen.has(item.v)) seen.set(item.v, []);
                seen.get(item.v).push(item);
            });

            seen.forEach((list) => {
                if (list.length > 1) {
                    list.forEach((cell) => {
                        gridEl.rows[cell.r].cells[cell.c].classList.add('cell-error');
                    });
                }
            });
        };

        for (let r = 0; r < SIZE; r++) {
            const row = [];
            for (let c = 0; c < SIZE; c++) row.push({ r, c, v: values[r][c] });
            markDuplicates(row);
        }

        for (let c = 0; c < SIZE; c++) {
            const col = [];
            for (let r = 0; r < SIZE; r++) col.push({ r, c, v: values[r][c] });
            markDuplicates(col);
        }

        for (let br = 0; br < 3; br++) {
            for (let bc = 0; bc < 3; bc++) {
                const block = [];
                for (let r = br * 3; r < br * 3 + 3; r++) {
                    for (let c = bc * 3; c < bc * 3 + 3; c++) {
                        block.push({ r, c, v: values[r][c] });
                    }
                }
                markDuplicates(block);
            }
        }
    }

    function renderAllCells() {
        callCandidatesRender();
    }

    function validateState(obj) {
        if (!obj || typeof obj !== 'object') throw new Error('Objet JSON invalide.');
        const values = obj.values;
        const givens = obj.givens;

        if (!Array.isArray(values) || values.length !== SIZE) throw new Error('"values" doit etre 9x9.');
        if (!Array.isArray(givens) || givens.length !== SIZE) throw new Error('"givens" doit etre 9x9.');

        for (let r = 0; r < SIZE; r++) {
            if (!Array.isArray(values[r]) || values[r].length !== SIZE) throw new Error('"values" doit etre 9x9.');
            if (!Array.isArray(givens[r]) || givens[r].length !== SIZE) throw new Error('"givens" doit etre 9x9.');
            for (let c = 0; c < SIZE; c++) {
                const v = Number(values[r][c]);
                if (!Number.isFinite(v) || v < 0 || v > 9) throw new Error('Valeur hors plage.');
                if (typeof givens[r][c] !== 'boolean') throw new Error('Flag given invalide.');
            }
        }
    }

    function resetPhotoPreview() {
        hideOverlayNumpad();
        pendingPhotoFile = null;
        pendingPhotoCornerRatios = null;
        pendingWarpValues = null;
        pendingWarpAnalysis = null;
        usingFallbackCorners = false;
        hasManualCornerEdits = false;
        dragCornerIndex = -1;
        if (pendingPhotoUrl) {
            URL.revokeObjectURL(pendingPhotoUrl);
            pendingPhotoUrl = null;
        }

        if (photoPreviewImgEl) {
            photoPreviewImgEl.removeAttribute('src');
        }

        if (photoPreviewFrameEl) {
            photoPreviewFrameEl.hidden = false;
        }

        if (photoPreviewPanelEl) {
            photoPreviewPanelEl.hidden = true;
        }

        if (photoPrevStepBtn) {
            photoPrevStepBtn.disabled = true;
        }
        if (photoNextStepBtn) {
            photoNextStepBtn.disabled = false;
        }

        if (gridWrapperEl) {
            gridWrapperEl.hidden = false;
        }

        if (photoCornersOverlayEl) {
            photoCornersOverlayEl.hidden = true;
            photoCornersOverlayEl.classList.remove('fallback-corners');
            photoCornersOverlayEl.querySelectorAll('.corner-marker').forEach((m) => m.classList.remove('dragging'));
        }

        if (photoWarpPanelEl) {
            photoWarpPanelEl.hidden = true;
        }

        if (photoWarpPreviewImgEl) {
            photoWarpPreviewImgEl.removeAttribute('src');
        }

        if (photoInput) {
            photoInput.value = '';
        }

        if (pendingWarpGrayBase) {
            pendingWarpGrayBase.delete();
            pendingWarpGrayBase = null;
        }
    }

    function showPhotoPreview(file) {
        if (!file) return;

        if (pendingPhotoUrl) {
            URL.revokeObjectURL(pendingPhotoUrl);
            pendingPhotoUrl = null;
        }

        pendingPhotoFile = file;
        pendingPhotoUrl = URL.createObjectURL(file);
        usingFallbackCorners = false;

        if (photoPreviewImgEl) {
            photoPreviewImgEl.src = pendingPhotoUrl;
        }

        if (photoPreviewFrameEl) {
            photoPreviewFrameEl.hidden = false;
        }

        if (photoPreviewPanelEl) {
            photoPreviewPanelEl.hidden = false;
        }

        if (photoPrevStepBtn) {
            photoPrevStepBtn.disabled = true;
        }
        if (photoNextStepBtn) {
            photoNextStepBtn.disabled = false;
        }

        if (gridWrapperEl) {
            gridWrapperEl.hidden = true;
        }

        if (photoCornersOverlayEl) {
            photoCornersOverlayEl.hidden = true;
        }

        if (photoWarpPanelEl) {
            photoWarpPanelEl.hidden = true;
        }

        if (photoWarpPreviewImgEl) {
            photoWarpPreviewImgEl.removeAttribute('src');
        }

        hasManualCornerEdits = false;
    }

    function clearWarpPreview() {
        hideOverlayNumpad();
        pendingWarpValues = null;
        pendingWarpAnalysis = null;
        pendingWarpGeometry = null;
        if (photoWarpPreviewImgEl) {
            photoWarpPreviewImgEl.removeAttribute('src');
        }
        if (photoWarpPanelEl) {
            photoWarpPanelEl.hidden = true;
        }
        if (photoWarpGridOverlayEl) {
            photoWarpGridOverlayEl.hidden = true;
            photoWarpGridOverlayEl.innerHTML = '';
        }
        if (photoWarpLinesOverlayEl) {
            photoWarpLinesOverlayEl.hidden = true;
            photoWarpLinesOverlayEl.innerHTML = '';
        }

        if (pendingWarpGrayBase) {
            pendingWarpGrayBase.delete();
            pendingWarpGrayBase = null;
        }
    }

    function getOcrTuningFromControls() {
        const brightness = Number(ocrBrightnessEl ? ocrBrightnessEl.value : DEFAULT_OCR_TUNING.brightness);
        const contrast = Number(ocrContrastEl ? ocrContrastEl.value : DEFAULT_OCR_TUNING.contrast);
        const blockSizeRaw = Number(ocrBlockSizeEl ? ocrBlockSizeEl.value : DEFAULT_OCR_TUNING.blockSize);
        const thresholdC = Number(ocrThresholdCEl ? ocrThresholdCEl.value : DEFAULT_OCR_TUNING.thresholdC);
        const denoise = Number(ocrDenoiseEl ? ocrDenoiseEl.value : DEFAULT_OCR_TUNING.denoise);
        const blockSize = (blockSizeRaw % 2 === 0) ? blockSizeRaw + 1 : blockSizeRaw;
        return {
            brightness,
            contrast,
            blockSize,
            thresholdC,
            denoise
        };
    }

    const OCR_TUNING_STORAGE_KEY = 'sudoku_ocr_tuning';

    function saveOcrTuningToStorage() {
        try {
            const data = getOcrTuningFromControls();
            data.lineCleanup = ocrLineCleanupEl ? !!ocrLineCleanupEl.checked : true;
            data.strictBorder = ocrStrictBorderEl ? !!ocrStrictBorderEl.checked : true;
            localStorage.setItem(OCR_TUNING_STORAGE_KEY, JSON.stringify(data));
        } catch (_) { }
    }

    function loadOcrTuningFromStorage() {
        try {
            const raw = localStorage.getItem(OCR_TUNING_STORAGE_KEY);
            if (!raw) return false;
            const t = JSON.parse(raw);
            if (ocrBrightnessEl && t.brightness != null) ocrBrightnessEl.value = String(t.brightness);
            if (ocrContrastEl && t.contrast != null) ocrContrastEl.value = String(t.contrast);
            if (ocrBlockSizeEl && t.blockSize != null) ocrBlockSizeEl.value = String(t.blockSize);
            if (ocrThresholdCEl && t.thresholdC != null) ocrThresholdCEl.value = String(t.thresholdC);
            if (ocrDenoiseEl && t.denoise != null) ocrDenoiseEl.value = String(t.denoise);
            if (ocrLineCleanupEl && t.lineCleanup != null) ocrLineCleanupEl.checked = !!t.lineCleanup;
            if (ocrStrictBorderEl && t.strictBorder != null) ocrStrictBorderEl.checked = !!t.strictBorder;
            return true;
        } catch (_) { return false; }
    }

    function initOcrTuningControls() {
        if (!loadOcrTuningFromStorage()) {
            if (ocrBrightnessEl) ocrBrightnessEl.value = String(DEFAULT_OCR_TUNING.brightness);
            if (ocrContrastEl) ocrContrastEl.value = String(DEFAULT_OCR_TUNING.contrast);
            if (ocrBlockSizeEl) ocrBlockSizeEl.value = String(DEFAULT_OCR_TUNING.blockSize);
            if (ocrThresholdCEl) ocrThresholdCEl.value = String(DEFAULT_OCR_TUNING.thresholdC);
            if (ocrDenoiseEl) ocrDenoiseEl.value = String(DEFAULT_OCR_TUNING.denoise);
            if (ocrLineCleanupEl) ocrLineCleanupEl.checked = true;
            if (ocrStrictBorderEl) ocrStrictBorderEl.checked = true;
        }
    }

    function resetOcrTuningControls() {
        if (ocrBrightnessEl) ocrBrightnessEl.value = String(DEFAULT_OCR_TUNING.brightness);
        if (ocrContrastEl) ocrContrastEl.value = String(DEFAULT_OCR_TUNING.contrast);
        if (ocrBlockSizeEl) ocrBlockSizeEl.value = String(DEFAULT_OCR_TUNING.blockSize);
        if (ocrThresholdCEl) ocrThresholdCEl.value = String(DEFAULT_OCR_TUNING.thresholdC);
        if (ocrDenoiseEl) ocrDenoiseEl.value = String(DEFAULT_OCR_TUNING.denoise);
        if (ocrLineCleanupEl) ocrLineCleanupEl.checked = true;
        if (ocrStrictBorderEl) ocrStrictBorderEl.checked = true;
        try { localStorage.removeItem(OCR_TUNING_STORAGE_KEY); } catch (_) { }
    }

    function isLineCleanupEnabled() {
        return !ocrLineCleanupEl || !!ocrLineCleanupEl.checked;
    }

    function isStrictBorderEnabled() {
        return !ocrStrictBorderEl || !!ocrStrictBorderEl.checked;
    }

    function updateWarpSettingsMeta() {
        if (!photoWarpSettingsMetaEl) return;
        const t = getOcrTuningFromControls();
        const inferred = pendingWarpGeometry && Number(pendingWarpGeometry.inferredCount || 0) > 0
            ? ' | Lignes inferees: ' + Number(pendingWarpGeometry.inferredCount || 0)
            : '';
        const borders = pendingWarpGeometry && Number(pendingWarpGeometry.borderRefinedCount || 0) > 0
            ? ' | Bordures recalculees: ' + Number(pendingWarpGeometry.borderRefinedCount || 0)
            : '';
        const cleanup = isLineCleanupEnabled() ? 'ON' : 'OFF';
        const strict = isStrictBorderEnabled() ? 'ON' : 'OFF';
        photoWarpSettingsMetaEl.textContent = 'Luminosite: ' + t.brightness
            + ' | Contraste: ' + t.contrast + '%'
            + ' | Fenetre: ' + t.blockSize
            + ' | C: ' + t.thresholdC
            + ' | Debruitage: ' + t.denoise
            + ' | Nettoyage lignes: ' + cleanup
            + ' | Cadre strict: ' + strict
            + inferred
            + borders;
    }

    function renderWarpProcessedPreview(rebuildOverlay = true) {
        if (!pendingWarpGrayBase || !photoWarpPreviewImgEl) return;
        const tuning = getOcrTuningFromControls();
        const bwForPreview = getOcrApi().preprocessWarpForOcrHighContrast(pendingWarpGrayBase, tuning);
        try {
            const geometry = getOcrApi().detectGridGeometryFromBinary(bwForPreview, SIZE, {
                strictBorderRefine: isStrictBorderEnabled()
            });
            pendingWarpGeometry = geometry;
            renderWarpDetectedLinesOverlay(geometry);

            const cleanupEnabled = isLineCleanupEnabled();
            const previewMat = (cleanupEnabled && geometry)
                ? getOcrApi().removeDetectedGridLines(bwForPreview, geometry, 5)
                : bwForPreview;

            const bwCanvas = document.createElement('canvas');
            bwCanvas.width = previewMat.cols;
            bwCanvas.height = previewMat.rows;
            cv.imshow(bwCanvas, previewMat);
            photoWarpPreviewImgEl.src = bwCanvas.toDataURL('image/png');

            if (previewMat !== bwForPreview) {
                previewMat.delete();
            }
        } finally {
            bwForPreview.delete();
        }

        if (rebuildOverlay) {
            pendingWarpValues = null;
            if (photoWarpGridOverlayEl) {
                photoWarpGridOverlayEl.hidden = true;
                photoWarpGridOverlayEl.innerHTML = '';
            }
        }
        updateWarpSettingsMeta();
    }

    function renderWarpDetectedLinesOverlay(geometry) {
        if (!photoWarpLinesOverlayEl) return;

        if (!geometry || !Array.isArray(geometry.xLines) || !Array.isArray(geometry.yLines)
            || geometry.xLines.length !== (SIZE + 1) || geometry.yLines.length !== (SIZE + 1)
            || !geometry.width || !geometry.height) {
            photoWarpLinesOverlayEl.hidden = true;
            photoWarpLinesOverlayEl.innerHTML = '';
            return;
        }

        const toPctX = (x) => (Math.max(0, Math.min(1, x / geometry.width)) * 100);
        const toPctY = (y) => (Math.max(0, Math.min(1, y / geometry.height)) * 100);

        photoWarpLinesOverlayEl.innerHTML = '';

        geometry.xLines.forEach((x, i) => {
            const line = document.createElement('div');
            const xMeta = Array.isArray(geometry.xMeta) ? geometry.xMeta[i] : null;
            line.className = 'warp-detected-line vertical'
                + ((i % 3 === 0) ? ' major' : '')
                + (xMeta && xMeta.uncertain ? ' uncertain' : '')
                + (xMeta && xMeta.inferred ? ' inferred' : '');
            line.style.left = toPctX(x).toFixed(4) + '%';
            photoWarpLinesOverlayEl.appendChild(line);
        });

        geometry.yLines.forEach((y, i) => {
            const line = document.createElement('div');
            const yMeta = Array.isArray(geometry.yMeta) ? geometry.yMeta[i] : null;
            line.className = 'warp-detected-line horizontal'
                + ((i % 3 === 0) ? ' major' : '')
                + (yMeta && yMeta.uncertain ? ' uncertain' : '')
                + (yMeta && yMeta.inferred ? ' inferred' : '');
            line.style.top = toPctY(y).toFixed(4) + '%';
            photoWarpLinesOverlayEl.appendChild(line);
        });

        photoWarpLinesOverlayEl.hidden = false;
        syncWarpOverlaySize();
    }

    function renderWarpGridOverlay(values, analysis) {
        if (!photoWarpGridOverlayEl) return;
        if (!Array.isArray(values) || values.length !== SIZE) {
            photoWarpGridOverlayEl.hidden = true;
            photoWarpGridOverlayEl.innerHTML = '';
            pendingWarpValues = null;
            pendingWarpAnalysis = null;
            return;
        }

        pendingWarpValues = values.map((row) => row.map((v) => {
            const n = Number(v || 0);
            return (n >= 1 && n <= 9) ? n : 0;
        }));
        pendingWarpAnalysis = Array.isArray(analysis) && analysis.length === SIZE
            ? analysis.map((row) => Array.isArray(row) ? row.map((cell) => cell || {}) : Array.from({ length: SIZE }, () => ({})))
            : Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => ({})));

        photoWarpGridOverlayEl.innerHTML = '';
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const cell = document.createElement('div');
                cell.className = 'warp-grid-cell';
                const cellAnalysis = pendingWarpAnalysis[r] && pendingWarpAnalysis[r][c] ? pendingWarpAnalysis[r][c] : null;
                if (cellAnalysis && cellAnalysis.firstPassHit) {
                    cell.classList.add('warp-recognized-first-pass');
                } else if (cellAnalysis && cellAnalysis.highInkNoDigit) {
                    cell.classList.add('warp-high-ink-unrecognized');
                }
                if ((c + 1) % 3 === 0 && c !== SIZE - 1) {
                    cell.classList.add('warp-block-right');
                }
                if ((r + 1) % 3 === 0 && r !== SIZE - 1) {
                    cell.classList.add('warp-block-bottom');
                }

                const input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.maxLength = 1;
                input.value = pendingWarpValues[r][c] > 0 ? String(pendingWarpValues[r][c]) : '';

                input.addEventListener('beforeinput', (e) => {
                    if (e.inputType === 'insertText' && !/[1-9]/.test(e.data || '')) {
                        e.preventDefault();
                    }
                });

                input.addEventListener('input', () => {
                    const clean = (input.value || '').replace(/[^1-9]/g, '').slice(0, 1);
                    input.value = clean;
                    pendingWarpValues[r][c] = clean ? Number(clean) : 0;
                    cell.classList.remove('warp-high-ink-unrecognized');
                    if (!clean) {
                        cell.classList.remove('warp-recognized-validated');
                    }
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
                    if (input.value !== '') {
                        input.value = '';
                        pendingWarpValues[r][c] = 0;
                        cell.classList.remove('warp-recognized-first-pass');
                        cell.classList.remove('warp-recognized-validated');
                        e.preventDefault();
                    }
                });

                input.addEventListener('click', () => {
                    const hasValue = !!(input.value && String(input.value).trim() !== '');
                    const modelValue = pendingWarpValues && pendingWarpValues[r]
                        ? Number(pendingWarpValues[r][c] || 0)
                        : 0;

                    if (hasValue || modelValue > 0) {
                        hideOverlayNumpad();
                        showOverlayNumpad(r, c, input);
                        setStatus('Saisie manuelle pour [' + (r + 1) + ',' + (c + 1) + '] via pave numerique.', 'ok');
                        return;
                    }

                    runOverlayCellOcr(r, c, input);
                });

                cell.appendChild(input);
                photoWarpGridOverlayEl.appendChild(cell);
            }
        }

        photoWarpGridOverlayEl.hidden = false;
        syncWarpOverlaySize();
    }

    async function runOverlayCellOcr(row, col, inputEl) {
        if (overlayCellOcrInProgress) return;
        if (!pendingWarpGrayBase) return;

        hideOverlayNumpad();

        overlayCellOcrInProgress = true;
        if (inputEl) inputEl.disabled = true;

        try {
            const tuning = getOcrTuningFromControls();
            const bwForOcr = getOcrApi().preprocessWarpForOcrHighContrast(pendingWarpGrayBase, tuning);
            let result;
            try {
                setStatus('OCR cible sur cellule [' + (row + 1) + ',' + (col + 1) + ']...');
                result = await getOcrApi().recognizeSingleCell(bwForOcr, row, col, {
                    size: SIZE,
                    minInkRatio: 0.015,
                    secondPass: true,
                    lineEraseHalfThickness: isLineCleanupEnabled() ? 5 : 0,
                    strictBorderRefine: isStrictBorderEnabled()
                });
            } finally {
                bwForOcr.delete();
            }

            if (result && result.digit >= 1 && result.digit <= 9) {
                pendingWarpValues[row][col] = result.digit;
                inputEl.value = String(result.digit);
                const cellEl = inputEl.closest('.warp-grid-cell');
                if (cellEl) {
                    cellEl.classList.remove('warp-high-ink-unrecognized');
                    cellEl.classList.remove('warp-recognized-validated');
                }
                setStatus('Cellule [' + (row + 1) + ',' + (col + 1) + '] proposee: ' + result.digit
                    + ' (conf ' + Math.round(Number(result.confidence || 0)) + '%). Valide ou corrige via le pave numerique.', 'ok');
                showOverlayNumpad(row, col, inputEl);
                return;
            }

            if (inputEl) {
                const cellEl = inputEl.closest('.warp-grid-cell');
                if (cellEl) {
                    cellEl.classList.toggle('warp-high-ink-unrecognized', Number(result && result.inkRatio || 0) >= 0.06 && !(result && result.skippedByInkFilter));
                    cellEl.classList.remove('warp-recognized-first-pass');
                }
            }

            if (result && result.skippedByInkFilter) {
                setStatus('Cellule [' + (row + 1) + ',' + (col + 1) + '] ignoree (peu d\'encre, probablement vide).', 'warn');
                showOverlayNumpad(row, col, inputEl);
            } else {
                setStatus('Aucun chiffre fiable detecte pour [' + (row + 1) + ',' + (col + 1) + '].', 'warn');
                showOverlayNumpad(row, col, inputEl);
            }
        } catch (err) {
            setStatus('Echec OCR cellule [' + (row + 1) + ',' + (col + 1) + '] : ' + err.message, 'err');
            showOverlayNumpad(row, col, inputEl);
        } finally {
            overlayCellOcrInProgress = false;
            if (inputEl) inputEl.disabled = false;
        }
    }

    function showOverlayNumpad(row, col, inputEl) {
        if (!overlayNumpadEl || !inputEl) return;
        overlayNumpadTarget = { row, col, inputEl };

        const selectedDigit = Number((inputEl.value || '').trim() || 0);
        overlayNumpadEl.querySelectorAll('button[data-digit]').forEach((buttonEl) => {
            const digit = Number(buttonEl.getAttribute('data-digit'));
            buttonEl.classList.toggle('active', digit === selectedDigit && selectedDigit >= 1 && selectedDigit <= 9);
        });

        overlayNumpadEl.hidden = false;
        const rect = inputEl.getBoundingClientRect();
        const padRect = overlayNumpadEl.getBoundingClientRect();

        let left = rect.right + 8;
        let top = rect.top;

        if (left + padRect.width > window.innerWidth - 8) {
            left = Math.max(8, rect.left - padRect.width - 8);
        }
        if (top + padRect.height > window.innerHeight - 8) {
            top = Math.max(8, window.innerHeight - padRect.height - 8);
        }

        overlayNumpadEl.style.left = Math.round(left) + 'px';
        overlayNumpadEl.style.top = Math.round(top) + 'px';
    }

    function hideOverlayNumpad() {
        if (!overlayNumpadEl) return;
        overlayNumpadEl.querySelectorAll('button[data-digit].active').forEach((buttonEl) => {
            buttonEl.classList.remove('active');
        });
        overlayNumpadEl.hidden = true;
        overlayNumpadTarget = null;
    }

    function syncWarpOverlaySize() {
        if (!photoWarpPreviewImgEl) return;
        const w = photoWarpPreviewImgEl.clientWidth;
        const h = photoWarpPreviewImgEl.clientHeight;
        if (!w || !h) return;
        if (photoWarpGridOverlayEl) {
            photoWarpGridOverlayEl.style.width = w + 'px';
            photoWarpGridOverlayEl.style.height = h + 'px';
        }
        if (photoWarpLinesOverlayEl) {
            photoWarpLinesOverlayEl.style.width = w + 'px';
            photoWarpLinesOverlayEl.style.height = h + 'px';
        }
    }

    function clamp01(n) {
        return Math.max(0, Math.min(1, n));
    }

    function renderPreviewCorners() {
        if (!photoCornersOverlayEl || !photoPreviewImgEl) return;
        photoCornersOverlayEl.classList.toggle('fallback-corners', usingFallbackCorners);
        if (!pendingPhotoCornerRatios || pendingPhotoCornerRatios.length !== 4) {
            photoCornersOverlayEl.hidden = true;
            if (photoCornersPolygonEl) photoCornersPolygonEl.setAttribute('points', '');
            return;
        }

        const markers = photoCornersOverlayEl.querySelectorAll('.corner-marker');
        if (markers.length !== 4) {
            photoCornersOverlayEl.hidden = true;
            return;
        }

        for (let i = 0; i < 4; i++) {
            const p = pendingPhotoCornerRatios[i];
            const m = markers[i];
            m.style.left = (p.x * 100).toFixed(3) + '%';
            m.style.top = (p.y * 100).toFixed(3) + '%';
        }

        if (photoCornersPolygonEl) {
            const pointsAttr = pendingPhotoCornerRatios
                .map((p) => ((p.x * 100).toFixed(3) + ',' + (p.y * 100).toFixed(3)))
                .join(' ');
            photoCornersPolygonEl.setAttribute('points', pointsAttr);
        }

        photoCornersOverlayEl.hidden = false;
    }

    function setPreviewCornersFromPoints(points, imageWidth, imageHeight) {
        if (!Array.isArray(points) || points.length !== 4 || !imageWidth || !imageHeight) {
            pendingPhotoCornerRatios = null;
            renderPreviewCorners();
            return;
        }

        pendingPhotoCornerRatios = points.map((p) => ({
            x: Math.max(0, Math.min(1, p.x / imageWidth)),
            y: Math.max(0, Math.min(1, p.y / imageHeight))
        }));
        renderPreviewCorners();
        clearWarpPreview();
    }

    function getImageBoundaryCorners(imageWidth, imageHeight) {
        if (!imageWidth || !imageHeight) return null;
        const maxInsetX = Math.max(0, Math.floor((imageWidth - 2) / 4));
        const maxInsetY = Math.max(0, Math.floor((imageHeight - 2) / 4));
        const insetX = Math.min(50, maxInsetX);
        const insetY = Math.min(50, maxInsetY);

        const left = insetX;
        const right = Math.max(left + 1, imageWidth - 1 - insetX);
        const top = insetY;
        const bottom = Math.max(top + 1, imageHeight - 1 - insetY);

        return [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom }
        ];
    }

    function getPictureApi() {
        if (!window.SudokuPicture) {
            throw new Error('Module image indisponible.');
        }
        return window.SudokuPicture;
    }

    function getOcrApi() {
        if (!window.SudokuOcr) {
            throw new Error('Module OCR indisponible.');
        }
        return window.SudokuOcr;
    }

    async function importFromPhoto(file, cornerRatios = null) {
        return getOcrApi().importFromPhoto({
            file,
            cornerRatios,
            size: SIZE,
            lineEraseHalfThickness: isLineCleanupEnabled() ? 5 : 0,
            strictBorderRefine: isStrictBorderEnabled(),
            getTuning: getOcrTuningFromControls,
            setStatus,
            setState
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const state = getState();
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sudoku.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            setStatus('Fichier sudoku.json telecharge.', 'ok');
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const obj = JSON.parse(reader.result);
                    validateState(obj);
                    setState(obj);
                    setStatus('Import depuis fichier reussi.', 'ok');
                } catch (err) {
                    setStatus('Erreur de parsing : ' + err.message, 'err');
                }
            };
            reader.onerror = () => setStatus('Impossible de lire le fichier.', 'err');
            reader.readAsText(file);
            fileInput.value = '';
        });
    }

    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            showPhotoPreview(file);
            setStatus('Photo chargee. Verifie l\'apercu puis clique sur Lancer OCR.', 'ok');

            getPictureApi().loadImageFromFile(file)
                .then(async (img) => {
                    await getPictureApi().ensureCvReady();
                    const detected = getPictureApi().detectSudokuCorners(img);
                    if (detected.points) {
                        usingFallbackCorners = false;
                        setPreviewCornersFromPoints(detected.points, detected.imageWidth, detected.imageHeight);
                        hasManualCornerEdits = false;
                        setStatus('Photo chargee. Les 4 coins detectes sont affiches.', 'ok');
                    } else {
                        usingFallbackCorners = true;
                        const fallback = getImageBoundaryCorners(detected.imageWidth, detected.imageHeight);
                        setPreviewCornersFromPoints(fallback, detected.imageWidth, detected.imageHeight);
                        hasManualCornerEdits = true;
                        setStatus('Coins non detectes: coins de secours affiches en rouge. Ajuste-les manuellement puis clique sur Etape suivante.', 'warn');
                    }
                })
                .catch(() => {
                    usingFallbackCorners = true;
                    const w = Number(photoPreviewImgEl && photoPreviewImgEl.naturalWidth ? photoPreviewImgEl.naturalWidth : 0);
                    const h = Number(photoPreviewImgEl && photoPreviewImgEl.naturalHeight ? photoPreviewImgEl.naturalHeight : 0);
                    const fallback = getImageBoundaryCorners(w, h);
                    setPreviewCornersFromPoints(fallback, w, h);
                    hasManualCornerEdits = true;
                    setStatus('Detection des coins indisponible: coins de secours affiches en rouge pour ajustement manuel.', 'warn');
                });
        });
    }

    if (photoNextStepBtn) {
        photoNextStepBtn.addEventListener('click', async () => {
            if (!pendingPhotoFile) {
                setStatus('Aucune photo a traiter.', 'warn');
                return;
            }
            if (!pendingPhotoCornerRatios || pendingPhotoCornerRatios.length !== 4) {
                setStatus('Les 4 coins sont requis avant l\'etape suivante.', 'warn');
                return;
            }

            try {
                await getPictureApi().ensureCvReady();
                await getOcrApi().ensureTesseractReady();
                const img = await getPictureApi().loadImageFromFile(pendingPhotoFile);
                if (photoWarpPanelEl) {
                    photoWarpPanelEl.hidden = false;
                }
                if (photoPreviewFrameEl) {
                    photoPreviewFrameEl.hidden = true;
                }
                if (photoPrevStepBtn) {
                    photoPrevStepBtn.disabled = false;
                }
                photoNextStepBtn.disabled = true;

                initOcrTuningControls();
                updateWarpSettingsMeta();

                const warpedGray = getPictureApi().extractSudokuSquareFromCornerRatios(img, pendingPhotoCornerRatios, 630);
                try {
                    if (pendingWarpGrayBase) {
                        pendingWarpGrayBase.delete();
                    }
                    pendingWarpGrayBase = warpedGray.clone();
                    renderWarpProcessedPreview(true);
                } finally {
                    warpedGray.delete();
                }

                setStatus('Etape suivante : ajuste les reglages pour reduire le bruit, apercu en temps reel, puis clique sur Lancer OCR.', 'ok');
            } catch (err) {
                setStatus('Echec etape suivante : ' + err.message, 'err');
            }
        });
    }

    if (photoPrevStepBtn) {
        photoPrevStepBtn.addEventListener('click', () => {
            if (!pendingPhotoFile) {
                setStatus('Aucune photo a traiter.', 'warn');
                return;
            }

            clearWarpPreview();
            if (photoPreviewFrameEl) {
                photoPreviewFrameEl.hidden = false;
            }
            renderPreviewCorners();

            photoPrevStepBtn.disabled = true;
            if (photoNextStepBtn) {
                photoNextStepBtn.disabled = false;
            }
            setStatus('Retour a l\'etape precedente. Ajuste les coins puis clique sur Etape suivante.', 'ok');
        });
    }

    if (photoRunBtn) {
        photoRunBtn.addEventListener('click', async () => {
            if (photoImportInProgress) return;
            if (!pendingPhotoFile) {
                setStatus('Aucune photo a traiter.', 'warn');
                return;
            }

            if (pendingWarpValues && Array.isArray(pendingWarpValues) && pendingWarpValues.length === SIZE) {
                const values = pendingWarpValues.map((row) => row.map((v) => {
                    const n = Number(v || 0);
                    return (n >= 1 && n <= 9) ? n : 0;
                }));
                const givens = values.map((row) => row.map((v) => v > 0));
                const candidates = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => []));
                setState({ values, givens, candidates });
                resetPhotoPreview();
                setStatus('Grille importee depuis la grille superposee corrigee.', 'ok');
                return;
            }

            if (pendingWarpGrayBase) {
                try {
                    await getOcrApi().ensureTesseractReady();
                    setStatus('OCR en cours sur image pretraitee...');
                    const bwForOcr = getOcrApi().preprocessWarpForOcrHighContrast(pendingWarpGrayBase, getOcrTuningFromControls());
                    let ocrState;
                    try {
                        ocrState = await getOcrApi().recognizeGrid(bwForOcr, {
                            size: SIZE,
                            lineEraseHalfThickness: isLineCleanupEnabled() ? 5 : 0,
                            strictBorderRefine: isStrictBorderEnabled(),
                            onProgress: (done, total) => setStatus('Analyse OCR... ' + done + '/' + total)
                        });
                    } finally {
                        bwForOcr.delete();
                    }
                    renderWarpGridOverlay(ocrState.values, ocrState.analysis);
                    setStatus('OCR termine. Corrige la grille superposee puis reclique sur Lancer OCR pour importer.', 'ok');
                } catch (err) {
                    setStatus('Echec OCR : ' + err.message, 'err');
                }
                return;
            }

            photoImportInProgress = true;
            photoRunBtn.disabled = true;
            if (photoCancelBtn) photoCancelBtn.disabled = true;

            try {
                await importFromPhoto(pendingPhotoFile, pendingPhotoCornerRatios);
                resetPhotoPreview();
            } catch (err) {
                setStatus('Echec import photo : ' + err.message, 'err');
            } finally {
                photoImportInProgress = false;
                photoRunBtn.disabled = false;
                if (photoCancelBtn) photoCancelBtn.disabled = false;
            }
        });
    }

    if (photoCancelBtn) {
        photoCancelBtn.addEventListener('click', () => {
            if (photoImportInProgress) return;
            resetPhotoPreview();
            setStatus('Import photo annule.', 'warn');
        });
    }

    if (overlayNumpadEl) {
        overlayNumpadEl.addEventListener('click', (evt) => {
            const digitBtn = evt.target.closest('button[data-digit]');
            const actionBtn = evt.target.closest('button[data-action]');
            if (!overlayNumpadTarget) {
                hideOverlayNumpad();
                return;
            }

            if (digitBtn) {
                const digit = Number(digitBtn.getAttribute('data-digit'));
                if (digit >= 1 && digit <= 9) {
                    pendingWarpValues[overlayNumpadTarget.row][overlayNumpadTarget.col] = digit;
                    overlayNumpadTarget.inputEl.value = String(digit);
                    const cellEl = overlayNumpadTarget.inputEl.closest('.warp-grid-cell');
                    if (cellEl) {
                        cellEl.classList.remove('warp-high-ink-unrecognized');
                        cellEl.classList.add('warp-recognized-validated');
                    }
                    setStatus('Valeur saisie manuellement pour ['
                        + (overlayNumpadTarget.row + 1) + ',' + (overlayNumpadTarget.col + 1) + '] : ' + digit + '.', 'ok');
                }
                hideOverlayNumpad();
                return;
            }

            if (actionBtn) {
                const action = actionBtn.getAttribute('data-action');
                if (action === 'clear') {
                    pendingWarpValues[overlayNumpadTarget.row][overlayNumpadTarget.col] = 0;
                    overlayNumpadTarget.inputEl.value = '';
                    const cellEl = overlayNumpadTarget.inputEl.closest('.warp-grid-cell');
                    if (cellEl) {
                        cellEl.classList.remove('warp-recognized-validated');
                        cellEl.classList.remove('warp-recognized-first-pass');
                    }
                    setStatus('Cellule [' + (overlayNumpadTarget.row + 1) + ',' + (overlayNumpadTarget.col + 1)
                        + '] videe manuellement.', 'ok');
                }
                hideOverlayNumpad();
            }
        });

        window.addEventListener('pointerdown', (evt) => {
            if (overlayNumpadEl.hidden) return;
            if (overlayNumpadEl.contains(evt.target)) return;
            if (overlayNumpadTarget && overlayNumpadTarget.inputEl === evt.target) return;
            hideOverlayNumpad();
        });
    }

    if (photoCornersOverlayEl && photoPreviewImgEl) {
        const onPointerMove = (evt) => {
            if (dragCornerIndex < 0 || !pendingPhotoCornerRatios) return;
            const rect = photoPreviewImgEl.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const x = clamp01((evt.clientX - rect.left) / rect.width);
            const y = clamp01((evt.clientY - rect.top) / rect.height);

            pendingPhotoCornerRatios[dragCornerIndex] = { x, y };
            hasManualCornerEdits = true;
            renderPreviewCorners();
            clearWarpPreview();
        };

        const stopDrag = () => {
            if (dragCornerIndex < 0) return;
            const active = photoCornersOverlayEl.querySelector('.corner-marker.dragging');
            if (active) active.classList.remove('dragging');
            dragCornerIndex = -1;
            if (hasManualCornerEdits) {
                setStatus('Coins ajustes. Clique sur Etape suivante pour voir l\'image redressee.', 'ok');
            }
        };

        photoCornersOverlayEl.querySelectorAll('.corner-marker').forEach((marker, index) => {
            marker.addEventListener('pointerdown', (evt) => {
                if (!pendingPhotoCornerRatios) return;
                dragCornerIndex = index;
                marker.classList.add('dragging');
                marker.setPointerCapture(evt.pointerId);
                evt.preventDefault();
            });

            marker.addEventListener('pointerup', () => {
                marker.classList.remove('dragging');
                stopDrag();
            });
        });

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', stopDrag);
        window.addEventListener('pointercancel', stopDrag);
    }

    initOcrTuningControls();

    [ocrBrightnessEl, ocrContrastEl, ocrBlockSizeEl, ocrThresholdCEl, ocrDenoiseEl].forEach((el) => {
        if (!el) return;
        el.addEventListener('input', () => {
            saveOcrTuningToStorage();
            renderWarpProcessedPreview(true);
        });
    });

    if (ocrLineCleanupEl) {
        ocrLineCleanupEl.addEventListener('change', () => {
            saveOcrTuningToStorage();
            renderWarpProcessedPreview(true);
        });
    }

    if (ocrStrictBorderEl) {
        ocrStrictBorderEl.addEventListener('change', () => {
            saveOcrTuningToStorage();
            renderWarpProcessedPreview(true);
        });
    }

    if (ocrResetTuningBtn) {
        ocrResetTuningBtn.addEventListener('click', () => {
            resetOcrTuningControls();
            renderWarpProcessedPreview(true);
            setStatus('Reglages OCR reinitialises et effaces du stockage local.', 'ok');
        });
    }

    if (ocrSaveTuningBtn) {
        ocrSaveTuningBtn.addEventListener('click', () => {
            saveOcrTuningToStorage();
            setStatus('Reglages OCR enregistres.', 'ok');
        });
    }

    if (exampleBtn) {
        exampleBtn.addEventListener('click', () => {
            const example = {
                values: [
                    [0, 0, 9, 0, 0, 0, 0, 8, 0],
                    [0, 0, 0, 0, 5, 0, 0, 2, 0],
                    [8, 0, 0, 0, 0, 3, 7, 6, 0],
                    [5, 0, 0, 4, 1, 0, 0, 3, 7],
                    [0, 4, 7, 0, 0, 6, 6, 1, 0],
                    [0, 0, 7, 0, 0, 0, 0, 4, 8],
                    [3, 0, 0, 5, 4, 1, 3, 7, 2],
                    [3, 2, 1, 9, 6, 7, 8, 5, 4],
                    [4, 7, 5, 3, 3, 0, 1, 9, 6]
                ],
                givens: Array.from({ length: SIZE }, () => Array(SIZE).fill(false))
            };
            setState(example);
            setStatus('Exemple charge.', 'warn');
        });
    }

    if (clearValuesBtn) {
        clearValuesBtn.addEventListener('click', () => {
            if (!gridEl || !gridEl.rows) return;
            for (let r = 0; r < SIZE; r++) {
                for (let c = 0; c < SIZE; c++) {
                    const td = gridEl.rows[r].cells[c];
                    if (!td.classList.contains('given')) {
                        const input = td.querySelector('input');
                        if (input) input.value = '';
                    }
                }
            }
            updateConflicts();
            callCandidatesRender();
            refreshGridPlayMenuVisibility();
            setStatus('Valeurs effacees (hors donnees).', 'ok');
        });
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            if (!gridEl || !gridEl.rows) return;
            for (let r = 0; r < SIZE; r++) {
                for (let c = 0; c < SIZE; c++) {
                    const td = gridEl.rows[r].cells[c];
                    const input = td.querySelector('input');
                    if (input) input.value = '';
                    td.classList.remove('given');
                    td.dataset.candidates = '[]';
                }
            }
            updateConflicts();
            callCandidatesRender();
            setGridPlayMenuVisible(false);
            setStatus('Grille reinitialisee.', 'ok');
        });
    }

    if (gridMenuCandidatesBtn) {
        gridMenuCandidatesBtn.addEventListener('click', () => {
            if (toggleCandidatesBtn) toggleCandidatesBtn.click();
        });
    }

    if (gridMenuValuesBtn) {
        gridMenuValuesBtn.addEventListener('click', () => {
            if (toggleValuesBtn) toggleValuesBtn.click();
        });
    }

    if (gridMenuHintBtn) {
        gridMenuHintBtn.addEventListener('click', () => {
            if (hintBtn) hintBtn.click();
        });
    }

    if (gridMenuSolveBtn) {
        gridMenuSolveBtn.addEventListener('click', () => {
            if (nextStepBtn) nextStepBtn.click();
        });
    }

    if (burgerMenuBtn) {
        burgerMenuBtn.addEventListener('click', () => {
            if (window.innerWidth > MOBILE_BREAKPOINT) return;
            document.body.classList.toggle('mobile-tools-open');
            syncMobileToolsState();
        });
    }

    window.getState = getState;
    window.setState = setState;
    window.updateConflicts = updateConflicts;
    window.setStatus = setStatus;
    window.renderAllCells = renderAllCells;

    applyThemeByWidth();
    syncMobileToolsState();

    buildGrid();
    setGridPlayMenuVisible(false);
    setStatus('Pret.');

    if (photoPreviewImgEl) {
        photoPreviewImgEl.addEventListener('load', renderPreviewCorners);
    }

    if (photoWarpPreviewImgEl) {
        photoWarpPreviewImgEl.addEventListener('load', syncWarpOverlaySize);
    }

    window.addEventListener('resize', () => {
        applyThemeByWidth();
        syncMobileToolsState();
        renderPreviewCorners();
        syncWarpOverlaySize();
    });

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

});
