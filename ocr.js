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

    function extractPeakCenters(profile, thresholdRatio = 0.3, minRun = 2) {
        if (!Array.isArray(profile) || profile.length === 0) return [];
        const maxVal = profile.reduce((m, v) => Math.max(m, v), 0);
        if (maxVal <= 0) return [];

        const threshold = maxVal * thresholdRatio;
        const peaks = [];
        let runStart = -1;

        for (let i = 0; i < profile.length; i++) {
            if (profile[i] >= threshold) {
                if (runStart < 0) runStart = i;
            } else if (runStart >= 0) {
                const runEnd = i - 1;
                if ((runEnd - runStart + 1) >= minRun) {
                    peaks.push((runStart + runEnd) / 2);
                }
                runStart = -1;
            }
        }

        if (runStart >= 0) {
            const runEnd = profile.length - 1;
            if ((runEnd - runStart + 1) >= minRun) {
                peaks.push((runStart + runEnd) / 2);
            }
        }

        return peaks;
    }

    function median(values) {
        if (!Array.isArray(values) || values.length === 0) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[mid - 1] + sorted[mid]) / 2;
        }
        return sorted[mid];
    }

    function inferGridLines(candidates, targetCount, maxIndex) {
        if (!Array.isArray(candidates) || candidates.length === 0) return null;
        if (targetCount < 2 || maxIndex <= 0) return null;

        const sorted = Array.from(new Set(candidates.map((x) => Number(x))
            .filter((x) => Number.isFinite(x) && x >= 0 && x <= maxIndex)))
            .sort((a, b) => a - b);
        if (sorted.length === 0) return null;

        const idealStep = maxIndex / (targetCount - 1);

        const offsets = sorted.map((p) => {
            const idx = Math.max(0, Math.min(targetCount - 1, Math.round(p / idealStep)));
            return p - (idx * idealStep);
        });
        const offset = Math.max(-idealStep * 0.5, Math.min(idealStep * 0.5, median(offsets)));

        const expected = [];
        for (let i = 0; i < targetCount; i++) {
            expected.push(offset + i * idealStep);
        }

        const lines = [];
        const meta = [];
        const tolerance = Math.max(4, idealStep * 0.42);

        for (let i = 0; i < targetCount; i++) {
            const e = expected[i];
            let best = null;
            let bestDist = Number.POSITIVE_INFINITY;
            for (let j = 0; j < sorted.length; j++) {
                const d = Math.abs(sorted[j] - e);
                if (d < bestDist) {
                    bestDist = d;
                    best = sorted[j];
                }
            }

            if (best != null && bestDist <= tolerance) {
                lines.push(best);
                meta.push({ inferred: false, uncertain: false });
            } else {
                const clampedExpected = Math.max(0, Math.min(maxIndex, e));
                lines.push(clampedExpected);
                meta.push({ inferred: true, uncertain: true });
            }
        }

        for (let i = 1; i < lines.length; i++) {
            if (lines[i] <= lines[i - 1]) {
                lines[i] = Math.min(maxIndex, lines[i - 1] + Math.max(1, idealStep * 0.5));
                meta[i].uncertain = true;
            }
        }

        const intervalDev = [];
        for (let i = 0; i < lines.length - 1; i++) {
            const span = lines[i + 1] - lines[i];
            const dev = Math.abs(span - idealStep) / Math.max(1, idealStep);
            intervalDev.push(dev);
        }

        for (let i = 0; i < lines.length; i++) {
            const leftDev = i > 0 ? intervalDev[i - 1] : 0;
            const rightDev = i < intervalDev.length ? intervalDev[i] : 0;
            if (leftDev > 0.22 || rightDev > 0.22) {
                meta[i].uncertain = true;
            }
        }

        return {
            lines,
            meta,
            inferredCount: meta.filter((m) => m.inferred).length
        };
    }

    function refineBorderLinesFromInterior(lines, meta, maxIndex, forceRefine = false) {
        if (!Array.isArray(lines) || lines.length < 4) {
            return {
                lines,
                meta,
                borderRefinedCount: 0
            };
        }

        const refinedLines = lines.slice();
        const refinedMeta = Array.isArray(meta)
            ? meta.map((m) => ({ inferred: !!(m && m.inferred), uncertain: !!(m && m.uncertain) }))
            : lines.map(() => ({ inferred: false, uncertain: false }));

        const interiorSteps = [];
        for (let i = 1; i <= refinedLines.length - 3; i++) {
            const step = refinedLines[i + 1] - refinedLines[i];
            if (step > 1) interiorSteps.push(step);
        }

        const interiorStep = median(interiorSteps);
        if (!Number.isFinite(interiorStep) || interiorStep <= 1) {
            return {
                lines: refinedLines,
                meta: refinedMeta,
                borderRefinedCount: 0
            };
        }

        const firstInner = refinedLines[1];
        const lastInner = refinedLines[refinedLines.length - 2];
        const expectedLeft = Math.max(0, firstInner - interiorStep);
        const expectedRight = Math.min(maxIndex, lastInner + interiorStep);

        let borderRefinedCount = 0;

        const leftNeedsRefine = forceRefine
            || refinedMeta[0].uncertain
            || refinedMeta[0].inferred
            || Math.abs(refinedLines[0] - expectedLeft) > interiorStep * 0.25;
        if (leftNeedsRefine) {
            refinedLines[0] = expectedLeft;
            refinedMeta[0].uncertain = true;
            refinedMeta[0].inferred = true;
            borderRefinedCount++;
        }

        const lastIdx = refinedLines.length - 1;
        const rightNeedsRefine = forceRefine
            || refinedMeta[lastIdx].uncertain
            || refinedMeta[lastIdx].inferred
            || Math.abs(refinedLines[lastIdx] - expectedRight) > interiorStep * 0.25;
        if (rightNeedsRefine) {
            refinedLines[lastIdx] = expectedRight;
            refinedMeta[lastIdx].uncertain = true;
            refinedMeta[lastIdx].inferred = true;
            borderRefinedCount++;
        }

        const minStep = Math.max(1, interiorStep * 0.35);
        for (let i = 1; i < refinedLines.length; i++) {
            if (refinedLines[i] - refinedLines[i - 1] < minStep) {
                refinedLines[i] = Math.min(maxIndex, refinedLines[i - 1] + minStep);
                refinedMeta[i].uncertain = true;
            }
        }

        for (let i = refinedLines.length - 2; i >= 0; i--) {
            if (refinedLines[i + 1] - refinedLines[i] < minStep) {
                refinedLines[i] = Math.max(0, refinedLines[i + 1] - minStep);
                refinedMeta[i].uncertain = true;
            }
        }

        return {
            lines: refinedLines,
            meta: refinedMeta,
            borderRefinedCount
        };
    }

    function removeDetectedGridLines(binaryMat, geometry, halfThickness = 5) {
        if (!binaryMat || !geometry || !Array.isArray(geometry.xLines) || !Array.isArray(geometry.yLines)) {
            return binaryMat ? binaryMat.clone() : null;
        }

        const cleaned = binaryMat.clone();
        const t = Math.max(1, Number(halfThickness || 5));

        const whitenVerticalBand = (xCenter) => {
            const x0 = Math.max(0, xCenter - t);
            const x1 = Math.min(cleaned.cols - 1, xCenter + t);
            const w = x1 - x0 + 1;
            if (w <= 0) return;
            const roi = cleaned.roi(new cv.Rect(x0, 0, w, cleaned.rows));
            roi.setTo(new cv.Scalar(255));
            roi.delete();
        };

        const whitenHorizontalBand = (yCenter) => {
            const y0 = Math.max(0, yCenter - t);
            const y1 = Math.min(cleaned.rows - 1, yCenter + t);
            const h = y1 - y0 + 1;
            if (h <= 0) return;
            const roi = cleaned.roi(new cv.Rect(0, y0, cleaned.cols, h));
            roi.setTo(new cv.Scalar(255));
            roi.delete();
        };

        const whitenRect = (x, y, w, h) => {
            const rx = Math.max(0, Math.min(cleaned.cols - 1, Math.round(x)));
            const ry = Math.max(0, Math.min(cleaned.rows - 1, Math.round(y)));
            const rw = Math.max(0, Math.min(cleaned.cols - rx, Math.round(w)));
            const rh = Math.max(0, Math.min(cleaned.rows - ry, Math.round(h)));
            if (rw <= 0 || rh <= 0) return;
            const roi = cleaned.roi(new cv.Rect(rx, ry, rw, rh));
            roi.setTo(new cv.Scalar(255));
            roi.delete();
        };

        const gridLeft = Math.max(0, Math.min(cleaned.cols - 1, Math.round(geometry.xLines[0])));
        const gridRight = Math.max(0, Math.min(cleaned.cols - 1, Math.round(geometry.xLines[geometry.xLines.length - 1])));
        const gridTop = Math.max(0, Math.min(cleaned.rows - 1, Math.round(geometry.yLines[0])));
        const gridBottom = Math.max(0, Math.min(cleaned.rows - 1, Math.round(geometry.yLines[geometry.yLines.length - 1])));

        whitenRect(0, 0, cleaned.cols, gridTop - t);
        whitenRect(0, gridBottom + t + 1, cleaned.cols, cleaned.rows - (gridBottom + t + 1));
        whitenRect(0, gridTop - t, gridLeft - t, (gridBottom - gridTop) + (2 * t) + 1);
        whitenRect(gridRight + t + 1, gridTop - t, cleaned.cols - (gridRight + t + 1), (gridBottom - gridTop) + (2 * t) + 1);

        geometry.xLines.forEach((x) => whitenVerticalBand(Math.round(x)));
        geometry.yLines.forEach((y) => whitenHorizontalBand(Math.round(y)));

        return cleaned;
    }

    function detectGridGeometryFromBinary(bw, size = 9, options = {}) {
        const targetLineCount = size + 1;

        const inv = new cv.Mat();
        const vertical = new cv.Mat();
        const horizontal = new cv.Mat();
        cv.bitwise_not(bw, inv);

        const vKernelLen = Math.max(9, Math.floor(bw.rows / 18));
        const hKernelLen = Math.max(9, Math.floor(bw.cols / 18));
        const vKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, vKernelLen));
        const hKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(hKernelLen, 1));

        cv.morphologyEx(inv, vertical, cv.MORPH_OPEN, vKernel);
        cv.morphologyEx(inv, horizontal, cv.MORPH_OPEN, hKernel);

        const vProfile = Array(bw.cols).fill(0);
        const hProfile = Array(bw.rows).fill(0);

        for (let y = 0; y < vertical.rows; y++) {
            for (let x = 0; x < vertical.cols; x++) {
                if (vertical.ucharPtr(y, x)[0] > 0) vProfile[x]++;
            }
        }

        for (let y = 0; y < horizontal.rows; y++) {
            for (let x = 0; x < horizontal.cols; x++) {
                if (horizontal.ucharPtr(y, x)[0] > 0) hProfile[y]++;
            }
        }

        const vPeaks = extractPeakCenters(vProfile, 0.28, 2);
        const hPeaks = extractPeakCenters(hProfile, 0.28, 2);

        const xFit = inferGridLines(vPeaks, targetLineCount, bw.cols - 1);
        const yFit = inferGridLines(hPeaks, targetLineCount, bw.rows - 1);

        vKernel.delete();
        hKernel.delete();
        inv.delete();
        vertical.delete();
        horizontal.delete();

        if (!xFit || !yFit || xFit.lines.length !== targetLineCount || yFit.lines.length !== targetLineCount) {
            return null;
        }

        const strictBorderRefine = !!options.strictBorderRefine;
        const xRefined = refineBorderLinesFromInterior(xFit.lines, xFit.meta, bw.cols - 1, strictBorderRefine);
        const yRefined = refineBorderLinesFromInterior(yFit.lines, yFit.meta, bw.rows - 1, strictBorderRefine);

        const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
        return {
            width: bw.cols,
            height: bw.rows,
            xLines: xRefined.lines.map((x) => clamp(x, bw.cols - 1)),
            yLines: yRefined.lines.map((y) => clamp(y, bw.rows - 1)),
            xMeta: xRefined.meta,
            yMeta: yRefined.meta,
            inferredCount: xRefined.meta.filter((m) => m.inferred).length
                + yRefined.meta.filter((m) => m.inferred).length,
            borderRefinedCount: Number(xRefined.borderRefinedCount || 0) + Number(yRefined.borderRefinedCount || 0)
        };
    }

    function getCellRect(sourceMat, row, col, size, geometry) {
        const cellW = Math.floor(sourceMat.cols / size);
        const cellH = Math.floor(sourceMat.rows / size);

        let x0 = col * cellW;
        let y0 = row * cellH;
        let x1 = (col + 1) * cellW;
        let y1 = (row + 1) * cellH;

        if (geometry) {
            x0 = geometry.xLines[col];
            x1 = geometry.xLines[col + 1];
            y0 = geometry.yLines[row];
            y1 = geometry.yLines[row + 1];
        }

        const boxW = Math.max(8, x1 - x0);
        const boxH = Math.max(8, y1 - y0);
        const marginX = Math.max(2, Math.floor(boxW * 0.14));
        const marginY = Math.max(2, Math.floor(boxH * 0.14));

        const rx = Math.max(0, Math.min(sourceMat.cols - 2, x0 + marginX));
        const ry = Math.max(0, Math.min(sourceMat.rows - 2, y0 + marginY));
        const rw = Math.max(4, Math.min(sourceMat.cols - rx, boxW - marginX * 2));
        const rh = Math.max(4, Math.min(sourceMat.rows - ry, boxH - marginY * 2));

        return new cv.Rect(rx, ry, rw, rh);
    }

    function computeInkRatio(binaryInvMat) {
        const total = binaryInvMat.rows * binaryInvMat.cols;
        if (!total) return 0;
        let dark = 0;
        for (let y = 0; y < binaryInvMat.rows; y++) {
            for (let x = 0; x < binaryInvMat.cols; x++) {
                if (binaryInvMat.ucharPtr(y, x)[0] > 0) dark++;
            }
        }
        return dark / total;
    }

    function matToCanvas(mat) {
        const canvas = document.createElement('canvas');
        canvas.width = mat.cols;
        canvas.height = mat.rows;
        cv.imshow(canvas, mat);
        return canvas;
    }

    async function recognizeCellWithWorker(worker, sourceMat, rect, options = {}) {
        const minInkRatio = Math.max(0, Number(options.minInkRatio == null ? 0.015 : options.minInkRatio));
        const secondPass = !!options.secondPass;

        const roi = sourceMat.roi(rect);
        const binInv = new cv.Mat();
        const bin = new cv.Mat();

        try {
            cv.threshold(roi, binInv, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
            const inkRatio = computeInkRatio(binInv);
            if (inkRatio < minInkRatio) {
                return { digit: 0, confidence: 0, inkRatio, skippedByInkFilter: true };
            }

            cv.bitwise_not(binInv, bin);
            const baseResult = await worker.recognize(matToCanvas(bin));
            let parsed = parseRecognizedDigit(baseResult);

            if ((!parsed.digit || parsed.confidence < 45) && secondPass) {
                const upscaled = new cv.Mat();
                const dilated = new cv.Mat();
                const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
                try {
                    cv.resize(bin, upscaled, new cv.Size(bin.cols * 2, bin.rows * 2), 0, 0, cv.INTER_CUBIC);
                    cv.dilate(upscaled, dilated, kernel);
                    const secondResult = await worker.recognize(matToCanvas(dilated));
                    const secondParsed = parseRecognizedDigit(secondResult);
                    if (secondParsed.digit && secondParsed.confidence >= parsed.confidence) {
                        parsed = secondParsed;
                    }
                } finally {
                    kernel.delete();
                    upscaled.delete();
                    dilated.delete();
                }
            }

            return {
                digit: parsed.digit >= 1 && parsed.digit <= 9 ? parsed.digit : 0,
                confidence: parsed.confidence || 0,
                inkRatio,
                skippedByInkFilter: false
            };
        } finally {
            roi.delete();
            binInv.delete();
            bin.delete();
        }
    }

    async function recognizeSingleCell(warpedGray, row, col, options = {}) {
        const size = Number(options.size || 9);
        if (row < 0 || row >= size || col < 0 || col >= size) {
            throw new Error('Cellule hors limites.');
        }

        const geometry = detectGridGeometryFromBinary(warpedGray, size, {
            strictBorderRefine: !!options.strictBorderRefine
        });
        const eraseHalfThickness = options.lineEraseHalfThickness == null
            ? 5
            : Number(options.lineEraseHalfThickness);
        const cleanedForOcr = (geometry && eraseHalfThickness > 0)
            ? removeDetectedGridLines(warpedGray, geometry, eraseHalfThickness)
            : null;
        const sourceMat = cleanedForOcr || warpedGray;

        const worker = await window.Tesseract.createWorker('eng');
        const psmSingleChar = (window.Tesseract.PSM && window.Tesseract.PSM.SINGLE_CHAR) ? window.Tesseract.PSM.SINGLE_CHAR : 10;

        try {
            await worker.setParameters({
                tessedit_char_whitelist: '123456789',
                tessedit_pageseg_mode: psmSingleChar
            });

            const rect = getCellRect(sourceMat, row, col, size, geometry);
            const result = await recognizeCellWithWorker(worker, sourceMat, rect, {
                minInkRatio: options.minInkRatio,
                secondPass: options.secondPass !== false
            });

            return {
                row,
                col,
                digit: result.digit,
                confidence: result.confidence,
                inkRatio: result.inkRatio,
                skippedByInkFilter: result.skippedByInkFilter,
                geometryUsed: !!geometry
            };
        } finally {
            await worker.terminate();
            if (cleanedForOcr) cleanedForOcr.delete();
        }
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

        const geometry = detectGridGeometryFromBinary(warpedGray, size, {
            strictBorderRefine: !!options.strictBorderRefine
        });
        const eraseHalfThickness = options.lineEraseHalfThickness == null
            ? 5
            : Number(options.lineEraseHalfThickness);
        const cleanedForOcr = (geometry && eraseHalfThickness > 0)
            ? removeDetectedGridLines(warpedGray, geometry, eraseHalfThickness)
            : null;
        const sourceMat = cleanedForOcr || warpedGray;

        try {
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    const rect = getCellRect(sourceMat, r, c, size, geometry);
                    const result = await recognizeCellWithWorker(worker, sourceMat, rect, {
                        minInkRatio: options.minInkRatio,
                        secondPass: !!options.gridSecondPass
                    });

                    if (result.digit >= 1 && result.digit <= 9 && result.confidence >= 40) {
                        values[r][c] = result.digit;
                        givens[r][c] = true;
                    }
                }

                if (onProgress) {
                    onProgress((r + 1) * size, size * size);
                }
            }
        } finally {
            await worker.terminate();
            if (cleanedForOcr) cleanedForOcr.delete();
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
                    lineEraseHalfThickness: safe.lineEraseHalfThickness,
                    strictBorderRefine: safe.strictBorderRefine,
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
        detectGridGeometryFromBinary,
        removeDetectedGridLines,
        recognizeSingleCell,
        recognizeGrid,
        importFromPhoto
    };
})(window);
