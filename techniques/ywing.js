/*******************************************************
 * techniques/ywing.js — Y-Wing (alias d'XY-Wing)
 *
 * Y-Wing est synonyme d'XY-Wing. On réutilise la détection
 * et l'application d'XY-Wing si disponible.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

function findYWingStep() {
    if (typeof findXYWingStep === 'function') {
        return findXYWingStep();
    }
    return null;
}

function applyYWingStep(step) {
    if (typeof applyXYWingStep === 'function') {
        return applyXYWingStep(step);
    }
    // Fallback minimal si jamais XY n'est pas dispo (devrait rarement arriver)
    const { pivot, pair, pincers, digit, kills } = step || {};
    clearHighlights();
    if (pivot) {
        highlightCellStrong(pivot.r, pivot.c);
        ; (pair || []).forEach(d => highlightCandidate(pivot.r, pivot.c, d, 'keep'));
    }
    ; (pincers || []).forEach(({ r, c }) => {
        highlightCellStrong(r, c);
        if (digit) highlightCandidate(r, c, digit, 'keep');
    });
    ; (kills || []).forEach(({ r, c }) => {
        if (digit) highlightCandidate(r, c, digit, 'kill');
        candidates[r][c] = (candidates[r][c] || []).filter(x => x !== digit);
    });
    updateConflicts();
    renderAllCells();
    setStatus(step?.explanation || 'Y-Wing appliqué.', 'ok');
}

window.SudokuTechniqueRegistry.push({
    key: 'ywing',
    label: 'Y-Wing',
    finder: findYWingStep,
    applier: applyYWingStep
});
