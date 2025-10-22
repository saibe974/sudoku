/*******************************************************
 * techniques/xywing.js — XY-Wing
 *
 * Pivot A avec 2 candidats {x,y}.
 * Deux pinces B et C (pairs de 2 candidats) tels que:
 *  - B voit A et est {x,z}
 *  - C voit A et est {y,z}
 * Alors tout candidat z dans toute case qui voit à la fois B et C est éliminé.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'xywing',
    label: 'XY-Wing',
    finder: findXYWingStep,
    applier: applyXYWingStep
});

function sameBox(r1, c1, r2, c2) {
    return Math.floor(r1 / 3) === Math.floor(r2 / 3) && Math.floor(c1 / 3) === Math.floor(c2 / 3);
}

function isPeer(r1, c1, r2, c2) {
    return r1 === r2 || c1 === c2 || sameBox(r1, c1, r2, c2);
}

function findXYWingStep() {
    const { values } = getState();

    // Lister toutes les cases pivot avec exactement 2 candidats
    const pivots = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (values[r][c] === 0) {
                const cand = (candidates[r][c] || []).slice().sort((a, b) => a - b);
                if (cand.length === 2) pivots.push({ r, c, pair: cand });
            }
        }
    }

    for (const pivot of pivots) {
        const [x, y] = pivot.pair; // {x,y}

        // Trouver pinces B = {x,z} et C = {y,z} qui voient le pivot
        const pincersX = []; // {x,z}
        const pincersY = []; // {y,z}

        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (r === pivot.r && c === pivot.c) continue;
                if (!isPeer(r, c, pivot.r, pivot.c)) continue; // doit voir le pivot
                if (values[r][c] !== 0) continue;
                const cand = (candidates[r][c] || []).slice().sort((a, b) => a - b);
                if (cand.length !== 2) continue;

                // {x,z}
                if (cand.includes(x) && !cand.includes(y)) {
                    const z = cand[0] === x ? cand[1] : cand[0];
                    pincersX.push({ r, c, z });
                }
                // {y,z}
                else if (cand.includes(y) && !cand.includes(x)) {
                    const z = cand[0] === y ? cand[1] : cand[0];
                    pincersY.push({ r, c, z });
                }
            }
        }

        // Appariement des pinces par même z
        for (const B of pincersX) {
            for (const C of pincersY) {
                if (B.z !== C.z) continue;
                const z = B.z;
                // Calculer les kills: cellules qui voient B ET C et contiennent z
                const kills = [];
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) {
                        if (values[r][c] !== 0) continue;
                        if (r === pivot.r && c === pivot.c) continue;
                        if ((r === B.r && c === B.c) || (r === C.r && c === C.c)) continue;
                        if (!(candidates[r][c] || []).includes(z)) continue;
                        if (isPeer(r, c, B.r, B.c) && isPeer(r, c, C.r, C.c)) {
                            kills.push({ r, c });
                        }
                    }
                }

                if (kills.length > 0) {
                    return {
                        technique: 'XY-Wing',
                        pivot: { r: pivot.r, c: pivot.c },
                        pair: [x, y],
                        pincers: [{ r: B.r, c: B.c }, { r: C.r, c: C.c }],
                        digit: z,
                        kills,
                        explanation: `XY-Wing avec pivot (${pivot.r + 1},${pivot.c + 1}) sur {${x},${y}} et pinces en (${B.r + 1},${B.c + 1}) et (${C.r + 1},${C.c + 1}) → on retire ${z} des cases qui voient les deux pinces.`
                    };
                }
            }
        }
    }

    return null;
}

function applyXYWingStep(step) {
    const { pivot, pair, pincers, digit, kills } = step;

    clearHighlights();

    // Mettre en avant le pivot et ses deux candidats
    highlightCellStrong(pivot.r, pivot.c);
    pair.forEach(d => highlightCandidate(pivot.r, pivot.c, d, 'keep'));

    // Mettre en avant les deux pinces (on souligne surtout z)
    pincers.forEach(({ r, c }) => {
        highlightCellStrong(r, c);
        highlightCandidate(r, c, digit, 'keep');
    });

    // Appliquer les suppressions pour z
    kills.forEach(({ r, c }) => {
        highlightCandidate(r, c, digit, 'kill');
        candidates[r][c] = (candidates[r][c] || []).filter(x => x !== digit);
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
