/*******************************************************
 * techniques/pointing.js — Pointing (Box-Line Interaction)
 * Si un candidat est limité à une seule ligne (ou colonne)
 * dans un bloc, il est interdit ailleurs dans cette ligne (ou colonne).
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'pointing',
    label: 'Pointing (Box-Line Interaction)',
    finder: findPointingStep,
    applier: applyPointingStep
});

/*******************************************************
 * Détection Pointing
 ******************************************************/
function findPointingStep() {
    const { values } = getState();

    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            // Cases d’un bloc 3×3
            const cells = [];
            for (let r = br * 3; r < br * 3 + 3; r++) {
                for (let c = bc * 3; c < bc * 3 + 3; c++) {
                    cells.push({ r, c });
                }
            }

            // Tester candidats 1..9
            for (let n = 1; n <= 9; n++) {
                const positions = cells.filter(({ r, c }) =>
                    values[r][c] === 0 && candidates[r][c].includes(n)
                );

                if (positions.length >= 2) {
                    const sameRow = positions.every(p => p.r === positions[0].r);
                    const sameCol = positions.every(p => p.c === positions[0].c);

                    if (sameRow || sameCol) {
                        const targetIndex = sameRow ? positions[0].r : positions[0].c;
                        const kills = [];

                        for (let i = 0; i < 9; i++) {
                            const rr = sameRow ? targetIndex : i;
                            const cc = sameCol ? targetIndex : i;

                            const inBlock =
                                rr >= br * 3 && rr < br * 3 + 3 &&
                                cc >= bc * 3 && cc < bc * 3 + 3;

                            if (!inBlock && values[rr][cc] === 0 && candidates[rr][cc].includes(n)) {
                                kills.push({ r: rr, c: cc });
                            }
                        }

                        if (kills.length > 0) {
                            return {
                                technique: 'Pointing',
                                n,
                                block: br * 3 + bc,
                                orientation: sameRow ? 'ligne' : 'colonne',
                                index: targetIndex,
                                keeps: positions,
                                kills,
                                explanation: `Dans le bloc ${br * 3 + bc + 1}, le candidat ${n} est confiné à la ${sameRow ? 'ligne' : 'colonne'} ${targetIndex + 1}, donc il est retiré ailleurs dans cette ${sameRow ? 'ligne' : 'colonne'}.`
                            };
                        }
                    }
                }
            }
        }
    }

    return null;
}

/*******************************************************
 * Application Pointing
 ******************************************************/
function applyPointingStep(step) {
    const { n, block, orientation, index, keeps, kills } = step;

    clearHighlights();

    // Surligner le bloc
    const br = Math.floor(block / 3) * 3;
    const bc = (block % 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
            gridEl.rows[rr].cells[cc].classList.add('cell-highlight');
        }
    }

    // Surligner la ligne ou la colonne
    if (orientation === 'ligne') {
        for (let cc = 0; cc < 9; cc++) {
            gridEl.rows[index].cells[cc].classList.add('col-highlight');
        }
    } else {
        for (let rr = 0; rr < 9; rr++) {
            gridEl.rows[rr].cells[index].classList.add('col-highlight');
        }
    }

    // Afficher les keep (cases du bloc où le candidat reste)
    keeps.forEach(({ r, c }) => highlightCandidate(r, c, n, 'keep'));

    // Afficher les kills (candidatures supprimées)
    kills.forEach(({ r, c }) => {
        highlightCandidate(r, c, n, 'kill');
        candidates[r][c] = candidates[r][c].filter(x => x !== n);
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
