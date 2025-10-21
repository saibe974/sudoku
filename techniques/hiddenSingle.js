/*******************************************************
 * techniques/hiddenSingle.js — Hidden Single (Single Position)
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'hiddenSingle',
    label: 'Hidden Single',
    finder: findHiddenSingleStep,
    applier: applyHiddenSingleStep
});

/*******************************************************
 * Recherche d’un hidden single dans une unité
 ******************************************************/
function findHiddenSingleInUnit(cells, unitType, unitIndex) {
    const { values } = getState();

    for (let n = 1; n <= 9; n++) {
        let possiblePositions = [];

        for (const { r, c } of cells) {
            if (values[r][c] === 0 && candidates[r][c].includes(n)) {
                possiblePositions.push({ r, c });
            }
        }

        if (possiblePositions.length === 1) {
            const { r, c } = possiblePositions[0];
            return {
                technique: 'Hidden Single',
                r,
                c,
                value: n,
                unitType,
                unitIndex,
                explanation: `Dans la ${unitType} ${unitIndex + 1}, la valeur ${n} ne peut apparaître qu'en (${r + 1},${c + 1}).`
            };
        }
    }
    return null;
}

/*******************************************************
 * Détection générale : ligne → colonne → bloc
 ******************************************************/
function findHiddenSingleStep() {
    // Lignes
    for (let r = 0; r < 9; r++) {
        const cells = Array.from({ length: 9 }, (_, c) => ({ r, c }));
        const step = findHiddenSingleInUnit(cells, 'ligne', r);
        if (step) return step;
    }

    // Colonnes
    for (let c = 0; c < 9; c++) {
        const cells = Array.from({ length: 9 }, (_, r) => ({ r, c }));
        const step = findHiddenSingleInUnit(cells, 'colonne', c);
        if (step) return step;
    }

    // Blocs 3×3
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const blockIndex = br * 3 + bc;
            const cells = [];
            for (let r = br * 3; r < br * 3 + 3; r++) {
                for (let c = bc * 3; c < bc * 3 + 3; c++) {
                    cells.push({ r, c });
                }
            }
            const step = findHiddenSingleInUnit(cells, 'bloc', blockIndex);
            if (step) return step;
        }
    }

    return null;
}

/*******************************************************
 * Application de l'étape Hidden Single
 ******************************************************/
function applyHiddenSingleStep(step) {
    const { r, c, value, unitType, unitIndex } = step;

    clearHighlights();

    // Surlignage de l'unité impliquée
    if (unitType === 'ligne') {
        for (let cc = 0; cc < 9; cc++) {
            gridEl.rows[unitIndex].cells[cc].classList.add('cell-highlight');
        }
    } else if (unitType === 'colonne') {
        for (let rr = 0; rr < 9; rr++) {
            gridEl.rows[rr].cells[unitIndex].classList.add('cell-highlight');
        }
    } else {
        const br = Math.floor(unitIndex / 3) * 3;
        const bc = (unitIndex % 3) * 3;
        for (let rr = br; rr < br + 3; rr++) {
            for (let cc = bc; cc < bc + 3; cc++) {
                gridEl.rows[rr].cells[cc].classList.add('cell-highlight');
            }
        }
    }

    // Pose de la valeur dans la case
    gridEl.rows[r].cells[c].querySelector('input').value = value;
    candidates[r][c] = [];

    // Case finale en surbrillance forte
    highlightCellStrong(r, c);
    highlightCandidate(r, c, value, 'keep');

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
