/*******************************************************
 * techniques/uniqueRectangle.js — Unique Rectangle (UR Type 1)
 *
 * Si quatre cases formant un rectangle (2 lignes × 2 colonnes)
 * n'ont que les deux candidats {a,b}, et que l'une de ces cases
 * possède {a,b} + autres candidats, alors pour éviter une solution
 * multiple, on DOIT retirer a et b de cette case "extra".
 *
 * Implémentation: UR Type 1 uniquement (simple et sûr).
 *******************************************************/

window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

window.SudokuTechniqueRegistry.push({
    key: 'uniqueRectangle',
    label: 'Unique Rectangle',
    finder: findUniqueRectangleStep,
    applier: applyUniqueRectangleStep,
    video: 'https://youtube.com/shorts/Q02_fE37ZFs?si=rJbw2Yv_C2bPH0qb'
});

function blockIndexOf(r, c) {
    return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

function findUniqueRectangleStep() {
    const { values } = getState();

    // Parcours de toutes les paires de lignes
    for (let r1 = 0; r1 < 8; r1++) {
        for (let r2 = r1 + 1; r2 < 9; r2++) {
            // Paires de chiffres (a<b)
            for (let a = 1; a <= 8; a++) {
                for (let b = a + 1; b <= 9; b++) {
                    // Colonnes où (r1,c) et (r2,c) sont des sous-ensembles de {a,b}
                    const cols = [];
                    for (let c = 0; c < 9; c++) {
                        if (values[r1][c] !== 0 || values[r2][c] !== 0) continue;
                        const cand1 = (candidates[r1][c] || []);
                        const cand2 = (candidates[r2][c] || []);
                        const sub1 = cand1.every(x => [a, b].includes(x));
                        const sub2 = cand2.every(x => [a, b].includes(x));
                        const hasAB1 = cand1.includes(a) && cand1.includes(b);
                        const hasAB2 = cand2.includes(a) && cand2.includes(b);
                        // Chaque case doit être uniquement composée de {a,b} (UR pattern),
                        // ou contenir {a,b} parmi d'autres candidats (pour la case extra).
                        if ((sub1 || hasAB1) && (sub2 || hasAB2) && (cand1.length > 0) && (cand2.length > 0)) {
                            // On ne garde que les colonnes où les deux lignes ont {a,b} présents au moins.
                            if ((hasAB1 || sub1) && (hasAB2 || sub2)) cols.push(c);
                        }
                    }
                    if (cols.length < 2) continue;

                    // Choisir des paires de colonnes pour former le rectangle
                    for (let i = 0; i < cols.length - 1; i++) {
                        for (let j = i + 1; j < cols.length; j++) {
                            const c1 = cols[i], c2 = cols[j];
                            const cells = [
                                { r: r1, c: c1 }, { r: r1, c: c2 },
                                { r: r2, c: c1 }, { r: r2, c: c2 }
                            ];

                            // Optionnel: restreindre aux rectangles couvrant exactement 2 blocs (plus classique)
                            const blocks = new Set(cells.map(p => blockIndexOf(p.r, p.c)));
                            if (blocks.size !== 2) continue;

                            // Examiner les candidats dans ces 4 cases
                            const infos = cells.map(({ r, c }) => ({ r, c, cand: (candidates[r][c] || []).slice().sort((x, y) => x - y) }));

                            // Comptage des cases "pures" (= exactement {a,b}) et des cases "extra" (>2 candidats)
                            const pure = [];
                            const extras = [];
                            let okShape = true;
                            for (const info of infos) {
                                const hasA = info.cand.includes(a);
                                const hasB = info.cand.includes(b);
                                if (!hasA || !hasB) { okShape = false; break; }
                                if (info.cand.length === 2 && hasA && hasB) pure.push(info);
                                else if (info.cand.length > 2) extras.push(info);
                                else { okShape = false; break; }
                            }
                            if (!okShape) continue;

                            // === UR Type 4: 2 pures + 2 extras; pour l'un des chiffres {a,b}, les deux extras forment un lien fort dans une même maison →
                            // on retire l'autre chiffre des deux extras
                            if (pure.length === 2 && extras.length === 2) {
                                // Tente pour d = a puis d = b
                                for (const d of [a, b]) {
                                    const other = d === a ? b : a;
                                    const e0 = extras[0], e1 = extras[1];

                                    // Vérifie quelles maisons communes (ligne, colonne, bloc) contiennent un lien fort pour d
                                    const houses = [];
                                    // Ligne commune
                                    if (e0.r === e1.r) {
                                        const rr = e0.r;
                                        let cnt = 0; let hasBoth = true;
                                        for (let cc = 0; cc < 9; cc++) {
                                            if (values[rr][cc] !== 0) continue;
                                            const here = candidates[rr][cc] || [];
                                            if (here.includes(d)) cnt++;
                                        }
                                        // Les deux extras doivent contenir d
                                        hasBoth = e0.cand.includes(d) && e1.cand.includes(d);
                                        if (hasBoth && cnt === 2) houses.push({ kind: 'ligne', id: rr + 1 });
                                    }
                                    // Colonne commune
                                    if (e0.c === e1.c) {
                                        const cc = e0.c;
                                        let cnt = 0; let hasBoth = true;
                                        for (let rr = 0; rr < 9; rr++) {
                                            if (values[rr][cc] !== 0) continue;
                                            const here = candidates[rr][cc] || [];
                                            if (here.includes(d)) cnt++;
                                        }
                                        hasBoth = e0.cand.includes(d) && e1.cand.includes(d);
                                        if (hasBoth && cnt === 2) houses.push({ kind: 'colonne', id: cc + 1 });
                                    }
                                    // Bloc commun
                                    const blk0 = blockIndexOf(e0.r, e0.c), blk1 = blockIndexOf(e1.r, e1.c);
                                    if (blk0 === blk1) {
                                        const br0 = Math.floor(e0.r / 3) * 3, bc0 = Math.floor(e0.c / 3) * 3;
                                        let cnt = 0; let hasBoth = true;
                                        for (let rr = br0; rr < br0 + 3; rr++) {
                                            for (let cc = bc0; cc < bc0 + 3; cc++) {
                                                if (values[rr][cc] !== 0) continue;
                                                const here = candidates[rr][cc] || [];
                                                if (here.includes(d)) cnt++;
                                            }
                                        }
                                        hasBoth = e0.cand.includes(d) && e1.cand.includes(d);
                                        if (hasBoth && cnt === 2) houses.push({ kind: 'bloc', id: blk0 + 1 });
                                    }

                                    if (houses.length > 0) {
                                        // Lien fort trouvé: on retire 'other' des deux extras
                                        const removals = [];
                                        if ((candidates[e0.r][e0.c] || []).includes(other)) removals.push({ r: e0.r, c: e0.c, remove: [other] });
                                        if ((candidates[e1.r][e1.c] || []).includes(other)) removals.push({ r: e1.r, c: e1.c, remove: [other] });
                                        if (removals.length) {
                                            const rect = cells;
                                            const h = houses[0];
                                            return {
                                                technique: 'Unique Rectangle',
                                                type: 'UR4',
                                                digits: [a, b],
                                                rect,
                                                pair: extras.map(e => ({ r: e.r, c: e.c })),
                                                kills: removals,
                                                explanation: `Unique Rectangle (type 4) avec {${a},${b}}: les deux cases extra forment un lien fort sur ${d} dans la ${h.kind} ${h.id} → on retire ${other} de ces deux cases.`,
                                                video: 'https://youtube.com/shorts/stXyr94FkUE?si=9XD8wllNFfAaxyCk'
                                            };
                                        }
                                    }
                                }
                            }

                            // === UR Type 2: 2 pures + 2 extras dans la même ligne ou colonne, partageant des candidats communs (hors {a,b})
                            if (pure.length === 2 && extras.length === 2) {
                                const sameRow = extras[0].r === extras[1].r;
                                const sameCol = extras[0].c === extras[1].c;
                                if (sameRow || sameCol) {
                                    // Candidats communs aux deux extras, en enlevant {a,b}
                                    const extraSet1 = new Set(extras[0].cand.filter(x => x !== a && x !== b));
                                    const common = extras[1].cand.filter(x => x !== a && x !== b && extraSet1.has(x));
                                    if (common.length > 0) {
                                        const killsMap = new Map(); // key r,c -> Set to remove
                                        if (sameRow) {
                                            const rr = extras[0].r;
                                            const blockedCols = new Set([extras[0].c, extras[1].c]);
                                            for (let cc = 0; cc < 9; cc++) {
                                                if (blockedCols.has(cc)) continue;
                                                if (values[rr][cc] !== 0) continue;
                                                const here = candidates[rr][cc] || [];
                                                const rem = common.filter(x => here.includes(x));
                                                if (rem.length) {
                                                    killsMap.set(`${rr},${cc}`, new Set(rem));
                                                }
                                            }
                                        } else if (sameCol) {
                                            const cc = extras[0].c;
                                            const blockedRows = new Set([extras[0].r, extras[1].r]);
                                            for (let rr = 0; rr < 9; rr++) {
                                                if (blockedRows.has(rr)) continue;
                                                if (values[rr][cc] !== 0) continue;
                                                const here = candidates[rr][cc] || [];
                                                const rem = common.filter(x => here.includes(x));
                                                if (rem.length) {
                                                    killsMap.set(`${rr},${cc}`, new Set(rem));
                                                }
                                            }
                                        }

                                        const kills = Array.from(killsMap.entries()).map(([k, set]) => {
                                            const [r, c] = k.split(',').map(Number);
                                            return { r, c, remove: Array.from(set).sort((x, y) => x - y) };
                                        });

                                        if (kills.length) {
                                            const rect = cells;
                                            const houseLabel = sameRow ? `ligne ${extras[0].r + 1}` : `colonne ${extras[0].c + 1}`;
                                            const commonStr = `{${common.join(',')}}`;
                                            return {
                                                technique: 'Unique Rectangle',
                                                type: 'UR2',
                                                digits: [a, b],
                                                rect,
                                                pair: extras.map(e => ({ r: e.r, c: e.c })),
                                                kills,
                                                explanation: `Unique Rectangle (type 2) sur lignes ${r1 + 1}/${r2 + 1} et colonnes ${c1 + 1}/${c2 + 1} avec {${a},${b}} → les deux cases extra en ${houseLabel} partagent ${commonStr}, donc ${commonStr} est confiné à ces deux cases et on le retire des autres cases de la ${houseLabel}.`,
                                                video: 'https://youtube.com/shorts/aHpFde9roIE?si=NgI2EmSLka2pIL1W'
                                            };
                                        }
                                    }
                                }
                            }

                            // === UR Type 3: 2 pures + (au moins) 1 extra avec lien fort (row/col/bloc) sur un candidat x (≠ a,b)
                            if (pure.length === 2 && extras.length >= 1) {
                                for (const ex of extras) {
                                    const extraDigits = ex.cand.filter(x => x !== a && x !== b);
                                    if (extraDigits.length === 0) continue;

                                    const r = ex.r, c = ex.c;
                                    // Cherche un lien fort sur x dans la ligne, colonne ou bloc
                                    const houses = [];
                                    for (const x of extraDigits) {
                                        // Ligne
                                        let cnt = 0; let includesSelf = false;
                                        for (let cc = 0; cc < 9; cc++) {
                                            if (values[r][cc] !== 0) continue;
                                            const here = candidates[r][cc] || [];
                                            if (here.includes(x)) { cnt++; if (cc === c) includesSelf = true; }
                                        }
                                        if (includesSelf && cnt === 2) { houses.push({ kind: 'ligne', id: r + 1, x }); break; }

                                        // Colonne
                                        cnt = 0; includesSelf = false;
                                        for (let rr = 0; rr < 9; rr++) {
                                            if (values[rr][c] !== 0) continue;
                                            const here = candidates[rr][c] || [];
                                            if (here.includes(x)) { cnt++; if (rr === r) includesSelf = true; }
                                        }
                                        if (includesSelf && cnt === 2) { houses.push({ kind: 'colonne', id: c + 1, x }); break; }

                                        // Bloc
                                        const br0 = Math.floor(r / 3) * 3, bc0 = Math.floor(c / 3) * 3;
                                        cnt = 0; includesSelf = false;
                                        for (let rr = br0; rr < br0 + 3; rr++) {
                                            for (let cc = bc0; cc < bc0 + 3; cc++) {
                                                if (values[rr][cc] !== 0) continue;
                                                const here = candidates[rr][cc] || [];
                                                if (here.includes(x)) { cnt++; if (rr === r && cc === c) includesSelf = true; }
                                            }
                                        }
                                        if (includesSelf && cnt === 2) {
                                            const blkId = Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
                                            houses.push({ kind: 'bloc', id: blkId, x });
                                            break;
                                        }
                                    }

                                    if (houses.length > 0) {
                                        // On peut retirer {a,b} de cette case extra
                                        const removeAB = [a, b].filter(d => (candidates[r][c] || []).includes(d));
                                        if (removeAB.length) {
                                            const rect = cells;
                                            const h = houses[0];
                                            return {
                                                technique: 'Unique Rectangle',
                                                type: 'UR3',
                                                digits: [a, b],
                                                rect,
                                                target: { r, c },
                                                kills: [{ r, c, remove: removeAB }],
                                                explanation: `Unique Rectangle (type 3) avec {${a},${b}} → à (${r + 1},${c + 1}), le candidat ${h.x} a un lien fort dans la ${h.kind} ${h.id}; pour éviter une solution multiple, on enlève {${a},${b}} de cette case (forçant ${h.x}).`,
                                                video: 'https://youtube.com/shorts/RTxhN63e8YA?si=aDMpOkYnPW4KNwRo'
                                            };
                                        }
                                    }
                                }
                            }

                            // === UR Type 1: 3 pures + 1 extra → retirer {a,b} de la case extra
                            if (pure.length === 3 && extras.length === 1) {
                                const extra = extras[0];
                                const kills = [{ r: extra.r, c: extra.c, remove: [a, b] }];
                                const canRemove = kills[0].remove.some(d => (candidates[extra.r][extra.c] || []).includes(d));
                                if (!canRemove) continue;

                                const rect = cells;
                                return {
                                    technique: 'Unique Rectangle',
                                    type: 'UR1',
                                    digits: [a, b],
                                    rect,
                                    target: { r: extra.r, c: extra.c },
                                    kills,
                                    explanation: `Unique Rectangle (type 1) sur les lignes ${r1 + 1}/${r2 + 1} et colonnes ${c1 + 1}/${c2 + 1} avec {${a},${b}} → on retire {${a},${b}} de (${extra.r + 1},${extra.c + 1}) pour éviter une solution multiple.`
                                };
                            }
                        }
                    }
                }
            }
        }
    }

    return null;
}

function applyUniqueRectangleStep(step) {
    const { digits, rect, target, kills } = step;

    clearHighlights();

    // Surligner les 4 cases du rectangle
    rect.forEach(({ r, c }) => highlightCellStrong(r, c));

    // Mettre en avant {a,b} dans les 4 cases (keep)
    rect.forEach(({ r, c }) => digits.forEach(d => highlightCandidate(r, c, d, 'keep')));

    // Retirer {a,b} de la case extra
    kills.forEach(({ r, c, remove }) => {
        remove.forEach(d => highlightCandidate(r, c, d, 'kill'));
        candidates[r][c] = (candidates[r][c] || []).filter(x => !remove.includes(x));
    });

    updateConflicts();
    renderAllCells();

    setStatus(step.explanation, 'ok');
}
