/*******************************************************
 * techniques/coloring.js — Simple Coloring (Type 1 & 2)
 *
 * Principe:
 *  - Pour un chiffre n, on construit un graphe de liens forts (unités où n apparaît exactement 2 fois),
 *    et on 2-colorie chaque composant (couleurs A/B) en alternant via les liens forts.
 *  - Type 1: si deux cases de même couleur se voient (même ligne/colonne/bloc), alors cette couleur est impossible
 *    → on supprime n de toutes les cases de cette couleur dans le composant.
 *  - Type 2: si une case (non colorée) voit au moins une case de la couleur A et une case de la couleur B,
 *    alors n est impossible dans cette case (piège de couleur) → on retire n de cette case.
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'coloring',
    label: 'Coloring',
    finder: findColoringStep,
    applier: applyColoringStep
});

function sameBlock(r1, c1, r2, c2) {
    return Math.floor(r1 / 3) === Math.floor(r2 / 3) && Math.floor(c1 / 3) === Math.floor(c2 / 3);
}

function arePeers(a, b) {
    return a.r === b.r || a.c === b.c || sameBlock(a.r, a.c, b.r, b.c);
}

// Construit le graphe des liens forts pour le candidat n
function buildStrongLinkGraph(n, values, candidates) {
    // nodes: toutes les cases contenant n
    const nodes = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (values[r][c] === 0) {
                const arr = candidates[r][c] || [];
                if (arr.includes(n)) nodes.push({ r, c });
            }
        }
    }
    const key = (p) => `${p.r},${p.c}`;
    const adj = new Map();
    nodes.forEach(p => adj.set(key(p), []));

    // Lignes
    for (let r = 0; r < 9; r++) {
        const pos = [];
        for (let c = 0; c < 9; c++) if ((candidates[r][c] || []).includes(n) && values[r][c] === 0) pos.push({ r, c });
        if (pos.length === 2) {
            const a = key(pos[0]), b = key(pos[1]);
            adj.get(a).push(pos[1]);
            adj.get(b).push(pos[0]);
        }
    }
    // Colonnes
    for (let c = 0; c < 9; c++) {
        const pos = [];
        for (let r = 0; r < 9; r++) if ((candidates[r][c] || []).includes(n) && values[r][c] === 0) pos.push({ r, c });
        if (pos.length === 2) {
            const a = key(pos[0]), b = key(pos[1]);
            adj.get(a).push(pos[1]);
            adj.get(b).push(pos[0]);
        }
    }
    // Blocs
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const pos = [];
            for (let r = br * 3; r < br * 3 + 3; r++) {
                for (let c = bc * 3; c < bc * 3 + 3; c++) {
                    if ((candidates[r][c] || []).includes(n) && values[r][c] === 0) pos.push({ r, c });
                }
            }
            if (pos.length === 2) {
                const a = key(pos[0]), b = key(pos[1]);
                adj.get(a).push(pos[1]);
                adj.get(b).push(pos[0]);
            }
        }
    }

    return { nodes, adj, key };
}

function twoColorComponents(graph) {
    const { nodes, adj, key } = graph;
    const colorMap = new Map(); // key -> 0/1
    const comps = []; // { A:[], B:[], keys:Set }

    for (const p of nodes) {
        const k = key(p);
        if (colorMap.has(k)) continue;
        // BFS
        const queue = [{ p, color: 0 }];
        colorMap.set(k, 0);
        const compA = [], compB = [];
        const keySet = new Set();
        while (queue.length) {
            const { p: cur, color } = queue.shift();
            keySet.add(key(cur));
            if (color === 0) compA.push(cur); else compB.push(cur);
            for (const nb of adj.get(key(cur)) || []) {
                const nk = key(nb);
                if (!colorMap.has(nk)) {
                    colorMap.set(nk, 1 - color);
                    queue.push({ p: nb, color: 1 - color });
                }
            }
        }
        comps.push({ A: compA, B: compB, keySet, colorMap });
    }
    return comps;
}

function findColoringStep() {
    const { values } = getState();

    for (let n = 1; n <= 9; n++) {
        const graph = buildStrongLinkGraph(n, values, candidates);
        if (graph.nodes.length === 0) continue;
        const comps = twoColorComponents(graph);

        for (const comp of comps) {
            const A = comp.A, B = comp.B;
            if (A.length + B.length < 2) continue;

            // Type 1: une collision de même couleur (deux cases se voient) => éliminer toute cette couleur
            const hasConflict = (list) => {
                for (let i = 0; i < list.length; i++) {
                    for (let j = i + 1; j < list.length; j++) {
                        if (arePeers(list[i], list[j])) return true;
                    }
                }
                return false;
            };

            if (hasConflict(A) || hasConflict(B)) {
                const bad = hasConflict(A) ? A : B; // couleur invalide
                const kills = bad.map(({ r, c }) => ({ r, c, remove: [n] }));
                return {
                    technique: 'Coloring',
                    type: 'Simple Coloring (Type 1)',
                    digit: n,
                    coloredA: A,
                    coloredB: B,
                    kills,
                    explanation: `Coloring sur ${n} : deux cases de même couleur se voient ⇒ cette couleur est fausse → on retire ${n} de toutes les cases de cette couleur.`
                };
            }

            // Type 2: une case externe voit une case A et une case B ⇒ elle ne peut pas être n
            // Chercher toutes les cases avec candidat n hors composant
            const compSet = new Set([...A, ...B].map(p => `${p.r},${p.c}`));
            const kills2 = [];
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (values[r][c] !== 0) continue;
                    const arr = candidates[r][c] || [];
                    if (!arr.includes(n)) continue;
                    if (compSet.has(`${r},${c}`)) continue;
                    let seesA = false, seesB = false;
                    for (const p of A) { if (arePeers({ r, c }, p)) { seesA = true; break; } }
                    for (const p of B) { if (arePeers({ r, c }, p)) { seesB = true; break; } }
                    if (seesA && seesB) {
                        kills2.push({ r, c, remove: [n] });
                    }
                }
            }
            if (kills2.length) {
                return {
                    technique: 'Coloring',
                    type: 'Simple Coloring (Type 2)',
                    digit: n,
                    coloredA: A,
                    coloredB: B,
                    kills: kills2,
                    explanation: `Coloring sur ${n} : certaines cases voient une case de chaque couleur (A et B) ⇒ ${n} impossible dans ces cases.`
                };
            }
        }
    }

    return null;
}

function applyColoringStep(step) {
    const { digit, coloredA = [], coloredB = [], kills = [] } = step;
    clearHighlights();

    // Mettre en évidence les candidats colorés (les deux couleurs en keep faute de style distinct)
    coloredA.forEach(({ r, c }) => highlightCandidate(r, c, digit, 'keep'));
    coloredB.forEach(({ r, c }) => highlightCandidate(r, c, digit, 'keep'));

    // Appliquer les suppressions
    kills.forEach(({ r, c, remove }) => {
        remove.forEach(n => highlightCandidate(r, c, n, 'kill'));
        candidates[r][c] = (candidates[r][c] || []).filter(x => !remove.includes(x));
    });

    updateConflicts();
    renderAllCells();
    setStatus(step.explanation || 'Coloring appliqué.', 'ok');
}
