(function (window) {
    'use strict';

    function clamp01(n) {
        return Math.max(0, Math.min(1, n));
    }

    function loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Image illisible.'));
            };
            img.src = url;
        });
    }

    function buildSourceCanvasFromImage(imageEl) {
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = imageEl.naturalWidth || imageEl.width;
        sourceCanvas.height = imageEl.naturalHeight || imageEl.height;
        const sctx = sourceCanvas.getContext('2d');
        sctx.drawImage(imageEl, 0, 0, sourceCanvas.width, sourceCanvas.height);
        return sourceCanvas;
    }

    function ensureCvReady(timeoutMs = 20000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (typeof cv === 'undefined') {
                    if (Date.now() - start > timeoutMs) {
                        reject(new Error('OpenCV indisponible.'));
                        return;
                    }
                    setTimeout(check, 100);
                    return;
                }
                if (typeof cv.Mat === 'function') {
                    resolve();
                    return;
                }
                cv.onRuntimeInitialized = resolve;
            };
            check();
        });
    }

    function orderQuadPoints(points) {
        const sorted = points.slice().sort((a, b) => a.y - b.y);
        const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
        return [top[0], top[1], bottom[1], bottom[0]];
    }

    function detectSudokuCorners(imageEl) {
        const sourceCanvas = buildSourceCanvasFromImage(imageEl);

        const src = cv.imread(sourceCanvas);
        const gray = new cv.Mat();
        const blur = new cv.Mat();
        const thresh = new cv.Mat();
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();

        const clampPx = (n, max) => Math.max(0, Math.min(max, n));
        const sampleGray = (x, y) => {
            const xi = clampPx(Math.round(x), gray.cols - 1);
            const yi = clampPx(Math.round(y), gray.rows - 1);
            return gray.ucharPtr(yi, xi)[0];
        };
        const sampleBin = (x, y) => {
            const xi = clampPx(Math.round(x), thresh.cols - 1);
            const yi = clampPx(Math.round(y), thresh.rows - 1);
            return thresh.ucharPtr(yi, xi)[0];
        };
        const shrinkQuadToBlack = (quad) => {
            if (!quad || quad.length !== 4) return quad;

            const center = {
                x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
                y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4
            };

            const maxTravelRatio = 0.35;
            const blackGrayThreshold = 110;

            const refined = quad.map((corner) => {
                const dx = center.x - corner.x;
                const dy = center.y - corner.y;
                const len = Math.hypot(dx, dy);
                if (len < 2) return { x: corner.x, y: corner.y };

                const steps = Math.max(8, Math.floor(len * maxTravelRatio));
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const x = corner.x + dx * t * maxTravelRatio;
                    const y = corner.y + dy * t * maxTravelRatio;
                    const onDarkInBinary = sampleBin(x, y) > 0;
                    const onDarkInGray = sampleGray(x, y) <= blackGrayThreshold;
                    if (onDarkInBinary || onDarkInGray) {
                        return { x, y };
                    }
                }

                return { x: corner.x, y: corner.y };
            });

            return orderQuadPoints(refined);
        };

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0);
        cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let bestQuad = null;
        let bestArea = 0;

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const peri = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * peri, true);

            if (approx.rows === 4) {
                const area = Math.abs(cv.contourArea(approx));
                if (area > bestArea) {
                    if (bestQuad) bestQuad.delete();
                    bestQuad = approx.clone();
                    bestArea = area;
                }
            }

            approx.delete();
            contour.delete();
        }

        let points = null;
        if (bestQuad && bestArea > 5000) {
            points = [];
            for (let i = 0; i < 4; i++) {
                const p = bestQuad.intPtr(i, 0);
                points.push({ x: p[0], y: p[1] });
            }
            points = orderQuadPoints(points);
            points = shrinkQuadToBlack(points);
            bestQuad.delete();
        }

        src.delete();
        gray.delete();
        blur.delete();
        thresh.delete();
        contours.delete();
        hierarchy.delete();

        return {
            points,
            imageWidth: sourceCanvas.width,
            imageHeight: sourceCanvas.height
        };
    }

    function ratiosToPixels(cornerRatios, imageWidth, imageHeight) {
        if (!Array.isArray(cornerRatios) || cornerRatios.length !== 4) return null;
        return cornerRatios.map((p) => ({
            x: clamp01(p.x) * imageWidth,
            y: clamp01(p.y) * imageHeight
        }));
    }

    function warpImageFromCorners(imageEl, cornerRatios, targetSize = 630) {
        const sourceCanvas = buildSourceCanvasFromImage(imageEl);
        const src = cv.imread(sourceCanvas);
        const warped = new cv.Mat();

        const pts = ratiosToPixels(cornerRatios, sourceCanvas.width, sourceCanvas.height);
        if (!pts) {
            src.delete();
            throw new Error('Coins invalides pour redressement.');
        }

        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            pts[0].x, pts[0].y,
            pts[1].x, pts[1].y,
            pts[2].x, pts[2].y,
            pts[3].x, pts[3].y
        ]);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            targetSize - 1, 0,
            targetSize - 1, targetSize - 1,
            0, targetSize - 1
        ]);

        const m = cv.getPerspectiveTransform(srcTri, dstTri);
        cv.warpPerspective(src, warped, m, new cv.Size(targetSize, targetSize), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        const outCanvas = document.createElement('canvas');
        outCanvas.width = targetSize;
        outCanvas.height = targetSize;
        cv.imshow(outCanvas, warped);

        srcTri.delete();
        dstTri.delete();
        m.delete();
        src.delete();
        warped.delete();

        return outCanvas;
    }

    function extractSudokuSquare(imageEl) {
        const targetSize = 450;

        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = imageEl.naturalWidth || imageEl.width;
        sourceCanvas.height = imageEl.naturalHeight || imageEl.height;
        const sctx = sourceCanvas.getContext('2d');
        sctx.drawImage(imageEl, 0, 0, sourceCanvas.width, sourceCanvas.height);

        const src = cv.imread(sourceCanvas);
        const gray = new cv.Mat();
        const blur = new cv.Mat();
        const thresh = new cv.Mat();
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0);
        cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
        cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let bestQuad = null;
        let bestArea = 0;

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const peri = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, 0.02 * peri, true);

            if (approx.rows === 4) {
                const area = Math.abs(cv.contourArea(approx));
                if (area > bestArea) {
                    if (bestQuad) bestQuad.delete();
                    bestQuad = approx.clone();
                    bestArea = area;
                }
            }

            approx.delete();
            contour.delete();
        }

        const warped = new cv.Mat();

        if (bestQuad && bestArea > 5000) {
            const points = [];
            for (let i = 0; i < 4; i++) {
                const p = bestQuad.intPtr(i, 0);
                points.push({ x: p[0], y: p[1] });
            }

            const ordered = orderQuadPoints(points);
            const tl = ordered[0];
            const tr = ordered[1];
            const br = ordered[2];
            const bl = ordered[3];

            const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                tl.x, tl.y,
                tr.x, tr.y,
                br.x, br.y,
                bl.x, bl.y
            ]);
            const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0,
                targetSize - 1, 0,
                targetSize - 1, targetSize - 1,
                0, targetSize - 1
            ]);

            const m = cv.getPerspectiveTransform(srcTri, dstTri);
            cv.warpPerspective(gray, warped, m, new cv.Size(targetSize, targetSize), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

            srcTri.delete();
            dstTri.delete();
            m.delete();
            bestQuad.delete();
        } else {
            cv.resize(gray, warped, new cv.Size(targetSize, targetSize), 0, 0, cv.INTER_AREA);
        }

        src.delete();
        gray.delete();
        blur.delete();
        thresh.delete();
        contours.delete();
        hierarchy.delete();

        return warped;
    }

    function extractSudokuSquareFromCornerRatios(imageEl, cornerRatios, targetSize = 450) {
        const sourceCanvas = buildSourceCanvasFromImage(imageEl);

        const src = cv.imread(sourceCanvas);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        const warped = new cv.Mat();
        const pts = ratiosToPixels(cornerRatios, sourceCanvas.width, sourceCanvas.height);
        if (!pts) {
            src.delete();
            gray.delete();
            throw new Error('Coins invalides pour OCR.');
        }

        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            pts[0].x, pts[0].y,
            pts[1].x, pts[1].y,
            pts[2].x, pts[2].y,
            pts[3].x, pts[3].y
        ]);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            targetSize - 1, 0,
            targetSize - 1, targetSize - 1,
            0, targetSize - 1
        ]);

        const m = cv.getPerspectiveTransform(srcTri, dstTri);
        cv.warpPerspective(gray, warped, m, new cv.Size(targetSize, targetSize), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        srcTri.delete();
        dstTri.delete();
        m.delete();
        src.delete();
        gray.delete();

        return warped;
    }

    window.SudokuPicture = {
        clamp01,
        loadImageFromFile,
        buildSourceCanvasFromImage,
        ensureCvReady,
        orderQuadPoints,
        detectSudokuCorners,
        ratiosToPixels,
        warpImageFromCorners,
        extractSudokuSquare,
        extractSudokuSquareFromCornerRatios
    };
})(window);
