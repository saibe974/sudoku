/*******************************************************
 * techniques/nakedPair.js — Naked Pair
 * Deux cases dans une unité ont exactement 2 candidats identiques → 
 * elles “réclament” ces deux valeurs → supprimer ces candidats ailleurs dans l’unité.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'nakedPair',
    label: 'Naked Pair',
    finder: findNakedPairStep,
    applier: applyNakedPairStep
});

/*******************************************************
 * Recherche de Naked Pair dans une unité donnée
 ******************************************************/
function findNakedPairInUnit(cells, unitLabel) {
    const { values } = getState();

    // Collecte des cellules candidates de taille 2 dans l’unité
    const pairs = [];
    for (const { r, c } of cells) {
        if (values[r][c] === 0 && candidates[r][c].length === 2) {
            const key = candidates[r][c].join(',');
            pairs.push({ r, c, key });
        }

        // Rechercher des paires identiques (exactement 2 occurrences)
        const groupMap = pairs.reduce((map, cell) => {
            if (!map[cell.key]) map[cell.key] = [];
            map[cell.key].push(cell);
            return map;
        }, {});

        for (const key in groupMap) {
            if (groupMap[key].length === 2) {
                const keeps = groupMap[key].map(({ r, c }) => ({ r, c }));
                const digits = key.split(',').map(Number);

                // Trouver les kills (candidates à supprimer dans les autres cases de l’unité)
                const kills = [];
                for (const { r, c } of cells) {
                    if (!keeps.some(k => k.r === r && k.c === c) &&
                        values[r][c] === 0 &&
                        candidates[r][c].some(n => digits.includes(n))) {
                        kills.push({ r, c });
                    }
                }

                if (kills.length > 0) {
                    return {
                        technique: 'Naked Pair',
                        digits,
                        keeps,
                        kills,
                        explanation: `Dans ${unitLabel}, les cases (${keeps[0].r + 1},${keeps[0].c + 1}) et (${keeps[1].r + 1},${keeps[1].c + 1}) ne peuvent contenir que ${digits.join(' ou ')}, donc on retire ces candidats ailleurs.`
                    };
                }
            }
        }

        return null;
    }
}

/*******************************************************
 * Recherche globale (ligne → colonne → bloc)
 ******************************************************/
function findNakedPairStep() {
    // Lignes
    for (let r = 0; r < 9; r++) {
        const cells = Array.from({ length: 9 }, (_, c) => ({ r, c }));
        const step = findNakedPairInUnit(cells, `la ligne ${r + 1}`);
        if (step) return step;
    }

    // Colonnes
    for (let c = 0; c < 9; c++) {
        const cells = Array.from({ length: 9 }, (_, r) => ({ r, c }));
        const step = findNakedPairInUnit(cells, `la colonne ${c + 1}`);
        if (step) return step;
    }

    // Blocs
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const cells = [];
            for (let r = br * 3; r < br * 3 + 3; r++) {
                for (let c = bc * 3; c < bc * 3 + 3; c++) {
                    cells.push({ r, c });
                }
            }
            const blockIndex = br * 3 + bc;
            const step = findNakedPairInUnit(cells, `le bloc ${blockIndex + 1}`);
            if (step) return step;
        }
    }

    return null;
}

/*******************************************************
 * Application Naked Pair
 ******************************************************/
function applyNakedPairStep(step) {
    const { digits, keeps, kills } = step;

    clearHighlights();

    // Surbrillance des paires conservées (keeps)
    keeps.forEach(({ r, c }) => {
        highlightCellStrong(r, c);
        digits.forEach(d => highlightCandidate(r, c, d, 'keep'));
    });

    // Supprimer les digits ailleurs (kills)
    kills.forEach(({ r, c }) => {
        digits.forEach(d => highlightCandidate(r, c, d, 'kill'));
        candidates[r][c] = candidates[r][c].filter(n => !digits.includes(n));
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
