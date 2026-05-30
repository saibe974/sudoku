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

    function getExpandedBounds(points, width, height, padding = 0) {
        if (!Array.isArray(points) || points.length === 0) {
            return { x0: 0, y0: 0, x1: Math.max(0, width - 1), y1: Math.max(0, height - 1) };
        }

        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        points.forEach((point) => {
            minX = Math.min(minX, Number(point.x) || 0);
            minY = Math.min(minY, Number(point.y) || 0);
            maxX = Math.max(maxX, Number(point.x) || 0);
            maxY = Math.max(maxY, Number(point.y) || 0);
        });

        return {
            x0: Math.max(0, Math.floor(minX - padding)),
            y0: Math.max(0, Math.floor(minY - padding)),
            x1: Math.min(width - 1, Math.ceil(maxX + padding)),
            y1: Math.min(height - 1, Math.ceil(maxY + padding))
        };
    }

    function mergeNearbyFeaturePoints(points, mergeDistance) {
        if (!Array.isArray(points) || points.length === 0) return [];

        const sorted = points.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
        const clusters = [];
        const mergeDistanceSq = mergeDistance * mergeDistance;

        sorted.forEach((point) => {
            let cluster = null;
            for (let i = 0; i < clusters.length; i++) {
                const current = clusters[i];
                if (current.type !== point.type) continue;
                const dx = current.x - point.x;
                const dy = current.y - point.y;
                if ((dx * dx) + (dy * dy) <= mergeDistanceSq) {
                    cluster = current;
                    break;
                }
            }

            if (!cluster) {
                clusters.push({
                    x: point.x,
                    y: point.y,
                    type: point.type,
                    score: Number(point.score || 0),
                    count: 1,
                    arms: Array.isArray(point.arms) ? point.arms.slice() : []
                });
                return;
            }

            const total = cluster.count + 1;
            cluster.x = ((cluster.x * cluster.count) + point.x) / total;
            cluster.y = ((cluster.y * cluster.count) + point.y) / total;
            cluster.score = Math.max(cluster.score, Number(point.score || 0));
            cluster.count = total;
            cluster.arms = Array.from(new Set((cluster.arms || []).concat(point.arms || [])));
        });

        return clusters.map((point) => ({
            x: Math.round(point.x),
            y: Math.round(point.y),
            type: point.type,
            score: point.score,
            arms: point.arms
        }));
    }

    function detectFeaturePointsFromBinary(binaryMat, focusBounds = null) {
        if (!binaryMat || !binaryMat.cols || !binaryMat.rows) return [];

        const width = binaryMat.cols;
        const height = binaryMat.rows;
        const minDim = Math.max(1, Math.min(width, height));
        const scanStep = Math.max(1, Math.floor(minDim / 260));
        const armLength = Math.max(8, Math.floor(minDim / 40));
        const centerGap = Math.max(2, Math.floor(armLength * 0.18));
        const thickness = Math.max(1, Math.floor(armLength * 0.12));
        const mergeDistance = Math.max(8, Math.floor(armLength * 0.55));
        const margin = armLength + 2;
        const bounds = focusBounds || { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };

        const isDark = (x, y) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return false;
            return binaryMat.ucharPtr(y, x)[0] > 0;
        };

        const sampleDirection = (x, y, dx, dy) => {
            let hits = 0;
            let maxRun = 0;
            let run = 0;
            const total = Math.max(1, armLength - centerGap + 1);

            for (let dist = centerGap; dist <= armLength; dist++) {
                let darkHits = 0;
                let samples = 0;
                for (let offset = -thickness; offset <= thickness; offset++) {
                    const sx = dx === 0 ? x + offset : x + (dx * dist);
                    const sy = dy === 0 ? y + offset : y + (dy * dist);
                    if (isDark(sx, sy)) darkHits++;
                    samples++;
                }

                if (darkHits >= Math.max(1, Math.ceil(samples * 0.45))) {
                    hits++;
                    run++;
                    maxRun = Math.max(maxRun, run);
                } else {
                    run = 0;
                }
            }

            return {
                active: hits >= Math.ceil(total * 0.42) && maxRun >= Math.ceil(total * 0.25),
                strength: hits + (maxRun * 0.7)
            };
        };

        const features = [];

        for (let y = Math.max(margin, bounds.y0); y <= Math.min(height - 1 - margin, bounds.y1); y += scanStep) {
            for (let x = Math.max(margin, bounds.x0); x <= Math.min(width - 1 - margin, bounds.x1); x += scanStep) {
                if (!isDark(x, y)) continue;

                let localDark = 0;
                for (let yy = -1; yy <= 1; yy++) {
                    for (let xx = -1; xx <= 1; xx++) {
                        if (isDark(x + xx, y + yy)) localDark++;
                    }
                }
                if (localDark < 4) continue;

                const up = sampleDirection(x, y, 0, -1);
                const down = sampleDirection(x, y, 0, 1);
                const left = sampleDirection(x, y, -1, 0);
                const right = sampleDirection(x, y, 1, 0);
                const arms = [];
                if (up.active) arms.push('up');
                if (down.active) arms.push('down');
                if (left.active) arms.push('left');
                if (right.active) arms.push('right');

                if (arms.length < 2) continue;

                const hasVertical = up.active || down.active;
                const hasHorizontal = left.active || right.active;
                const straightOnly = (up.active && down.active && !left.active && !right.active)
                    || (left.active && right.active && !up.active && !down.active);
                if (!hasVertical || !hasHorizontal || straightOnly) continue;

                const type = arms.length >= 4 ? 'cross' : (arms.length === 3 ? 'tee' : 'corner');
                const score = up.strength + down.strength + left.strength + right.strength;
                features.push({ x, y, type, score, arms });
            }
        }

        return mergeNearbyFeaturePoints(features, mergeDistance)
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
            .slice(0, 250);
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
        let featurePoints = [];
        if (bestQuad && bestArea > 5000) {
            points = [];
            for (let i = 0; i < 4; i++) {
                const p = bestQuad.intPtr(i, 0);
                points.push({ x: p[0], y: p[1] });
            }
            featurePoints = detectFeaturePointsFromBinary(
                thresh,
                getExpandedBounds(points, thresh.cols, thresh.rows, Math.max(12, Math.floor(Math.min(thresh.cols, thresh.rows) * 0.03)))
            );
            points = orderQuadPoints(points);
            points = shrinkQuadToBlack(points);
            bestQuad.delete();
        } else {
            featurePoints = detectFeaturePointsFromBinary(thresh);
        }

        src.delete();
        gray.delete();
        blur.delete();
        thresh.delete();
        contours.delete();
        hierarchy.delete();

        return {
            points,
            featurePoints,
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
        detectFeaturePointsFromBinary,
        detectSudokuCorners,
        ratiosToPixels,
        warpImageFromCorners,
        extractSudokuSquare,
        extractSudokuSquareFromCornerRatios
    };
})(window);
