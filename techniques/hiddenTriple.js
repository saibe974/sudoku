/*******************************************************
 * techniques/hiddenTriple.js — Hidden Triple (Triplet caché)
 * Trois chiffres {a,b,c} n'apparaissent qu'à trois positions
 * dans une unité → ces trois cases ne peuvent contenir que {a,b,c}.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'hiddenTriple',
    label: 'Hidden Triple',
    finder: findHiddenTripleStep,
    applier: applyHiddenTripleStep
});

function findHiddenTripleInUnit(cells, unitLabel) {
    const { values, candidates } = getState();

    // positionsParChiffre[n] = [{r,c}, ...]
    const positionsParChiffre = Array.from({ length: 10 }, () => []);
    for (const { r, c } of cells) {
        if (values[r][c] === 0) {
            for (let n = 1; n <= 9; n++) {
                if (candidates[r][c]?.includes(n)) positionsParChiffre[n].push({ r, c });
            }
        }
    }

    // Choisir triplets de chiffres (a<b<c)
    for (let a = 1; a <= 9; a++) {
        for (let b = a + 1; b <= 9; b++) {
            for (let c = b + 1; c <= 9; c++) {
                const A = positionsParChiffre[a];
                const B = positionsParChiffre[b];
                const C = positionsParChiffre[c];
                if (!A.length || !B.length || !C.length) continue;

                // Union des positions
                const keyPos = (p) => `${p.r},${p.c}`;
                const unionMap = new Map();
                [...A, ...B, ...C].forEach(p => unionMap.set(keyPos(p), p));
                const union = Array.from(unionMap.values());

                if (union.length === 3) {
                    const digits = [a, b, c];
                    const keeps = union.map(p => ({ r: p.r, c: p.c }));

                    // Dans ces 3 cases, on retire tous les candidats ≠ digits
                    const kills = [];
                    for (const { r, c } of keeps) {
                        const toRemove = (candidates[r][c] || []).filter(x => !digits.includes(x));
                        if (toRemove.length) kills.push({ r, c, remove: toRemove });
                    }

                    if (kills.length) {
                        return {
                            technique: 'Hidden Triple',
                            digits,
                            keeps,
                            kills,
                            explanation: `Dans ${unitLabel}, les chiffres {${digits.join(', ')}} sont cachés sur 3 cases, ces cases ne doivent contenir qu'eux.`
                        };
                    }
                }
            }
        }
    }
    return null;
}

function findHiddenTripleStep() {
    // Lignes
    for (let r = 0; r < 9; r++) {
        const cells = Array.from({ length: 9 }, (_, c) => ({ r, c }));
        const step = findHiddenTripleInUnit(cells, `la ligne ${r + 1}`);
        if (step) return step;
    }
    // Colonnes
    for (let c = 0; c < 9; c++) {
        const cells = Array.from({ length: 9 }, (_, r) => ({ r, c }));
        const step = findHiddenTripleInUnit(cells, `la colonne ${c + 1}`);
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
            const step = findHiddenTripleInUnit(cells, `le bloc ${blockIndex + 1}`);
            if (step) return step;
        }
    }
    return null;
}

function applyHiddenTripleStep(step) {
    const { digits, keeps, kills } = step;

    clearHighlights();

    // Met en avant les 3 cases du triplet caché
    keeps.forEach(({ r, c }) => {
        highlightCellStrong(r, c);
        digits.forEach(d => highlightCandidate(r, c, d, 'keep'));
    });

    // Supprime les autres candidats de ces cases
    kills.forEach(({ r, c, remove }) => {
        remove.forEach(d => highlightCandidate(r, c, d, 'kill'));
        candidates[r][c] = (candidates[r][c] || []).filter(x => !remove.includes(x));
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
