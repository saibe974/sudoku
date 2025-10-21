/*******************************************************
 * techniques/nakedTriple.js — Naked Triple (Triplet nu)
 * Trois cases dans une unité ont un ensemble de candidats
 * dont l'union est exactement 3 chiffres {a,b,c} → on
 * retire {a,b,c} de toutes les autres cases de l'unité.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'nakedTriple',
    label: 'Naked Triple',
    finder: findNakedTripleStep,
    applier: applyNakedTripleStep
});

function findNakedTripleInUnit(cells, unitLabel) {
    const { values } = getState();

    // Récupérer les cellules ouvertes avec ≤3 candidats
    const open = cells
        .filter(({ r, c }) => values[r][c] === 0 && (candidates[r][c]?.length || 0) > 0 && (candidates[r][c].length <= 3))
        .map(({ r, c }) => ({ r, c, set: Array.from(new Set(candidates[r][c])).sort((a, b) => a - b) }));

    if (open.length < 3) return null;

    // Choisir toutes les combinaisons de 3 cases
    for (let i = 0; i < open.length - 2; i++) {
        for (let j = i + 1; j < open.length - 1; j++) {
            for (let k = j + 1; k < open.length; k++) {
                const A = open[i], B = open[j], C = open[k];

                // Union des candidats
                const unionSet = Array.from(new Set([...A.set, ...B.set, ...C.set])).sort((a, b) => a - b);
                if (unionSet.length !== 3) continue;

                // Chaque case doit être un sous-ensemble de l'union
                const subset = (arr, set) => arr.every(x => set.includes(x));
                if (!subset(A.set, unionSet) || !subset(B.set, unionSet) || !subset(C.set, unionSet)) continue;

                // Kills dans les autres cases de l'unité
                const keeps = [{ r: A.r, c: A.c }, { r: B.r, c: B.c }, { r: C.r, c: C.c }];
                const kills = [];
                for (const { r, c } of cells) {
                    if (keeps.some(p => p.r === r && p.c === c)) continue;
                    if (values[r][c] !== 0) continue;
                    const toRemove = (candidates[r][c] || []).filter(x => unionSet.includes(x));
                    if (toRemove.length) kills.push({ r, c, remove: toRemove });
                }

                if (kills.length) {
                    return {
                        technique: 'Naked Triple',
                        digits: unionSet,
                        keeps,
                        kills,
                        explanation: `Dans ${unitLabel}, trois cases forment un triplet nu {${unionSet.join(', ')}}, retiré des autres cases de l'unité.`
                    };
                }
            }
        }
    }
    return null;
}

function findNakedTripleStep() {
    // Lignes
    for (let r = 0; r < 9; r++) {
        const cells = Array.from({ length: 9 }, (_, c) => ({ r, c }));
        const step = findNakedTripleInUnit(cells, `la ligne ${r + 1}`);
        if (step) return step;
    }
    // Colonnes
    for (let c = 0; c < 9; c++) {
        const cells = Array.from({ length: 9 }, (_, r) => ({ r, c }));
        const step = findNakedTripleInUnit(cells, `la colonne ${c + 1}`);
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
            const step = findNakedTripleInUnit(cells, `le bloc ${blockIndex + 1}`);
            if (step) return step;
        }
    }
    return null;
}

function applyNakedTripleStep(step) {
    const { digits, keeps, kills } = step;

    clearHighlights();

    // Met en avant les 3 cases du triplet
    keeps.forEach(({ r, c }) => {
        highlightCellStrong(r, c);
        digits.forEach(d => highlightCandidate(r, c, d, 'keep'));
    });

    // Retire {digits} des autres cases de l’unité
    kills.forEach(({ r, c, remove }) => {
        remove.forEach(d => highlightCandidate(r, c, d, 'kill'));
        candidates[r][c] = (candidates[r][c] || []).filter(x => !remove.includes(x));
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
