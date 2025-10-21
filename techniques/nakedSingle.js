/*******************************************************
 * techniques/nakedSingle.js — Naked Single
 * (si une case n’a qu’un seul candidat, on place ce chiffre)
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'nakedSingle',
    label: 'Naked Single',
    finder: findNakedSingleStep,
    applier: applyNakedSingleStep
});

/*******************************************************
 * Détection d’un Naked Single
 ******************************************************/
function findNakedSingleStep() {
    const { values } = getState();

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (values[r][c] === 0) {
                const arr = candidates[r][c];
                if (arr && arr.length === 1) {
                    return {
                        technique: 'Naked Single',
                        r,
                        c,
                        value: arr[0],
                        explanation: `La case (${r + 1},${c + 1}) ne peut contenir que ${arr[0]} (candidat unique).`
                    };
                }
            }
        }
    }
    return null;
}

/*******************************************************
 * Application du Naked Single
 ******************************************************/
function applyNakedSingleStep(step) {
    const { r, c, value } = step;

    clearHighlights();

    // Poser la valeur
    const td = gridEl.rows[r].cells[c];
    const input = td.querySelector('input');
    input.value = String(value);

    // Supprimer tous les candidats de la case
    candidates[r][c] = [];

    // Surbrillance forte
    highlightCellStrong(r, c);
    highlightCandidate(r, c, value, 'keep');

    // Mise à jour globale
    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
