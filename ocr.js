(function (window) {
    'use strict';

    function ensureTesseractReady(timeoutMs = 20000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (window.Tesseract && typeof window.Tesseract.createWorker === 'function') {
                    resolve();
                    return;
                }
                if (Date.now() - start > timeoutMs) {
                    reject(new Error('Tesseract indisponible.'));
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        });
    }

    function parseRecognizedDigit(result) {
        const text = result && result.data && typeof result.data.text === 'string' ? result.data.text : '';
        const confidence = Number(result && result.data ? result.data.confidence : 0) || 0;
        const clean = text.replace(/[^1-9]/g, '');
        return { digit: clean ? Number(clean[0]) : 0, confidence };
    }

    function preprocessWarpForOcrHighContrast(warpedGray, tuning) {
        const safeTuning = tuning || {};

        const tuned = new cv.Mat();
        const normalized = new cv.Mat();
        const denoised = new cv.Mat();
        const blurred = new cv.Mat();
        const bw = new cv.Mat();

        const alpha = Math.max(0.4, Math.min(3.0, Number(safeTuning.contrast || 100) / 100));
        const beta = Math.max(-120, Math.min(120, Number(safeTuning.brightness || 0)));
        const blurK = (Number(safeTuning.denoise || 0) * 2) + 1;
        const blockSizeRaw = Number(safeTuning.blockSize || 15);
        const blockSize = Math.max(3, (blockSizeRaw % 2 === 0 ? blockSizeRaw + 1 : blockSizeRaw));
        const thresholdC = Number(safeTuning.thresholdC || 6);

        warpedGray.convertTo(tuned, cv.CV_8U, alpha, beta);
        cv.equalizeHist(tuned, normalized);
        if (blurK > 1) {
            cv.medianBlur(normalized, denoised, blurK);
        } else {
            normalized.copyTo(denoised);
        }
        cv.GaussianBlur(denoised, blurred, new cv.Size(3, 3), 0);
        cv.adaptiveThreshold(blurred, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize, thresholdC);

        if (Number(safeTuning.denoise || 0) > 0) {
            const kernelSize = Math.min(3, Number(safeTuning.denoise || 1) + 1);
            const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize));
            cv.morphologyEx(bw, bw, cv.MORPH_OPEN, kernel);
            kernel.delete();
        }

        tuned.delete();
        normalized.delete();
        denoised.delete();
        blurred.delete();

        return bw;
    }

    async function recognizeGrid(warpedGray, options = {}) {
        const size = Number(options.size || 9);
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

        const values = Array.from({ length: size }, () => Array(size).fill(0));
        const givens = Array.from({ length: size }, () => Array(size).fill(false));
        const candidates = Array.from({ length: size }, () => Array.from({ length: size }, () => []));

        const worker = await window.Tesseract.createWorker('eng');
        const psmSingleChar = (window.Tesseract.PSM && window.Tesseract.PSM.SINGLE_CHAR) ? window.Tesseract.PSM.SINGLE_CHAR : 10;

        await worker.setParameters({
            tessedit_char_whitelist: '123456789',
            tessedit_pageseg_mode: psmSingleChar
        });

        const cellW = Math.floor(warpedGray.cols / size);
        const cellH = Math.floor(warpedGray.rows / size);

        try {
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    const margin = Math.max(3, Math.floor(Math.min(cellW, cellH) * 0.12));
                    const rect = new cv.Rect(c * cellW + margin, r * cellH + margin, cellW - margin * 2, cellH - margin * 2);
                    const roi = warpedGray.roi(rect);

                    const binInv = new cv.Mat();
                    cv.threshold(roi, binInv, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

                    const bin = new cv.Mat();
                    cv.bitwise_not(binInv, bin);

                    const cellCanvas = document.createElement('canvas');
                    cellCanvas.width = bin.cols;
                    cellCanvas.height = bin.rows;
                    cv.imshow(cellCanvas, bin);

                    const result = await worker.recognize(cellCanvas);
                    const parsed = parseRecognizedDigit(result);

                    if (parsed.digit >= 1 && parsed.digit <= 9 && parsed.confidence >= 40) {
                        values[r][c] = parsed.digit;
                        givens[r][c] = true;
                    }

                    roi.delete();
                    binInv.delete();
                    bin.delete();
                }

                if (onProgress) {
                    onProgress((r + 1) * size, size * size);
                }
            }
        } finally {
            await worker.terminate();
        }

        return { values, givens, candidates };
    }

    async function importFromPhoto(options) {
        const safe = options || {};
        const pictureApi = window.SudokuPicture;
        if (!pictureApi) {
            throw new Error('Module image indisponible.');
        }

        const size = Number(safe.size || 9);
        const file = safe.file;
        const cornerRatios = safe.cornerRatios;
        const getTuning = typeof safe.getTuning === 'function' ? safe.getTuning : () => ({});
        const setStatus = typeof safe.setStatus === 'function' ? safe.setStatus : () => { };
        const setState = typeof safe.setState === 'function' ? safe.setState : () => { };

        setStatus('Preparation OCR...', '');
        await pictureApi.ensureCvReady();
        await ensureTesseractReady();

        const img = await pictureApi.loadImageFromFile(file);
        setStatus('Detection de grille...', '');
        const warpedGray = (Array.isArray(cornerRatios) && cornerRatios.length === 4)
            ? pictureApi.extractSudokuSquareFromCornerRatios(img, cornerRatios)
            : pictureApi.extractSudokuSquare(img);

        try {
            setStatus('Lecture des chiffres...', '');
            const bwForOcr = preprocessWarpForOcrHighContrast(warpedGray, getTuning());
            let state;
            try {
                state = await recognizeGrid(bwForOcr, {
                    size,
                    onProgress: (done, total) => setStatus('Analyse OCR... ' + done + '/' + total)
                });
            } finally {
                bwForOcr.delete();
            }

            setState(state);

            let count = 0;
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (state.values[r][c] > 0) count++;
                }
            }

            setStatus('Photo importee : ' + count + ' chiffres detectes.', count >= 17 ? 'ok' : 'warn');
            return state;
        } finally {
            warpedGray.delete();
        }
    }

    window.SudokuOcr = {
        ensureTesseractReady,
        parseRecognizedDigit,
        preprocessWarpForOcrHighContrast,
        recognizeGrid,
        importFromPhoto
    };
})(window);
