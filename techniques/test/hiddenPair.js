/*******************************************************
 * techniques/hiddenPair.js — Hidden Pair (Paire cachée)
 * Deux chiffres {a,b} n'apparaissent qu'à deux positions
 * dans une unité → ces deux cases ne peuvent contenir que {a,b}.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'hiddenPair',
    label: 'Hidden Pair',
    finder: findHiddenPairStep,
    applier: applyHiddenPairStep
});

function findHiddenPairInUnit(cells, unitLabel) {
    const { values } = getState();

    // positionsParChiffre[n] = [{r,c}, ...] pour n=1..9
    const positionsParChiffre = Array.from({ length: 10 }, () => []);
    for (const { r, c } of cells) {
        if (values[r][c] === 0) {
            for (let n = 1; n <= 9; n++) {
                if (candidates[r][c]?.includes(n)) positionsParChiffre[n].push({ r, c });
            }
        }
    }

    // Pour chaque paire de chiffres (a<b), s'ils partagent exactement 2 positions communes
    for (let a = 1; a <= 9; a++) {
        for (let b = a + 1; b <= 9; b++) {
            const A = positionsParChiffre[a];
            const B = positionsParChiffre[b];
            if (A.length === 0 || B.length === 0) continue;

            // Intersection des positions
            const keyPos = (p) => `${p.r},${p.c}`;
            const setA = new Set(A.map(keyPos));
            const inter = B.filter(p => setA.has(keyPos(p)));

            if (inter.length === 2) {
                const keeps = inter.map(p => ({ r: p.r, c: p.c }));
                const digits = [a, b];

                // Kills = dans ces deux cases, tout candidat ≠ a,b
                const kills = [];
                for (const { r, c } of keeps) {
                    const toRemove = (candidates[r][c] || []).filter(x => !digits.includes(x));
                    if (toRemove.length) kills.push({ r, c, remove: toRemove });
                }

                if (kills.length > 0) {
                    return {
                        technique: 'Hidden Pair',
                        digits,
                        keeps,
                        kills,
                        explanation: `Dans ${unitLabel}, les chiffres ${a} et ${b} n'apparaissent qu'en deux positions. Ces deux cases sont donc {${a}, ${b}} uniquement.`
                    };
                }
            }
        }
    }
    return null;
}

function findHiddenPairStep() {
    // Lignes
    for (let r = 0; r < 9; r++) {
        const cells = Array.from({ length: 9 }, (_, c) => ({ r, c }));
        const step = findHiddenPairInUnit(cells, `la ligne ${r + 1}`);
        if (step) return step;
    }
    // Colonnes
    for (let c = 0; c < 9; c++) {
        const cells = Array.from({ length: 9 }, (_, r) => ({ r, c }));
        const step = findHiddenPairInUnit(cells, `la colonne ${c + 1}`);
        if (step) return step;
    }
    // Blocs
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const blockIndex = br * 3 + bc;
            const cells = [];
            for (let r = br * 3; r < br * 3 + 3; r++) {
                for (let c = bc * 3; c < bc * 3 + 3; c++) cells.push({ r, c });
            }
            const step = findHiddenPairInUnit(cells, `le bloc ${blockIndex + 1}`);
            if (step) return step;
        }
    }
    return null;
}

function applyHiddenPairStep(step) {
    const { digits, keeps, kills } = step;

    clearHighlights();

    // Met en avant les deux cases de la paire et les chiffres gardés
    keeps.forEach(({ r, c }) => {
        highlightCellStrong(r, c);
        digits.forEach(d => highlightCandidate(r, c, d, 'keep'));
    });

    // Supprime les autres candidats dans ces deux cases
    kills.forEach(({ r, c, remove }) => {
        remove.forEach(d => highlightCandidate(r, c, d, 'kill'));
        candidates[r][c] = (candidates[r][c] || []).filter(x => !remove.includes(x));
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
