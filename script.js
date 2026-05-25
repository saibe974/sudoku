document.addEventListener('DOMContentLoaded', function () {
    const SIZE = 9;

    const gridEl = document.getElementById('grid');
    const givenModeEl = document.getElementById('givenMode');
    const statusEl = document.getElementById('status');

    const downloadBtn = document.getElementById('downloadBtn');
    const fileInput = document.getElementById('fileInput');
    const photoInput = document.getElementById('photoInput');
    const photoPreviewPanelEl = document.getElementById('photoPreviewPanel');
    const photoPreviewImgEl = document.getElementById('photoPreviewImg');
    const photoCornersOverlayEl = document.getElementById('photoCornersOverlay');
    const photoCornersPolygonEl = document.getElementById('photoCornersPolygon');
    const photoNextStepBtn = document.getElementById('photoNextStepBtn');
    const photoRunBtn = document.getElementById('photoRunBtn');
    const photoCancelBtn = document.getElementById('photoCancelBtn');
    const photoWarpPanelEl = document.getElementById('photoWarpPanel');
    const photoWarpPreviewImgEl = document.getElementById('photoWarpPreviewImg');
    const photoWarpGridOverlayEl = document.getElementById('photoWarpGridOverlay');
    const ocrBrightnessEl = document.getElementById('ocrBrightness');
    const ocrContrastEl = document.getElementById('ocrContrast');
    const ocrBlockSizeEl = document.getElementById('ocrBlockSize');
    const ocrThresholdCEl = document.getElementById('ocrThresholdC');
    const ocrDenoiseEl = document.getElementById('ocrDenoise');
    const ocrResetTuningBtn = document.getElementById('ocrResetTuningBtn');
    const ocrSaveTuningBtn = document.getElementById('ocrSaveTuningBtn');
    const photoWarpSettingsMetaEl = document.getElementById('photoWarpSettingsMeta');
    const exampleBtn = document.getElementById('exampleBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const clearValuesBtn = document.getElementById('clearValuesBtn');

    let pendingPhotoFile = null;
    let pendingPhotoUrl = null;
    let pendingPhotoCornerRatios = null;
    let pendingWarpValues = null;
    let pendingWarpGrayBase = null;
    let dragCornerIndex = -1;
    let hasManualCornerEdits = false;
    let photoImportInProgress = false;

    const DEFAULT_OCR_TUNING = {
        brightness: 0,
        contrast: 130,
        blockSize: 15,
        thresholdC: 6,
        denoise: 1
    };

    function setStatus(msg, type = '') {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = 'status ' + (type || '');
    }

    function callCandidatesRender() {
        if (window.SudokuUI && typeof window.SudokuUI.reRender === 'function') {
            window.SudokuUI.reRender();
        }
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
        pendingPhotoFile = null;
        pendingPhotoCornerRatios = null;
        pendingWarpValues = null;
        hasManualCornerEdits = false;
        dragCornerIndex = -1;
        if (pendingPhotoUrl) {
            URL.revokeObjectURL(pendingPhotoUrl);
            pendingPhotoUrl = null;
        }

        if (photoPreviewImgEl) {
            photoPreviewImgEl.removeAttribute('src');
        }

        if (photoPreviewPanelEl) {
            photoPreviewPanelEl.hidden = true;
        }

        if (photoCornersOverlayEl) {
            photoCornersOverlayEl.hidden = true;
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

        if (photoPreviewImgEl) {
            photoPreviewImgEl.src = pendingPhotoUrl;
        }

        if (photoPreviewPanelEl) {
            photoPreviewPanelEl.hidden = false;
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
        pendingWarpValues = null;
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
            localStorage.setItem(OCR_TUNING_STORAGE_KEY, JSON.stringify(getOcrTuningFromControls()));
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
        }
    }

    function resetOcrTuningControls() {
        if (ocrBrightnessEl) ocrBrightnessEl.value = String(DEFAULT_OCR_TUNING.brightness);
        if (ocrContrastEl) ocrContrastEl.value = String(DEFAULT_OCR_TUNING.contrast);
        if (ocrBlockSizeEl) ocrBlockSizeEl.value = String(DEFAULT_OCR_TUNING.blockSize);
        if (ocrThresholdCEl) ocrThresholdCEl.value = String(DEFAULT_OCR_TUNING.thresholdC);
        if (ocrDenoiseEl) ocrDenoiseEl.value = String(DEFAULT_OCR_TUNING.denoise);
        try { localStorage.removeItem(OCR_TUNING_STORAGE_KEY); } catch (_) { }
    }

    function updateWarpSettingsMeta() {
        if (!photoWarpSettingsMetaEl) return;
        const t = getOcrTuningFromControls();
        photoWarpSettingsMetaEl.textContent = 'Luminosite: ' + t.brightness
            + ' | Contraste: ' + t.contrast + '%'
            + ' | Fenetre: ' + t.blockSize
            + ' | C: ' + t.thresholdC
            + ' | Debruitage: ' + t.denoise;
    }

    function renderWarpProcessedPreview(rebuildOverlay = true) {
        if (!pendingWarpGrayBase || !photoWarpPreviewImgEl) return;
        const tuning = getOcrTuningFromControls();
        const bwForPreview = getOcrApi().preprocessWarpForOcrHighContrast(pendingWarpGrayBase, tuning);
        try {
            const bwCanvas = document.createElement('canvas');
            bwCanvas.width = bwForPreview.cols;
            bwCanvas.height = bwForPreview.rows;
            cv.imshow(bwCanvas, bwForPreview);
            photoWarpPreviewImgEl.src = bwCanvas.toDataURL('image/png');
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

    function renderWarpGridOverlay(values) {
        if (!photoWarpGridOverlayEl) return;
        if (!Array.isArray(values) || values.length !== SIZE) {
            photoWarpGridOverlayEl.hidden = true;
            photoWarpGridOverlayEl.innerHTML = '';
            pendingWarpValues = null;
            return;
        }

        pendingWarpValues = values.map((row) => row.map((v) => {
            const n = Number(v || 0);
            return (n >= 1 && n <= 9) ? n : 0;
        }));

        photoWarpGridOverlayEl.innerHTML = '';
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const cell = document.createElement('div');
                cell.className = 'warp-grid-cell';
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
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
                    if (input.value !== '') {
                        input.value = '';
                        pendingWarpValues[r][c] = 0;
                        e.preventDefault();
                    }
                });

                cell.appendChild(input);
                photoWarpGridOverlayEl.appendChild(cell);
            }
        }

        photoWarpGridOverlayEl.hidden = false;
        syncWarpOverlaySize();
    }

    function syncWarpOverlaySize() {
        if (!photoWarpGridOverlayEl || !photoWarpPreviewImgEl) return;
        const w = photoWarpPreviewImgEl.clientWidth;
        const h = photoWarpPreviewImgEl.clientHeight;
        if (!w || !h) return;
        photoWarpGridOverlayEl.style.width = w + 'px';
        photoWarpGridOverlayEl.style.height = h + 'px';
    }

    function clamp01(n) {
        return Math.max(0, Math.min(1, n));
    }

    function renderPreviewCorners() {
        if (!photoCornersOverlayEl || !photoPreviewImgEl) return;
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
                        setPreviewCornersFromPoints(detected.points, detected.imageWidth, detected.imageHeight);
                        hasManualCornerEdits = false;
                        setStatus('Photo chargee. Les 4 coins detectes sont affiches.', 'ok');
                    } else {
                        setPreviewCornersFromPoints(null, 0, 0);
                        setStatus('Photo chargee, mais les coins n\'ont pas ete detectes automatiquement.', 'warn');
                    }
                })
                .catch(() => {
                    setPreviewCornersFromPoints(null, 0, 0);
                    setStatus('Photo chargee. Detection des coins indisponible pour cette image.', 'warn');
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
                            onProgress: (done, total) => setStatus('Analyse OCR... ' + done + '/' + total)
                        });
                    } finally {
                        bwForOcr.delete();
                    }
                    renderWarpGridOverlay(ocrState.values);
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
            setStatus('Grille reinitialisee.', 'ok');
        });
    }

    window.getState = getState;
    window.setState = setState;
    window.updateConflicts = updateConflicts;
    window.setStatus = setStatus;
    window.renderAllCells = renderAllCells;

    buildGrid();
    setStatus('Pret.');

    if (photoPreviewImgEl) {
        photoPreviewImgEl.addEventListener('load', renderPreviewCorners);
    }

    if (photoWarpPreviewImgEl) {
        photoWarpPreviewImgEl.addEventListener('load', syncWarpOverlaySize);
    }

    window.addEventListener('resize', renderPreviewCorners);
    window.addEventListener('resize', syncWarpOverlaySize);

    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
});
