/*******************************************************
 * techniques/boxline.js — Box-Line Reduction (a.k.a Claiming)
 * Si un candidat apparaît dans une seule ligne/colonne à l'intérieur
 * d’un bloc, alors on peut le supprimer ailleurs dans ce bloc.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'boxline',
    label: 'Box-Line Reduction',
    finder: findBoxLineReductionStep,
    applier: applyBoxLineReductionStep
});

/*******************************************************
 * Détection Box-Line (Claiming)
 ******************************************************/
function findBoxLineReductionStep() {
    const { values } = getState();

    // === CAS 1 : Recherche par ligne ===
    for (let r = 0; r < 9; r++) {
        for (let n = 1; n <= 9; n++) {
            const positions = [];
            const blocks = new Set();

            for (let c = 0; c < 9; c++) {
                if (values[r][c] === 0 && candidates[r][c].includes(n)) {
                    positions.push({ r, c });
                    blocks.add(Math.floor(r / 3) * 3 + Math.floor(c / 3));
                }
            }

            if (positions.length >= 2 && blocks.size === 1) {
                const block = [...blocks][0];
                const br = Math.floor(block / 3) * 3;
                const bc = (block % 3) * 3;
                const kills = [];

                for (let rr = br; rr < br + 3; rr++) {
                    for (let cc = bc; cc < bc + 3; cc++) {
                        if (rr !== r && values[rr][cc] === 0 && candidates[rr][cc].includes(n)) {
                            kills.push({ r: rr, c: cc });
                        }
                    }
                }

                if (kills.length > 0) {
                    return {
                        technique: 'Box-Line',
                        orientation: 'ligne',
                        rowColIndex: r,
                        block,
                        n,
                        keeps: positions,
                        kills,
                        explanation: `Dans la ligne ${r + 1}, le candidat ${n} est confiné au bloc ${block + 1}, donc retiré ailleurs dans ce bloc.`
                    };
                }
            }
        }
    }

    // === CAS 2 : Recherche par colonne ===
    for (let c = 0; c < 9; c++) {
        for (let n = 1; n <= 9; n++) {
            const positions = [];
            const blocks = new Set();

            for (let r = 0; r < 9; r++) {
                if (values[r][c] === 0 && candidates[r][c].includes(n)) {
                    positions.push({ r, c });
                    blocks.add(Math.floor(r / 3) * 3 + Math.floor(c / 3));
                }
            }

            if (positions.length >= 2 && blocks.size === 1) {
                const block = [...blocks][0];
                const br = Math.floor(block / 3) * 3;
                const bc = (block % 3) * 3;
                const kills = [];

                for (let rr = br; rr < br + 3; rr++) {
                    for (let cc = bc; cc < bc + 3; cc++) {
                        if (cc !== c && values[rr][cc] === 0 && candidates[rr][cc].includes(n)) {
                            kills.push({ r: rr, c: cc });
                        }
                    }
                }

                if (kills.length > 0) {
                    return {
                        technique: 'Box-Line',
                        orientation: 'colonne',
                        rowColIndex: c,
                        block,
                        n,
                        keeps: positions,
                        kills,
                        explanation: `Dans la colonne ${c + 1}, le candidat ${n} est confiné au bloc ${block + 1}, donc retiré ailleurs dans ce bloc.`
                    };
                }
            }
        }
    }

    return null;
}

/*******************************************************
 * Application Box-Line
 ******************************************************/
function applyBoxLineReductionStep(step) {
    const { n, block, orientation, rowColIndex, keeps, kills } = step;

    clearHighlights();

    // Surbrillance du bloc
    const br = Math.floor(block / 3) * 3;
    const bc = (block % 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
            gridEl.rows[rr].cells[cc].classList.add('cell-highlight');
        }
    }

    // Surbrillance de la ligne ou colonne
    if (orientation === 'ligne') {
        for (let cc = 0; cc < 9; cc++) {
            gridEl.rows[rowColIndex].cells[cc].classList.add('col-highlight');
        }
    } else {
        for (let rr = 0; rr < 9; rr++) {
            gridEl.rows[rr].cells[rowColIndex].classList.add('col-highlight');
        }
    }

    // Candidats conservés (en vert)
    keeps.forEach(({ r, c }) => highlightCandidate(r, c, n, 'keep'));

    // Candidats supprimés
    kills.forEach(({ r, c }) => {
        highlightCandidate(r, c, n, 'kill');
        candidates[r][c] = candidates[r][c].filter(x => x !== n);
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
