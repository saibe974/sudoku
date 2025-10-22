/*******************************************************
 * techniques/swordfish.js — Swordfish
 *
 * Généralisation du X-Wing à 3 lignes/colonnes.
 * Pour un candidat n :
 *  - Base lignes : choisir 3 lignes où n n'apparaît que sur 2 ou 3 colonnes,
 *    et l'union de ces colonnes vaut exactement 3 → on supprime n ailleurs
 *    dans ces 3 colonnes (hors des 3 lignes).
 *  - Base colonnes : symétrique en inversant lignes/colonnes.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'swordfish',
    label: 'Swordfish',
    finder: findSwordfishStep,
    applier: applySwordfishStep
});

function findSwordfishOnRows() {
    const { values } = getState();

    for (let n = 1; n <= 9; n++) {
        const rowInfos = [];

        // Pour chaque ligne, colonnes où n est candidat (2 à 3 colonnes)
        for (let r = 0; r < 9; r++) {
            const cols = [];
            for (let c = 0; c < 9; c++) {
                if (values[r][c] === 0 && (candidates[r][c]?.includes(n))) cols.push(c);
            }
            if (cols.length >= 2 && cols.length <= 3) {
                rowInfos.push({ r, cols });
            }
        }

        if (rowInfos.length < 3) continue;

        // Combinaisons de 3 lignes
        for (let i = 0; i < rowInfos.length - 2; i++) {
            for (let j = i + 1; j < rowInfos.length - 1; j++) {
                for (let k = j + 1; k < rowInfos.length; k++) {
                    const R1 = rowInfos[i], R2 = rowInfos[j], R3 = rowInfos[k];
                    const colSet = Array.from(new Set([...R1.cols, ...R2.cols, ...R3.cols])).sort((a, b) => a - b);
                    if (colSet.length !== 3) continue;

                    // Kills: dans ces 3 colonnes, supprimer n sur toutes les autres lignes
                    const rows = [R1.r, R2.r, R3.r];
                    const kills = [];
                    for (let r = 0; r < 9; r++) {
                        if (rows.includes(r)) continue;
                        for (const c of colSet) {
                            if (values[r][c] === 0 && candidates[r][c]?.includes(n)) {
                                kills.push({ r, c });
                            }
                        }
                    }

                    if (kills.length > 0) {
                        return {
                            technique: 'Swordfish',
                            digit: n,
                            rows,
                            cols: colSet,
                            orientation: 'rows',
                            kills,
                            explanation: `Le candidat ${n} forme un Swordfish basé lignes sur les lignes ${rows.map(x => x + 1).join(', ')} et colonnes ${colSet.map(x => x + 1).join(', ')}, donc on le supprime ailleurs dans ces colonnes.`
                        };
                    }
                }
            }
        }
    }
    return null;
}

function findSwordfishOnCols() {
    const { values } = getState();

    for (let n = 1; n <= 9; n++) {
        const colInfos = [];

        // Pour chaque colonne, lignes où n est candidat (2 à 3 lignes)
        for (let c = 0; c < 9; c++) {
            const rows = [];
            for (let r = 0; r < 9; r++) {
                if (values[r][c] === 0 && (candidates[r][c]?.includes(n))) rows.push(r);
            }
            if (rows.length >= 2 && rows.length <= 3) {
                colInfos.push({ c, rows });
            }
        }

        if (colInfos.length < 3) continue;

        // Combinaisons de 3 colonnes
        for (let i = 0; i < colInfos.length - 2; i++) {
            for (let j = i + 1; j < colInfos.length - 1; j++) {
                for (let k = j + 1; k < colInfos.length; k++) {
                    const C1 = colInfos[i], C2 = colInfos[j], C3 = colInfos[k];
                    const rowSet = Array.from(new Set([...C1.rows, ...C2.rows, ...C3.rows])).sort((a, b) => a - b);
                    if (rowSet.length !== 3) continue;

                    // Kills: dans ces 3 lignes, supprimer n sur toutes les autres colonnes
                    const cols = [C1.c, C2.c, C3.c];
                    const kills = [];
                    for (const r of rowSet) {
                        for (let c = 0; c < 9; c++) {
                            if (cols.includes(c)) continue;
                            if (values[r][c] === 0 && candidates[r][c]?.includes(n)) {
                                kills.push({ r, c });
                            }
                        }
                    }

                    if (kills.length > 0) {
                        return {
                            technique: 'Swordfish',
                            digit: n,
                            rows: rowSet,
                            cols,
                            orientation: 'cols',
                            kills,
                            explanation: `Le candidat ${n} forme un Swordfish basé colonnes sur les colonnes ${cols.map(x => x + 1).join(', ')} et lignes ${rowSet.map(x => x + 1).join(', ')}, donc on le supprime ailleurs dans ces lignes.`
                        };
                    }
                }
            }
        }
    }
    return null;
}

function findSwordfishStep() {
    return findSwordfishOnRows() || findSwordfishOnCols();
}

function applySwordfishStep(step) {
    const { digit, rows, cols, kills } = step;

    clearHighlights();

    // Surligner les 9 intersections potentielles du motif
    rows.forEach(r => {
        cols.forEach(c => {
            highlightCellStrong(r, c);
            highlightCandidate(r, c, digit, 'keep');
        });
    });

    // Supprimer les candidats dans les positions "kills"
    kills.forEach(({ r, c }) => {
        highlightCandidate(r, c, digit, 'kill');
        candidates[r][c] = (candidates[r][c] || []).filter(x => x !== digit);
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
