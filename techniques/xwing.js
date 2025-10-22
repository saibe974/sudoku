/*******************************************************
 * techniques/xwing.js — X-Wing
 *
 * Si un candidat n n’apparaît que dans EXACTEMENT 2 colonnes
 * d’une ligne, ET que ces deux colonnes sont identiques sur
 * une autre ligne, alors n est un X-Wing basé sur les lignes.
 * => On supprime n ailleurs dans ces colonnes.
 *
 * Et inversement pour une base colonne.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'xwing',
    label: 'X-Wing',
    finder: findXWingStep,
    applier: applyXWingStep
});

/*******************************************************
 * Trouver un X-Wing basé sur les lignes
 ******************************************************/
function findXWingOnRows() {
    const { values } = getState();

    for (let n = 1; n <= 9; n++) {
        const rowPositions = [];

        // Collecte pour chaque ligne les colonnes où n est candidat
        for (let r = 0; r < 9; r++) {
            const cols = [];
            for (let c = 0; c < 9; c++) {
                if (values[r][c] === 0 && candidates[r][c]?.includes(n)) {
                    cols.push(c);
                }
            }
            if (cols.length === 2) {
                rowPositions.push({ r, cols });
            }
        }

        // Comparer deux lignes à deux colonnes identiques
        for (let i = 0; i < rowPositions.length - 1; i++) {
            for (let j = i + 1; j < rowPositions.length; j++) {
                const R1 = rowPositions[i], R2 = rowPositions[j];
                if (R1.cols[0] === R2.cols[0] && R1.cols[1] === R2.cols[1]) {
                    const [c1, c2] = R1.cols;
                    const kills = [];

                    // Supprimer n dans toutes les autres lignes des colonnes c1, c2
                    for (let r = 0; r < 9; r++) {
                        if (r === R1.r || r === R2.r) continue;
                        for (const cc of [c1, c2]) {
                            if (values[r][cc] === 0 && candidates[r][cc]?.includes(n)) {
                                kills.push({ r, c: cc });
                            }
                        }
                    }

                    if (kills.length > 0) {
                        return {
                            technique: 'X-Wing',
                            digit: n,
                            rows: [R1.r, R2.r],
                            cols: [c1, c2],
                            orientation: 'rows',
                            kills,
                            explanation: `Le candidat ${n} forme un X-Wing entre les lignes ${R1.r + 1} et ${R2.r + 1} sur les colonnes ${c1 + 1} et ${c2 + 1}, donc on le supprime ailleurs dans ces colonnes.`
                        };
                    }
                }
            }
        }
    }
    return null;
}

/*******************************************************
 * Trouver un X-Wing basé sur les colonnes
 ******************************************************/
function findXWingOnCols() {
    const { values } = getState();

    for (let n = 1; n <= 9; n++) {
        const colPositions = [];

        // Collecte pour chaque colonne les lignes où n est candidat
        for (let c = 0; c < 9; c++) {
            const rows = [];
            for (let r = 0; r < 9; r++) {
                if (values[r][c] === 0 && candidates[r][c]?.includes(n)) {
                    rows.push(r);
                }
            }
            if (rows.length === 2) {
                colPositions.push({ c, rows });
            }
        }

        // Comparer deux colonnes à deux lignes identiques
        for (let i = 0; i < colPositions.length - 1; i++) {
            for (let j = i + 1; j < colPositions.length; j++) {
                const C1 = colPositions[i], C2 = colPositions[j];
                if (C1.rows[0] === C2.rows[0] && C1.rows[1] === C2.rows[1]) {
                    const [r1, r2] = C1.rows;
                    const kills = [];

                    // Supprimer n dans toutes les autres colonnes des lignes r1, r2
                    for (let c = 0; c < 9; c++) {
                        if (c === C1.c || c === C2.c) continue;
                        for (const rr of [r1, r2]) {
                            if (values[rr][c] === 0 && candidates[rr][c]?.includes(n)) {
                                kills.push({ r: rr, c });
                            }
                        }
                    }

                    if (kills.length > 0) {
                        return {
                            technique: 'X-Wing',
                            digit: n,
                            rows: [r1, r2],
                            cols: [C1.c, C2.c],
                            orientation: 'cols',
                            kills,
                            explanation: `Le candidat ${n} forme un X-Wing entre les colonnes ${C1.c + 1} et ${C2.c + 1} sur les lignes ${r1 + 1} et ${r2 + 1}, donc on le supprime ailleurs dans ces lignes.`
                        };
                    }
                }
            }
        }
    }
    return null;
}

/*******************************************************
 * Recherche globale
 ******************************************************/
function findXWingStep() {
    return findXWingOnRows() || findXWingOnCols();
}

/*******************************************************
 * Application visuelle et élimination
 ******************************************************/
function applyXWingStep(step) {
    const { digit, rows, cols, kills, orientation } = step;

    clearHighlights();

    // Surligner les 4 cellules du X (keeps comme repères)
    rows.forEach(r => {
        cols.forEach(c => {
            highlightCellStrong(r, c);
            highlightCandidate(r, c, digit, 'keep');
        });
    });

    // Supprimer les autres candidats dans les kills
    kills.forEach(({ r, c }) => {
        highlightCandidate(r, c, digit, 'kill');
        candidates[r][c] = candidates[r][c].filter(x => x !== digit);
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
