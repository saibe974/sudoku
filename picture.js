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

    function getInnerGridBoundsFromQuad(points, width, height) {
        if (!Array.isArray(points) || points.length !== 4) {
            return getExpandedBounds(points, width, height, 0);
        }

        const ordered = orderQuadPoints(points);
        const tl = ordered[0];
        const tr = ordered[1];
        const br = ordered[2];
        const bl = ordered[3];

        const lerp = (a, b, t) => ({
            x: Number(a.x || 0) + ((Number(b.x || 0) - Number(a.x || 0)) * t),
            y: Number(a.y || 0) + ((Number(b.y || 0) - Number(a.y || 0)) * t)
        });

        // Focus on the interior of the paper, not the decorative margins.
        const topInset = 0.16;
        const bottomInset = 0.12;
        const sideInset = 0.10;

        const topLeft = lerp(tl, bl, topInset);
        const topRight = lerp(tr, br, topInset);
        const bottomLeft = lerp(bl, tl, bottomInset);
        const bottomRight = lerp(br, tr, bottomInset);

        const x0 = Math.max(0, Math.floor(Math.min(topLeft.x, bottomLeft.x) + (Math.abs(tr.x - tl.x) * sideInset)));
        const x1 = Math.min(width - 1, Math.ceil(Math.max(topRight.x, bottomRight.x) - (Math.abs(tr.x - tl.x) * sideInset)));
        const y0 = Math.max(0, Math.floor(Math.min(topLeft.y, topRight.y)));
        const y1 = Math.min(height - 1, Math.ceil(Math.max(bottomLeft.y, bottomRight.y)));

        return {
            x0,
            y0,
            x1,
            y1
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
            count: point.count,
            arms: point.arms
        }));
    }

    function pruneInsignificantNearbyFeaturePoints(points, suppressionDistance) {
        if (!Array.isArray(points) || points.length === 0) return [];

        const sorted = points.slice().sort((a, b) => {
            const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
            if (scoreDiff !== 0) return scoreDiff;
            return Number(b.count || 0) - Number(a.count || 0);
        });
        const kept = [];
        const suppressionDistanceSq = suppressionDistance * suppressionDistance;

        sorted.forEach((point) => {
            const pointScore = Number(point.score || 0);
            const pointCount = Number(point.count || 0);
            const isDominated = kept.some((other) => {
                const dx = Number(other.x || 0) - Number(point.x || 0);
                const dy = Number(other.y || 0) - Number(point.y || 0);
                if ((dx * dx) + (dy * dy) > suppressionDistanceSq) return false;

                const otherScore = Number(other.score || 0);
                const otherCount = Number(other.count || 0);
                const scoreDominates = otherScore >= pointScore * 1.1;
                const countDominates = otherCount >= pointCount + 1;
                return scoreDominates || (otherScore >= pointScore && countDominates);
            });

            if (!isDominated) {
                kept.push(point);
            }
        });

        return kept;
    }

    function areOrthogonalArms(point) {
        const arms = Array.isArray(point && point.arms) ? point.arms : [];
        const hasHorizontal = arms.includes('left') || arms.includes('right');
        const hasVertical = arms.includes('up') || arms.includes('down');
        return hasHorizontal && hasVertical;
    }

    function computeDirectionalNeighbors(points, width, height) {
        if (!Array.isArray(points) || points.length === 0) return [];

        const minDim = Math.max(1, Math.min(width || 0, height || 0));
        const alignTolerance = Math.max(4, Math.floor(minDim * 0.025));

        const nearestByDirection = points.map((point, idx) => {
            const best = {
                up: null,
                down: null,
                left: null,
                right: null
            };
            const bestDist = {
                up: Number.POSITIVE_INFINITY,
                down: Number.POSITIVE_INFINITY,
                left: Number.POSITIVE_INFINITY,
                right: Number.POSITIVE_INFINITY
            };

            for (let j = 0; j < points.length; j++) {
                if (j === idx) continue;
                const other = points[j];
                const dx = Number(other.x || 0) - Number(point.x || 0);
                const dy = Number(other.y || 0) - Number(point.y || 0);

                if (Math.abs(dx) <= alignTolerance && dy < 0) {
                    const dist = Math.abs(dy) + (Math.abs(dx) * 0.5);
                    if (dist < bestDist.up) {
                        bestDist.up = dist;
                        best.up = j;
                    }
                }

                if (Math.abs(dx) <= alignTolerance && dy > 0) {
                    const dist = Math.abs(dy) + (Math.abs(dx) * 0.5);
                    if (dist < bestDist.down) {
                        bestDist.down = dist;
                        best.down = j;
                    }
                }

                if (Math.abs(dy) <= alignTolerance && dx < 0) {
                    const dist = Math.abs(dx) + (Math.abs(dy) * 0.5);
                    if (dist < bestDist.left) {
                        bestDist.left = dist;
                        best.left = j;
                    }
                }

                if (Math.abs(dy) <= alignTolerance && dx > 0) {
                    const dist = Math.abs(dx) + (Math.abs(dy) * 0.5);
                    if (dist < bestDist.right) {
                        bestDist.right = dist;
                        best.right = j;
                    }
                }
            }

            return best;
        });

        return nearestByDirection.map((neighbors, idx) => {
            const confirmed = {
                up: null,
                down: null,
                left: null,
                right: null
            };

            if (neighbors.up != null && nearestByDirection[neighbors.up] && nearestByDirection[neighbors.up].down === idx) {
                confirmed.up = neighbors.up;
            }
            if (neighbors.down != null && nearestByDirection[neighbors.down] && nearestByDirection[neighbors.down].up === idx) {
                confirmed.down = neighbors.down;
            }
            if (neighbors.left != null && nearestByDirection[neighbors.left] && nearestByDirection[neighbors.left].right === idx) {
                confirmed.left = neighbors.left;
            }
            if (neighbors.right != null && nearestByDirection[neighbors.right] && nearestByDirection[neighbors.right].left === idx) {
                confirmed.right = neighbors.right;
            }

            return confirmed;
        });
    }

    function countNeighbors(neighbors) {
        if (!neighbors) return 0;
        let count = 0;
        if (neighbors.up != null) count++;
        if (neighbors.down != null) count++;
        if (neighbors.left != null) count++;
        if (neighbors.right != null) count++;
        return count;
    }

    function classifyPointTypeByNeighbors(point, neighborCount) {
        if (neighborCount >= 4) return 'cross';
        if (neighborCount === 3) return 'tee';
        if (neighborCount === 2 && areOrthogonalArms(point)) return 'corner';
        return point.type || 'corner';
    }

    function buildPointGridReport(points, removedCount, debug = null) {
        const report = {
            totalKept: Array.isArray(points) ? points.length : 0,
            removedCount: Number(removedCount || 0),
            corners: 0,
            sides: 0,
            centers: 0,
            other: 0,
            debug: debug && typeof debug === 'object' ? {
                raw: Number(debug.raw || 0),
                merged: Number(debug.merged || 0),
                proximity: Number(debug.proximity || 0),
                dense: Number(debug.dense || 0),
                grid: Number(debug.grid || 0),
                pattern: Number(debug.pattern || 0),
                final: Number(debug.final || 0),
                relationRemoved: Number(debug.relationRemoved || 0),
                denseRemoved: Number(debug.denseRemoved || 0),
                syntheticAdded: Number(debug.syntheticAdded || 0),
                capRemoved: Number(debug.capRemoved || 0)
            } : null
        };

        if (!Array.isArray(points)) return report;

        points.forEach((point) => {
            const neighbors = Number(point.neighborCount || 0);
            if (neighbors === 2) {
                report.corners++;
            } else if (neighbors === 3) {
                report.sides++;
            } else if (neighbors === 4) {
                report.centers++;
            } else {
                report.other++;
            }
        });

        return report;
    }

    function collapseDensePointPacks(points, width, height) {
        if (!Array.isArray(points) || points.length === 0) return [];

        const minDim = Math.max(1, Math.min(width || 0, height || 0));
        const denseRadius = Math.max(8, Math.floor(minDim * 0.028));
        const denseRadiusSq = denseRadius * denseRadius;
        const minDenseCount = 4;

        const sorted = points.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
        const consumed = Array(sorted.length).fill(false);
        const collapsed = [];

        for (let i = 0; i < sorted.length; i++) {
            if (consumed[i]) continue;

            const seed = sorted[i];
            const clusterIdx = [i];
            consumed[i] = true;

            for (let j = i + 1; j < sorted.length; j++) {
                if (consumed[j]) continue;
                const dx = Number(sorted[j].x || 0) - Number(seed.x || 0);
                const dy = Number(sorted[j].y || 0) - Number(seed.y || 0);
                if ((dx * dx) + (dy * dy) <= denseRadiusSq) {
                    consumed[j] = true;
                    clusterIdx.push(j);
                }
            }

            if (clusterIdx.length < minDenseCount) {
                collapsed.push(seed);
                continue;
            }

            let best = seed;
            let bestScore = Number(seed.score || 0);
            let sumX = 0;
            let sumY = 0;
            let sumW = 0;

            clusterIdx.forEach((idx) => {
                const point = sorted[idx];
                const w = Math.max(1, Number(point.score || 1));
                sumX += Number(point.x || 0) * w;
                sumY += Number(point.y || 0) * w;
                sumW += w;
                if (Number(point.score || 0) > bestScore) {
                    bestScore = Number(point.score || 0);
                    best = point;
                }
            });

            collapsed.push({
                x: Math.round(sumX / Math.max(1, sumW)),
                y: Math.round(sumY / Math.max(1, sumW)),
                score: bestScore,
                count: clusterIdx.reduce((n, idx) => n + Number(sorted[idx].count || 1), 0),
                arms: Array.isArray(best.arms) ? best.arms.slice() : [],
                type: best.type
            });
        }

        return collapsed;
    }

    function kMeans1D(values, k, iterations = 18) {
        if (!Array.isArray(values) || values.length < k) return null;
        const sorted = values.slice().sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;

        const centers = [];
        for (let i = 0; i < k; i++) {
            centers.push(min + ((max - min) * i / (k - 1)));
        }

        for (let it = 0; it < iterations; it++) {
            const buckets = Array.from({ length: k }, () => []);

            sorted.forEach((v) => {
                let best = 0;
                let bestDist = Number.POSITIVE_INFINITY;
                for (let i = 0; i < k; i++) {
                    const d = Math.abs(v - centers[i]);
                    if (d < bestDist) {
                        bestDist = d;
                        best = i;
                    }
                }
                buckets[best].push(v);
            });

            for (let i = 0; i < k; i++) {
                if (buckets[i].length === 0) continue;
                const avg = buckets[i].reduce((s, v) => s + v, 0) / buckets[i].length;
                centers[i] = avg;
            }
        }

        return centers.slice().sort((a, b) => a - b);
    }

    function getExpectedNeighborCount(row, col, size = 9) {
        const onTop = row === 0;
        const onBottom = row === (size - 1);
        const onLeft = col === 0;
        const onRight = col === (size - 1);
        const edgeCount = Number(onTop) + Number(onBottom) + Number(onLeft) + Number(onRight);
        if (edgeCount >= 2) return 2;
        if (edgeCount === 1) return 3;
        return 4;
    }

    function smoothProfile(profile, radius = 2) {
        if (!Array.isArray(profile) || profile.length === 0) return [];
        const out = [];
        for (let i = 0; i < profile.length; i++) {
            let sum = 0;
            let count = 0;
            for (let j = Math.max(0, i - radius); j <= Math.min(profile.length - 1, i + radius); j++) {
                sum += Number(profile[j] || 0);
                count++;
            }
            out.push(sum / Math.max(1, count));
        }
        return out;
    }

    function extractPeakCentersFromProfile(profile, thresholdRatio = 0.3, minRun = 2) {
        if (!Array.isArray(profile) || profile.length === 0) return [];
        const maxVal = profile.reduce((m, v) => Math.max(m, Number(v) || 0), 0);
        if (maxVal <= 0) return [];

        const threshold = maxVal * thresholdRatio;
        const peaks = [];
        let runStart = -1;

        for (let i = 0; i < profile.length; i++) {
            if (Number(profile[i] || 0) >= threshold) {
                if (runStart < 0) runStart = i;
            } else if (runStart >= 0) {
                const runEnd = i - 1;
                if ((runEnd - runStart + 1) >= minRun) {
                    const center = (runStart + runEnd) / 2;
                    const strength = profile.slice(runStart, runEnd + 1).reduce((s, v) => s + Number(v || 0), 0);
                    peaks.push({ center, score: strength });
                }
                runStart = -1;
            }
        }

        if (runStart >= 0) {
            const runEnd = profile.length - 1;
            if ((runEnd - runStart + 1) >= minRun) {
                const center = (runStart + runEnd) / 2;
                const strength = profile.slice(runStart, runEnd + 1).reduce((s, v) => s + Number(v || 0), 0);
                peaks.push({ center, score: strength });
            }
        }

        return peaks.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    }

    function inferRegularLinePositionsFromCandidates(candidates, targetCount, maxIndex, offset = 0) {
        if (!Array.isArray(candidates) || targetCount < 2 || maxIndex <= 0) return null;

        const sorted = Array.from(new Set(candidates.map((candidate) => Number(candidate)).filter((value) => Number.isFinite(value) && value >= 0 && value <= maxIndex)))
            .sort((a, b) => a - b);

        if (sorted.length === 0) return null;
        if (sorted.length === 1) {
            const single = sorted[0];
            const step = maxIndex / (targetCount - 1);
            return Array.from({ length: targetCount }, (_, i) => Math.max(0, Math.min(maxIndex, single + ((i - Math.floor(targetCount / 2)) * step))));
        }

        const minVal = sorted[0];
        const maxVal = sorted[sorted.length - 1];
        const span = Math.max(1, maxVal - minVal);
        const idealStep = span / (targetCount - 1);
        const tolerance = Math.max(4, idealStep * 0.45);
        const lines = [];

        for (let i = 0; i < targetCount; i++) {
            const expected = minVal + (i * idealStep);
            let best = null;
            let bestDist = Number.POSITIVE_INFINITY;
            for (let j = 0; j < sorted.length; j++) {
                const dist = Math.abs(sorted[j] - expected);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = sorted[j];
                }
            }

            lines.push(best != null && bestDist <= tolerance ? best : expected);
        }

        for (let i = 1; i < lines.length; i++) {
            if (lines[i] <= lines[i - 1]) {
                lines[i] = Math.min(maxIndex, lines[i - 1] + Math.max(1, idealStep * 0.5));
            }
        }

        return lines.map((line) => Math.max(0, Math.min(maxIndex, line + offset)));
    }

    function detectGridLinesFromBinary(binaryMat, bounds, size = 9) {
        if (!binaryMat || !binaryMat.cols || !binaryMat.rows) return null;

        const x0 = Math.max(0, Math.min(binaryMat.cols - 1, Math.floor(bounds && bounds.x0 != null ? bounds.x0 : 0)));
        const y0 = Math.max(0, Math.min(binaryMat.rows - 1, Math.floor(bounds && bounds.y0 != null ? bounds.y0 : 0)));
        const x1 = Math.max(x0, Math.min(binaryMat.cols - 1, Math.ceil(bounds && bounds.x1 != null ? bounds.x1 : (binaryMat.cols - 1))));
        const y1 = Math.max(y0, Math.min(binaryMat.rows - 1, Math.ceil(bounds && bounds.y1 != null ? bounds.y1 : (binaryMat.rows - 1))));

        const localWidth = x1 - x0 + 1;
        const localHeight = y1 - y0 + 1;
        if (localWidth < 10 || localHeight < 10) return null;

        const vProfile = Array(localWidth).fill(0);
        const hProfile = Array(localHeight).fill(0);

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                if (binaryMat.ucharPtr(y, x)[0] > 0) {
                    vProfile[x - x0]++;
                    hProfile[y - y0]++;
                }
            }
        }

        const smoothV = smoothProfile(vProfile, 2);
        const smoothH = smoothProfile(hProfile, 2);
        const peakV = extractPeakCentersFromProfile(smoothV, 0.34, 2).map((p) => p.center);
        const peakH = extractPeakCentersFromProfile(smoothH, 0.34, 2).map((p) => p.center);

        const xLines = inferRegularLinePositionsFromCandidates(peakV, size + 1, localWidth - 1, x0);
        const yLines = inferRegularLinePositionsFromCandidates(peakH, size + 1, localHeight - 1, y0);
        if (!xLines || !yLines) return null;

        return {
            xLines,
            yLines,
            xPeaks: peakV.map((p) => p + x0),
            yPeaks: peakH.map((p) => p + y0),
            inferredCount: (size + 1 - peakV.length) + (size + 1 - peakH.length),
            bounds: { x0, y0, x1, y1 }
        };
    }

    function buildSudokuPatternFromGridLines(points, lineData, width, height, size = 9) {
        if (!lineData || !Array.isArray(lineData.xLines) || !Array.isArray(lineData.yLines)
            || lineData.xLines.length !== (size + 1) || lineData.yLines.length !== (size + 1)) {
            return null;
        }

        const candidatePoints = Array.isArray(points) ? points.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0)) : [];
        const used = new Set();
        const selected = [];
        let syntheticAdded = 0;

        const stepX = Math.max(1, (lineData.xLines[size] - lineData.xLines[0]) / size);
        const stepY = Math.max(1, (lineData.yLines[size] - lineData.yLines[0]) / size);
        const matchTolerance = Math.max(6, Math.floor(Math.min(stepX, stepY) * 0.55));
        const matchToleranceSq = matchTolerance * matchTolerance;

        for (let r = 0; r <= size; r++) {
            for (let c = 0; c <= size; c++) {
                const expectedX = lineData.xLines[c];
                const expectedY = lineData.yLines[r];
                const expectedNeighbors = getExpectedNeighborCount(r, c, size + 1);
                const expectedType = expectedNeighbors === 4 ? 'cross' : (expectedNeighbors === 3 ? 'tee' : 'corner');

                let bestIdx = -1;
                let bestDist = Number.POSITIVE_INFINITY;
                for (let i = 0; i < candidatePoints.length; i++) {
                    if (used.has(i)) continue;
                    const point = candidatePoints[i];
                    const dx = Number(point.x || 0) - expectedX;
                    const dy = Number(point.y || 0) - expectedY;
                    const distSq = (dx * dx) + (dy * dy);
                    if (distSq > matchToleranceSq) continue;
                    if (distSq < bestDist) {
                        bestDist = distSq;
                        bestIdx = i;
                    }
                }

                if (bestIdx >= 0) {
                    used.add(bestIdx);
                    const point = candidatePoints[bestIdx];
                    selected.push({
                        x: Number(point.x || 0),
                        y: Number(point.y || 0),
                        score: Number(point.score || 0),
                        count: Number(point.count || 1),
                        arms: Array.isArray(point.arms) ? point.arms.slice() : [],
                        neighborCount: expectedNeighbors,
                        type: expectedType
                    });
                } else {
                    syntheticAdded++;
                    selected.push({
                        x: Math.max(0, Math.min(width - 1, Math.round(expectedX))),
                        y: Math.max(0, Math.min(height - 1, Math.round(expectedY))),
                        score: 0,
                        count: 0,
                        arms: [],
                        neighborCount: expectedNeighbors,
                        type: expectedType,
                        synthetic: true
                    });
                }
            }
        }

        return {
            points: selected,
            syntheticAdded
        };
    }

    function extractSudoku81Pattern(points, width, height) {
        if (!Array.isArray(points) || points.length === 0) {
            return {
                points: [],
                syntheticAdded: 0
            };
        }

        const size = 9;
        const xs = points.map((p) => Number(p.x || 0));
        const ys = points.map((p) => Number(p.y || 0));
        const xCenters = kMeans1D(xs, size);
        const yCenters = kMeans1D(ys, size);
        if (!xCenters || !yCenters) {
            return {
                points: points.slice(),
                syntheticAdded: 0
            };
        }

        const xStep = (xCenters[size - 1] - xCenters[0]) / Math.max(1, size - 1);
        const yStep = (yCenters[size - 1] - yCenters[0]) / Math.max(1, size - 1);
        const tolX = Math.max(6, Math.floor(xStep * 0.55));
        const tolY = Math.max(6, Math.floor(yStep * 0.55));

        const used = new Set();
        const selected = [];
        let syntheticAdded = 0;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const tx = xCenters[c];
                const ty = yCenters[r];

                let bestIdx = -1;
                let bestDist = Number.POSITIVE_INFINITY;
                for (let i = 0; i < points.length; i++) {
                    if (used.has(i)) continue;
                    const point = points[i];
                    const dx = Math.abs(Number(point.x || 0) - tx);
                    const dy = Math.abs(Number(point.y || 0) - ty);
                    if (dx > tolX || dy > tolY) continue;
                    const dist = (dx * dx) + (dy * dy);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestIdx = i;
                    }
                }

                const expectedNeighbors = getExpectedNeighborCount(r, c, size);
                const expectedType = expectedNeighbors === 4 ? 'cross' : (expectedNeighbors === 3 ? 'tee' : 'corner');

                if (bestIdx >= 0) {
                    used.add(bestIdx);
                    const point = points[bestIdx];
                    selected.push({
                        x: Number(point.x || 0),
                        y: Number(point.y || 0),
                        score: Number(point.score || 0),
                        count: Number(point.count || 1),
                        arms: Array.isArray(point.arms) ? point.arms.slice() : [],
                        neighborCount: expectedNeighbors,
                        type: expectedType
                    });
                } else {
                    syntheticAdded++;
                    selected.push({
                        x: Math.max(0, Math.min(width - 1, Math.round(tx))),
                        y: Math.max(0, Math.min(height - 1, Math.round(ty))),
                        score: 0,
                        count: 0,
                        arms: [],
                        neighborCount: expectedNeighbors,
                        type: expectedType,
                        synthetic: true
                    });
                }
            }
        }

        return {
            points: selected,
            syntheticAdded
        };
    }

    function cleanFeaturePointsByGridRelations(points, width, height) {
        if (!Array.isArray(points) || points.length === 0) {
            return {
                points: [],
                report: buildPointGridReport([], 0)
            };
        }

        let current = points.slice();
        const initialCount = current.length;

        for (let pass = 0; pass < 4; pass++) {
            const neighborsByIndex = computeDirectionalNeighbors(current, width, height);
            const filtered = [];

            for (let i = 0; i < current.length; i++) {
                const point = current[i];
                const neighbors = neighborsByIndex[i];
                const neighborCount = countNeighbors(neighbors);
                const orthogonalForCorner = (neighborCount !== 2) || areOrthogonalArms(point);
                const validCount = neighborCount >= 2 && neighborCount <= 4;

                if (validCount && orthogonalForCorner) {
                    filtered.push({
                        x: point.x,
                        y: point.y,
                        score: point.score,
                        count: point.count,
                        arms: Array.isArray(point.arms) ? point.arms.slice() : [],
                        neighborCount,
                        type: classifyPointTypeByNeighbors(point, neighborCount)
                    });
                }
            }

            if (filtered.length === current.length) {
                current = filtered;
                break;
            }

            current = filtered;
            if (current.length === 0) break;
        }

        const finalNeighborsByIndex = computeDirectionalNeighbors(current, width, height);
        const finalized = current.map((point, i) => {
            const neighborCount = countNeighbors(finalNeighborsByIndex[i]);
            return {
                x: point.x,
                y: point.y,
                score: point.score,
                count: point.count,
                arms: Array.isArray(point.arms) ? point.arms.slice() : [],
                neighborCount,
                type: classifyPointTypeByNeighbors(point, neighborCount)
            };
        });

        return {
            points: finalized,
            report: buildPointGridReport(finalized, Math.max(0, initialCount - finalized.length))
        };
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

        const rawCount = features.length;
        const mergedPoints = mergeNearbyFeaturePoints(features, mergeDistance);
        const proximityCleanedPoints = pruneInsignificantNearbyFeaturePoints(
            mergedPoints,
            Math.max(6, Math.floor(mergeDistance * 0.8))
        )
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

        const denseCollapsedPoints = collapseDensePointPacks(proximityCleanedPoints, width, height)
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

        const cleaned = cleanFeaturePointsByGridRelations(denseCollapsedPoints, width, height);
        const gridPoints = cleaned.points
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

        const lineData = detectGridLinesFromBinary(binaryMat, {
            x0: 0,
            y0: 0,
            x1: width - 1,
            y1: height - 1
        }, 9);

        const pattern = lineData
            ? buildSudokuPatternFromGridLines(gridPoints, lineData, width, height, 9)
            : null;
        const fallbackPattern = !pattern ? extractSudoku81Pattern(gridPoints, width, height) : null;
        const kept = pattern ? pattern.points : (fallbackPattern ? fallbackPattern.points : gridPoints.slice());

        const relationRemoved = Number(cleaned && cleaned.report ? cleaned.report.removedCount : 0);
        const denseRemoved = Math.max(0, proximityCleanedPoints.length - denseCollapsedPoints.length);
        const patternRemoved = Math.max(0, gridPoints.length - kept.length);
        const syntheticAdded = Number((pattern && pattern.syntheticAdded) || (fallbackPattern && fallbackPattern.syntheticAdded) || 0);
        const report = buildPointGridReport(
            kept,
            relationRemoved + denseRemoved + patternRemoved,
            {
                raw: rawCount,
                merged: mergedPoints.length,
                proximity: proximityCleanedPoints.length,
                dense: denseCollapsedPoints.length,
                grid: gridPoints.length,
                pattern: kept.length,
                final: kept.length,
                relationRemoved,
                denseRemoved,
                syntheticAdded,
                capRemoved: 0,
                lineDetected: lineData ? 1 : 0,
                lineInferred: lineData ? Number(lineData.inferredCount || 0) : 0
            }
        );

        kept.report = report;
        return kept;
    }

    function detectSudokuCorners(imageEl) {
        const sourceCanvas = document.createElement('canvas');
        const srcW = imageEl.naturalWidth || imageEl.width;
        const srcH = imageEl.naturalHeight || imageEl.height;
        const scale = Math.min(1, 1100 / Math.max(1, srcW, srcH));
        sourceCanvas.width = Math.max(1, Math.round(srcW * scale));
        sourceCanvas.height = Math.max(1, Math.round(srcH * scale));
        const sourceCtx = sourceCanvas.getContext('2d');
        sourceCtx.drawImage(imageEl, 0, 0, sourceCanvas.width, sourceCanvas.height);

        const src = cv.imread(sourceCanvas);
        const gray = new cv.Mat();
        const blur = new cv.Mat();
        const thresh = new cv.Mat();
        const contours = new cv.MatVector();
        const hierarchy = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        const imageArea = Math.max(1, src.cols * src.rows);
        let best = null;

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

        const shrinkQuadToInnerLines = (quad) => {
            if (!Array.isArray(quad) || quad.length !== 4) return quad;

            const center = {
                x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
                y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4
            };

            const maxTravelRatio = 0.35;
            const blackGrayThreshold = 115;
            const innerSafetyRatio = 0.18;

            const refined = quad.map((corner) => {
                const dx = center.x - corner.x;
                const dy = center.y - corner.y;
                const len = Math.hypot(dx, dy);
                if (len < 2) return { x: corner.x, y: corner.y };

                const steps = Math.max(8, Math.floor(len * maxTravelRatio));
                let firstDarkStep = -1;
                let lastDarkStep = -1;

                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    const x = corner.x + dx * t * maxTravelRatio;
                    const y = corner.y + dy * t * maxTravelRatio;
                    const onDarkInBinary = sampleBin(x, y) > 0;
                    const onDarkInGray = sampleGray(x, y) <= blackGrayThreshold;
                    const isDark = onDarkInBinary || onDarkInGray;

                    if (isDark) {
                        if (firstDarkStep < 0) firstDarkStep = s;
                        lastDarkStep = s;
                        continue;
                    }

                    if (firstDarkStep >= 0) {
                        const bandWidth = Math.max(1, lastDarkStep - firstDarkStep + 1);
                        const safeInnerStep = Math.min(
                            steps,
                            Math.round(lastDarkStep + Math.max(1, bandWidth * innerSafetyRatio))
                        );
                        const safeT = safeInnerStep / steps;
                        return {
                            x: corner.x + dx * safeT * maxTravelRatio,
                            y: corner.y + dy * safeT * maxTravelRatio
                        };
                    }
                }

                if (firstDarkStep >= 0) {
                    const bandWidth = Math.max(1, lastDarkStep - firstDarkStep + 1);
                    const safeInnerStep = Math.min(
                        steps,
                        Math.round(lastDarkStep + Math.max(1, bandWidth * innerSafetyRatio))
                    );
                    const safeT = safeInnerStep / steps;
                    return {
                        x: corner.x + dx * safeT * maxTravelRatio,
                        y: corner.y + dy * safeT * maxTravelRatio
                    };
                }

                return { x: corner.x, y: corner.y };
            });

            return orderQuadPoints(refined);
        };

        const contourToPoints = (mat) => {
            const points = [];
            for (let i = 0; i < mat.rows; i++) {
                points.push({
                    x: mat.intPtr(i, 0)[0],
                    y: mat.intPtr(i, 0)[1]
                });
            }
            return points;
        };

        const edgeDistance = (a, b) => Math.hypot((Number(a && a.x) || 0) - (Number(b && b.x) || 0), (Number(a && a.y) || 0) - (Number(b && b.y) || 0));

        const scoreQuadrilateral = (points, areaRatio) => {
            if (!Array.isArray(points) || points.length !== 4) return -Infinity;
            const ordered = orderQuadPoints(points);
            const top = edgeDistance(ordered[0], ordered[1]);
            const right = edgeDistance(ordered[1], ordered[2]);
            const bottom = edgeDistance(ordered[2], ordered[3]);
            const left = edgeDistance(ordered[3], ordered[0]);
            const avg = Math.max(1, (top + right + bottom + left) / 4);
            const irregularity = Math.max(
                Math.abs(top - avg),
                Math.abs(right - avg),
                Math.abs(bottom - avg),
                Math.abs(left - avg)
            ) / avg;
            const regularity = 1 - Math.min(1, irregularity);
            return (areaRatio * 100) + (regularity * 50);
        };

        const chooseBestQuad = (contoursVector, opts) => {
            const settings = opts || {};
            const minRatio = Number(settings.minRatio || 0.08);
            const maxRatio = Number(settings.maxRatio || 0.95);
            const requireConvex = settings.requireConvex !== false;
            const updateByScore = settings.updateByScore !== false;

            let localBest = null;
            for (let i = 0; i < contoursVector.size(); i++) {
                const contour = contoursVector.get(i);
                const perimeter = cv.arcLength(contour, true);
                const approx = new cv.Mat();
                cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

                const convexOk = !requireConvex || cv.isContourConvex(approx);
                if (approx.rows === 4 && convexOk) {
                    const area = Math.abs(cv.contourArea(approx));
                    const areaRatio = area / imageArea;
                    if (areaRatio > minRatio && areaRatio < maxRatio) {
                        const points = contourToPoints(approx);
                        const score = updateByScore
                            ? scoreQuadrilateral(points, areaRatio)
                            : area;
                        if (!localBest || score > localBest.score) {
                            localBest = {
                                points,
                                score
                            };
                        }
                    }
                }

                approx.delete();
                contour.delete();
            }

            return localBest;
        };

        // Pass 1: strategy from app.js (best overall in RETR_LIST with geometric scoring).
        cv.medianBlur(gray, blur, 5);
        cv.adaptiveThreshold(
            blur,
            thresh,
            255,
            cv.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv.THRESH_BINARY_INV,
            21,
            7
        );
        {
            const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
            cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);
            kernel.delete();
        }
        cv.findContours(thresh, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
        best = chooseBestQuad(contours, {
            minRatio: 0.08,
            maxRatio: 0.95,
            requireConvex: true,
            updateByScore: true
        });

        // Pass 2 fallback: previous project strategy can recover some difficult images.
        if (!best) {
            cv.GaussianBlur(gray, blur, new cv.Size(7, 7), 0);
            cv.adaptiveThreshold(blur, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
            cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            best = chooseBestQuad(contours, {
                minRatio: 0.03,
                maxRatio: 0.98,
                requireConvex: false,
                updateByScore: false
            });
        }

        let points = null;
        if (best && Array.isArray(best.points) && best.points.length === 4) {
            points = orderQuadPoints(best.points);
            points = shrinkQuadToInnerLines(points);
        }

        src.delete();
        gray.delete();
        blur.delete();
        thresh.delete();
        contours.delete();
        hierarchy.delete();

        return {
            points,
            featurePoints: [],
            featureReport: null,
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
