/*******************************************************
 * techniques/uniqueRectangle.js — Unique Rectangle (UR Type 1)
 *
 * Si quatre cases formant un rectangle (2 lignes × 2 colonnes)
 * n'ont que les deux candidats {a,b}, et que l'une de ces cases
 * possède {a,b} + autres candidats, alors pour éviter une solution
 * multiple, on DOIT retirer a et b de cette case "extra".
 *
 * Implémentation: UR Type 1 uniquement (simple et sûr).
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'uniqueRectangle',
    label: 'Unique Rectangle',
    finder: findUniqueRectangleStep,
    applier: applyUniqueRectangleStep
});

function blockIndexOf(r, c) {
    return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

function findUniqueRectangleStep() {
    const { values } = getState();

    // Parcours de toutes les paires de lignes
    for (let r1 = 0; r1 < 8; r1++) {
        for (let r2 = r1 + 1; r2 < 9; r2++) {
            // Paires de chiffres (a<b)
            for (let a = 1; a <= 8; a++) {
                for (let b = a + 1; b <= 9; b++) {
                    // Colonnes où (r1,c) et (r2,c) sont des sous-ensembles de {a,b}
                    const cols = [];
                    for (let c = 0; c < 9; c++) {
                        if (values[r1][c] !== 0 || values[r2][c] !== 0) continue;
                        const cand1 = (candidates[r1][c] || []);
                        const cand2 = (candidates[r2][c] || []);
                        const sub1 = cand1.every(x => [a, b].includes(x));
                        const sub2 = cand2.every(x => [a, b].includes(x));
                        const hasAB1 = cand1.includes(a) && cand1.includes(b);
                        const hasAB2 = cand2.includes(a) && cand2.includes(b);
                        // Chaque case doit être uniquement composée de {a,b} (UR pattern),
                        // ou contenir {a,b} parmi d'autres candidats (pour la case extra).
                        if ((sub1 || hasAB1) && (sub2 || hasAB2) && (cand1.length > 0) && (cand2.length > 0)) {
                            // On ne garde que les colonnes où les deux lignes ont {a,b} présents au moins.
                            if ((hasAB1 || sub1) && (hasAB2 || sub2)) cols.push(c);
                        }
                    }
                    if (cols.length < 2) continue;

                    // Choisir des paires de colonnes pour former le rectangle
                    for (let i = 0; i < cols.length - 1; i++) {
                        for (let j = i + 1; j < cols.length; j++) {
                            const c1 = cols[i], c2 = cols[j];
                            const cells = [
                                { r: r1, c: c1 }, { r: r1, c: c2 },
                                { r: r2, c: c1 }, { r: r2, c: c2 }
                            ];

                            // Optionnel: restreindre aux rectangles couvrant exactement 2 blocs (plus classique)
                            const blocks = new Set(cells.map(p => blockIndexOf(p.r, p.c)));
                            if (blocks.size !== 2) continue;

                            // Examiner les candidats dans ces 4 cases
                            const infos = cells.map(({ r, c }) => ({ r, c, cand: (candidates[r][c] || []).slice().sort((x, y) => x - y) }));

                            // Comptage des cases "pures" (= exactement {a,b}) et de la case extra
                            let pure = [];
                            let extra = null;
                            let okShape = true;
                            for (const info of infos) {
                                const hasA = info.cand.includes(a);
                                const hasB = info.cand.includes(b);
                                if (!hasA || !hasB) { okShape = false; break; }
                                if (info.cand.length === 2 && hasA && hasB) pure.push(info);
                                else if (info.cand.length > 2) {
                                    if (!extra) extra = info; else { okShape = false; break; }
                                } else {
                                    okShape = false; break;
                                }
                            }
                            if (!okShape) continue;
                            if (!(pure.length === 3 && extra)) continue; // UR Type 1: 3 pures + 1 extra

                            // Kills: retirer a et b de la case extra
                            const kills = [{ r: extra.r, c: extra.c, remove: [a, b] }];
                            // Vérifier qu'il y a réellement quelque chose à retirer
                            const canRemove = kills[0].remove.some(d => (candidates[extra.r][extra.c] || []).includes(d));
                            if (!canRemove) continue;

                            const rect = cells;
                            return {
                                technique: 'Unique Rectangle',
                                type: 'UR1',
                                digits: [a, b],
                                rect,
                                target: { r: extra.r, c: extra.c },
                                kills,
                                explanation: `Unique Rectangle (type 1) sur les lignes ${r1 + 1}/${r2 + 1} et colonnes ${c1 + 1}/${c2 + 1} avec {${a},${b}} → on retire {${a},${b}} de (${extra.r + 1},${extra.c + 1}) pour éviter une solution multiple.`
                            };
                        }
                    }
                }
            }
        }
    }

    return null;
}

function applyUniqueRectangleStep(step) {
    const { digits, rect, target, kills } = step;

    clearHighlights();

    // Surligner les 4 cases du rectangle
    rect.forEach(({ r, c }) => highlightCellStrong(r, c));

    // Mettre en avant {a,b} dans les 4 cases (keep)
    rect.forEach(({ r, c }) => digits.forEach(d => highlightCandidate(r, c, d, 'keep')));

    // Retirer {a,b} de la case extra
    kills.forEach(({ r, c, remove }) => {
        remove.forEach(d => highlightCandidate(r, c, d, 'kill'));
        candidates[r][c] = (candidates[r][c] || []).filter(x => !remove.includes(x));
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
