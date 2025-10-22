const gridEl = document.getElementById('grid');
const givenModeEl = document.getElementById('givenMode');
const statusEl = document.getElementById('status');

// const jsonArea = document.getElementById('jsonArea');
// const importBtn = document.getElementById('importBtn');
const exampleBtn = document.getElementById('exampleBtn');
const downloadBtn = document.getElementById('downloadBtn');
const fileInput = document.getElementById('fileInput');

const clearValuesBtn = document.getElementById('clearValuesBtn');
const clearAllBtn = document.getElementById('clearAllBtn'); // a modifier en toogle
const toggleCandidatesBtn = document.getElementById('toggleCandidatesBtn');

const candPopover = document.getElementById('candPopover');

const SIZE = 9;

let showCandidates = true;
let candidates = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => [])
);
let popoverTarget = { r: null, c: null };

function buildGrid() {
    const tbody = document.createElement('tbody');
    for (let r = 0; r < SIZE; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < SIZE; c++) {
            const td = document.createElement('td');
            // input chiffre
            const input = document.createElement('input');
            input.type = 'text';
            input.inputMode = 'numeric';
            input.maxLength = 1;
            input.className = 'cell-input';
            input.dataset.r = r;
            input.dataset.c = c;

            input.addEventListener('beforeinput', e => {
                if (e.inputType === 'insertText') {
                    const ch = e.data;
                    if (!/[1-9]/.test(ch)) e.preventDefault();
                }
            });

            input.addEventListener('keydown', e => {
                const r = Number(input.dataset.r), c = Number(input.dataset.c);
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    input.value = '';
                    // on ne supprime pas automatiquement les candidats,
                    // mais c'est discutable; ici on les garde
                    e.preventDefault();
                    updateConflicts();
                    renderCell(r, c);
                    setStatus('Valeur effacée.');
                    return;
                }
                const nav = (nr, nc) => {
                    const next = document.querySelector(`input[data-r="${nr}"][data-c="${nc}"]`);
                    if (next) next.focus();
                };
                if (e.key === 'ArrowUp') { e.preventDefault(); nav(Math.max(0, r - 1), c); }
                if (e.key === 'ArrowDown') { e.preventDefault(); nav(Math.min(SIZE - 1, r + 1), c); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); nav(r, Math.max(0, c - 1)); }
                if (e.key === 'ArrowRight') { e.preventDefault(); nav(r, Math.min(SIZE - 1, c + 1)); }
                if (e.key === 'Escape') { hidePopover(); }
            });

            input.addEventListener('input', () => {
                input.value = input.value.replace(/[^1-9]/g, '').slice(0, 1);
                // Quand une valeur est saisie, on peut vider les candidats de la case
                if (input.value) candidates[r][c] = [];
                updateConflicts();
                renderCell(r, c);
            });

            // clic gauche sur la cellule
            td.addEventListener('click', (evt) => {
                // Si Mode Données activé, on toggle la classe 'given'
                if (givenModeEl && givenModeEl.checked) {
                    td.classList.toggle('given');
                    return;
                }

                // Sinon, on ouvre le popover de valeur à gauche de la cellule
                evt.preventDefault();
                openValuePopoverFor(r, c, td);
            });

            // clic droit → popover candidats
            td.addEventListener('contextmenu', (evt) => {
                evt.preventDefault();
                showCandidates = true; // si masqués, on force l’affichage pour éditer
                updateCandidatesVisibilityButton();
                const rect = td.getBoundingClientRect();
                openPopover(evt.clientX, evt.clientY, r, c);
            });

            // calque candidats
            const candLayer = document.createElement('div');
            candLayer.className = 'cell-candidates';
            // 9 emplacements
            for (let k = 1; k <= 9; k++) {
                const s = document.createElement('div');
                s.className = 'cand';
                s.dataset.k = k;
                s.textContent = ''; // remplie par renderCell
                candLayer.appendChild(s);
            }

            td.appendChild(input);
            td.appendChild(candLayer);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    gridEl.innerHTML = '';
    gridEl.appendChild(tbody);
}

function renderCell(r, c) {
    const td = gridEl.rows[r].cells[c];
    const input = td.querySelector('input');
    const layer = td.querySelector('.cell-candidates');

    // Affichage conditionnel des candidats
    layer.classList.toggle('hidden', !showCandidates || !!input.value);

    // effacer
    for (const el of layer.children) el.textContent = '';

    // injecter candidats présents
    const arr = candidates[r][c] || [];
    arr.forEach(n => {
        const slot = layer.querySelector(`.cand[data-k="${n}"]`);
        if (slot) {
            slot.textContent = String(n);
            slot.classList.toggle('invalid', !isValidCandidate(r, c, n));
        }
    });

}

function renderAllCells() {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) renderCell(r, c);
    }
}

function getState() {
    const values = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    const givens = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const td = gridEl.rows[r].cells[c];
            const input = td.querySelector('input');
            const v = Number(input.value || 0);
            values[r][c] = (v >= 1 && v <= 9) ? v : 0;
            givens[r][c] = td.classList.contains('given');
        }
    }
    // cloner les candidats (triés)
    const cand = candidates.map(row => row.map(arr =>
        Array.from(new Set(arr)).filter(n => n >= 1 && n <= 9).sort((a, b) => a - b)
    ));
    return { values, givens, candidates: cand };
}

function setState(state) {
    const { values, givens, candidates: cand } = state;
    if (!Array.isArray(values) || values.length !== SIZE) throw new Error('values doit être 9×9');
    if (!Array.isArray(givens) || givens.length !== SIZE) throw new Error('givens doit être 9×9');

    // valeurs + givens
    for (let r = 0; r < SIZE; r++) {
        if (!Array.isArray(values[r]) || values[r].length !== SIZE) throw new Error('values doit être 9×9');
        if (!Array.isArray(givens[r]) || givens[r].length !== SIZE) throw new Error('givens doit être 9×9');
        for (let c = 0; c < SIZE; c++) {
            const td = gridEl.rows[r].cells[c];
            const input = td.querySelector('input');
            const v = Number(values[r][c] || 0);
            input.value = (v >= 1 && v <= 9) ? String(v) : '';
            td.classList.toggle('given', !!givens[r][c]);
        }
    }

    // candidats (facultatif)
    if (cand) {
        if (!Array.isArray(cand) || cand.length !== SIZE) throw new Error('candidates doit être 9×9×(liste)');
        candidates = cand.map((row, r) => {
            if (!Array.isArray(row) || row.length !== SIZE) throw new Error('candidates doit être 9×9');
            return row.map((arr, c) => {
                if (!Array.isArray(arr)) return [];
                return Array.from(new Set(arr))
                    .filter(n => Number.isInteger(n) && n >= 1 && n <= 9)
                    .sort((a, b) => a - b);
            });
        });
    } else {
        // si pas fournis, on remet à vide
        candidates = Array.from({ length: SIZE }, () =>
            Array.from({ length: SIZE }, () => [])
        );
    }

    updateConflicts();
    renderAllCells();
}

function updateConflicts() {
    // Clear previous error states
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            gridEl.rows[r].cells[c].classList.remove('cell-error');
        }
    }
    const { values } = getState();

    const markDuplicates = (cells) => {
        const map = new Map();
        cells.forEach(({ r, c, v }) => {
            if (v === 0) return;
            if (!map.has(v)) map.set(v, []);
            map.get(v).push({ r, c });
        });
        map.forEach(list => {
            if (list.length > 1) {
                list.forEach(({ r, c }) => gridEl.rows[r].cells[c].classList.add('cell-error'));
            }
        });
    };

    // Rows
    for (let r = 0; r < SIZE; r++) {
        const row = [];
        for (let c = 0; c < SIZE; c++) row.push({ r, c, v: values[r][c] });
        markDuplicates(row);
    }
    // Cols
    for (let c = 0; c < SIZE; c++) {
        const col = [];
        for (let r = 0; r < SIZE; r++) col.push({ r, c, v: values[r][c] });
        markDuplicates(col);
    }
    // Blocks
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const blk = [];
            for (let r = br * 3; r < br * 3 + 3; r++) {
                for (let c = bc * 3; c < bc * 3 + 3; c++) {
                    blk.push({ r, c, v: values[r][c] });
                }
            }
            markDuplicates(blk);
        }
    }
}

function isValidCandidate(r, c, n) {
    const { values } = getState();

    // 1. Vérifie ligne
    for (let col = 0; col < SIZE; col++) {
        if (values[r][col] === n) return false;
    }

    // 2. Vérifie colonne
    for (let row = 0; row < SIZE; row++) {
        if (values[row][c] === n) return false;
    }

    // 3. Vérifie bloc
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++) {
        for (let cc = bc; cc < bc + 3; cc++) {
            if (values[rr][cc] === n) return false;
        }
    }

    return true;
}


function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (type || '');
}

// Export/Import
// function exportToTextarea() {
//     const state = getState();
//     jsonArea.value = JSON.stringify(state, null, 2);
//     setStatus('Exporté vers la zone JSON.', 'ok');
// }

// function importFromTextarea() {
//     try {
//         const obj = JSON.parse(jsonArea.value);
//         validateState(obj);
//         setState(obj);
//         setStatus('Import réussi depuis la zone JSON.', 'ok');
//     } catch (e) {
//         setStatus('Erreur d\'import : ' + e.message, 'err');
//     }
// }

function validateState(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Objet JSON invalide.');
    const { values, givens, candidates: cand } = obj;
    if (!Array.isArray(values) || values.length !== 9) throw new Error('"values" doit être un tableau 9×9.');
    if (!Array.isArray(givens) || givens.length !== 9) throw new Error('"givens" doit être un tableau 9×9.');
    for (let r = 0; r < 9; r++) {
        if (!Array.isArray(values[r]) || values[r].length !== 9) throw new Error('"values" doit être 9×9.');
        if (!Array.isArray(givens[r]) || givens[r].length !== 9) throw new Error('"givens" doit être 9×9.');
        for (let c = 0; c < 9; c++) {
            const v = Number(values[r][c]);
            if (!Number.isFinite(v) || v < 0 || v > 9) throw new Error(`Valeur hors plage à (${r + 1},${c + 1}).`);
            if (typeof givens[r][c] !== 'boolean') throw new Error(`Flag given invalide à (${r + 1},${c + 1}).`);
        }
    }
    if (cand !== undefined) {
        if (!Array.isArray(cand) || cand.length !== 9) throw new Error('"candidates" doit être 9×9×(liste).');
        for (let r = 0; r < 9; r++) {
            if (!Array.isArray(cand[r]) || cand[r].length !== 9) throw new Error('"candidates" doit être 9×9.');
            for (let c = 0; c < 9; c++) {
                if (!Array.isArray(cand[r][c])) throw new Error(`"candidates[${r}][${c}]" doit être une liste.`);
                for (const n of cand[r][c]) {
                    if (!Number.isInteger(n) || n < 1 || n > 9) throw new Error(`Candidat invalide ${n} à (${r + 1},${c + 1}).`);
                }
            }
        }
    }
}


// === Helpers de surlignage disponibles globalement ===
window.clearHighlights = function clearHighlights() {
    // cellules
    const tds = gridEl.querySelectorAll('td');
    tds.forEach(td => td.classList.remove('cell-highlight', 'cell-highlight-strong', 'row-highlight', 'col-highlight'));
    // candidats
    const cands = gridEl.querySelectorAll('.cand');
    cands.forEach(c => c.classList.remove('keep', 'kill'));
};

window.highlightCellStrong = function highlightCellStrong(r, c) {
    gridEl.rows[r].cells[c].classList.add('cell-highlight-strong');
};

window.highlightCandidate = function highlightCandidate(r, c, n, mode = 'keep') {
    const td = gridEl.rows[r].cells[c];
    const slot = td.querySelector(`.cand[data-k="${n}"]`);
    if (slot) slot.classList.add(mode === 'kill' ? 'kill' : 'keep');
};


// === Légalité d'un chiffre à (r,c) par rapport aux VALEURS ===
window.isLegalAt = function isLegalAt(r, c, n) {
    const { values } = getState();

    if (values[r][c] !== 0) return false;  // case déjà remplie

    // ligne
    for (let cc = 0; cc < 9; cc++) if (values[r][cc] === n) return false;
    // colonne
    for (let rr = 0; rr < 9; rr++) if (values[rr][c] === n) return false;
    // bloc
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++)
        for (let cc = bc; cc < bc + 3; cc++)
            if (values[rr][cc] === n) return false;

    return true;
};

// Retire un candidat d'une case
window.removeCandidate = function removeCandidate(r, c, n) {
    candidates[r][c] = (candidates[r][c] || []).filter(x => x !== n);
};

// Après avoir POSÉ une valeur à (r,c), propager les suppressions chez les pairs
window.propagateAfterSet = function propagateAfterSet(r, c, val) {
    // vider les candidats de la case posée
    candidates[r][c] = [];

    // ligne
    for (let cc = 0; cc < 9; cc++) removeCandidate(r, cc, val);
    // colonne
    for (let rr = 0; rr < 9; rr++) removeCandidate(rr, c, val);
    // bloc
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let rr = br; rr < br + 3; rr++)
        for (let cc = bc; cc < bc + 3; cc++)
            removeCandidate(rr, cc, val);
};

// Nettoie/recadre TOUS les candidats selon les valeurs courantes
window.sanitizeCandidates = function sanitizeCandidates() {
    const { values } = getState();
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (values[r][c] !== 0) {
                candidates[r][c] = []; // case remplie => aucun candidat
            } else {
                const uniq = Array.from(new Set(candidates[r][c] || []));
                candidates[r][c] = uniq.filter(n => n >= 1 && n <= 9 && isLegalAt(r, c, n))
                    .sort((a, b) => a - b);
            }
        }
    }
};


function downloadJSON() {
    const state = getState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sudoku.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus('Fichier sudoku.json téléchargé.', 'ok');
}

function importFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const obj = JSON.parse(reader.result);
            validateState(obj);
            setState(obj);
            // si la zone JSON existe, on la met à jour (optionnel)
            if (typeof jsonArea !== 'undefined' && jsonArea) jsonArea.value = JSON.stringify(obj, null, 2);

            // Vider les explications affichées
            const explanationsDiv = document.getElementById('explanations');
            if (explanationsDiv) explanationsDiv.innerHTML = '';

            // Mettre le bouton candidats en mode 'Afficher candidats' (candidats masqués)
            showCandidates = false;
            updateCandidatesVisibilityButton();

            setStatus('Import depuis fichier réussi.', 'ok');
        } catch (e) {
            setStatus('Erreur de parsing du fichier : ' + e.message, 'err');
        }
    };
    reader.onerror = () => setStatus('Impossible de lire le fichier.', 'err');
    reader.readAsText(file);
}

function clearValues() {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const td = gridEl.rows[r].cells[c];
            const input = td.querySelector('input');
            if (!td.classList.contains('given')) input.value = '';
        }
    }
    updateConflicts();
    renderAllCells();
    setStatus('Valeurs non « données » effacées.', 'ok');
}

function clearAll() {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const td = gridEl.rows[r].cells[c];
            const input = td.querySelector('input');
            input.value = '';
            td.classList.remove('given');
            candidates[r][c] = [];
        }
    }
    jsonArea.value = '';
    updateConflicts();
    renderAllCells();
    setStatus('Grille réinitialisée.', 'ok');
}

/* ====== POPUP CANDIDATS ====== */
function buildPopover() {
    const grid = candPopover.querySelector('.cand-grid');
    grid.innerHTML = '';
    for (let n = 1; n <= 9; n++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cand-btn';
        btn.textContent = String(n);
        btn.dataset.n = n;
        btn.addEventListener('click', () => {
            if (popoverTarget.r == null) return;
            toggleCandidate(popoverTarget.r, popoverTarget.c, n);
            // mettre à jour le style actif
            btn.classList.toggle('active', candidates[popoverTarget.r][popoverTarget.c].includes(n));
            renderCell(popoverTarget.r, popoverTarget.c);
        });
        grid.appendChild(btn);
    }

    candPopover.querySelector('[data-action="all"]').addEventListener('click', () => {
        if (popoverTarget.r == null) return;
        candidates[popoverTarget.r][popoverTarget.c] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        syncPopoverButtons();
        renderCell(popoverTarget.r, popoverTarget.c);
    });
    candPopover.querySelector('[data-action="none"]').addEventListener('click', () => {
        if (popoverTarget.r == null) return;
        candidates[popoverTarget.r][popoverTarget.c] = [];
        syncPopoverButtons();
        renderCell(popoverTarget.r, popoverTarget.c);
    });
    candPopover.querySelector('[data-action="ok"]').addEventListener('click', hidePopover);

    // fermer au clic extérieur
    document.addEventListener('mousedown', (e) => {
        if (candPopover.getAttribute('aria-hidden') === 'true') return;
        if (!candPopover.contains(e.target)) hidePopover();
    });
    // fermer sur Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hidePopover();
    });
}

/* ====== POPOVER VALEUR (clic gauche) ====== */
const valuePopoverId = 'valuePopover';
function buildValuePopover() {
    let el = document.getElementById(valuePopoverId);
    if (el) return;
    el = document.createElement('div');
    el.id = valuePopoverId;
    el.className = 'cand-popover';
    el.setAttribute('aria-hidden', 'true');
    el.style.width = '120px';

    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = 'repeat(3, 1fr)';
    wrap.style.gap = '6px';

    for (let n = 1; n <= 9; n++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cand-btn';
        btn.textContent = String(n);
        btn.dataset.n = n;
        btn.addEventListener('click', () => {
            // pose la valeur dans la cellule ciblée
            if (!valuePopoverTarget) return;
            const { r, c } = valuePopoverTarget;
            const td = gridEl.rows[r].cells[c];
            const input = td.querySelector('input');
            input.value = String(n);
            candidates[r][c] = [];
            renderCell(r, c);
            updateConflicts();
            hideValuePopover();
            setStatus('Valeur placée : ' + n, 'ok');
        });
        wrap.appendChild(btn);
    }

    // bouton 'clear'
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn xs';
    clearBtn.textContent = 'Effacer';
    clearBtn.addEventListener('click', () => {
        if (!valuePopoverTarget) return;
        const { r, c } = valuePopoverTarget;
        const td = gridEl.rows[r].cells[c];
        const input = td.querySelector('input');
        input.value = '';
        candidates[r][c] = [];
        renderCell(r, c);
        updateConflicts();
        hideValuePopover();
        setStatus('Valeur effacée.', 'ok');
    });

    el.appendChild(wrap);
    const footer = document.createElement('div');
    footer.style.marginTop = '8px';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'center';
    footer.appendChild(clearBtn);
    el.appendChild(footer);

    document.body.appendChild(el);
}

let valuePopoverTarget = null;
function openValuePopoverFor(r, c, td) {
    buildValuePopover();
    const el = document.getElementById(valuePopoverId);
    if (!el) return;
    valuePopoverTarget = { r, c };
    el.setAttribute('aria-hidden', 'false');
    // positionner à gauche de la cellule
    const rect = td.getBoundingClientRect();
    const popRect = el.getBoundingClientRect();
    let x = rect.left - popRect.width - 8;
    let y = rect.top;
    // si déborde à gauche, positionner à droite
    if (x < 8) x = rect.right + 8;
    // ajuster si dépasse verticalement
    const { innerHeight: h } = window;
    if (y + popRect.height > h - 8) y = h - popRect.height - 8;
    el.style.transform = `translate(${x}px, ${y}px)`;
}

function hideValuePopover() {
    const el = document.getElementById(valuePopoverId);
    if (!el) return;
    el.setAttribute('aria-hidden', 'true');
    el.style.transform = 'translate(-9999px, -9999px)';
    valuePopoverTarget = null;
}

// fermer value popover au clic extérieur
document.addEventListener('mousedown', (e) => {
    const el = document.getElementById(valuePopoverId);
    if (!el) return;
    if (el.getAttribute('aria-hidden') === 'true') return;
    if (!el.contains(e.target)) hideValuePopover();
});

function openPopover(clientX, clientY, r, c) {
    popoverTarget = { r, c };
    syncPopoverButtons();
    candPopover.setAttribute('aria-hidden', 'false');
    // positionner
    const { innerWidth: w, innerHeight: h } = window;
    const rect = candPopover.getBoundingClientRect();
    let x = clientX + 8;
    let y = clientY + 8;
    if (x + rect.width > w - 8) x = clientX - rect.width - 8;
    if (y + rect.height > h - 8) y = clientY - rect.height - 8;
    candPopover.style.transform = `translate(${x}px, ${y}px)`;
}

function hidePopover() {
    candPopover.setAttribute('aria-hidden', 'true');
    candPopover.style.transform = 'translate(-9999px, -9999px)';
    popoverTarget = { r: null, c: null };
}

function toggleCandidate(r, c, n) {
    const arr = candidates[r][c];
    const idx = arr.indexOf(n);
    if (idx === -1) arr.push(n);
    else arr.splice(idx, 1);
    arr.sort((a, b) => a - b);
}

function syncPopoverButtons() {
    const grid = candPopover.querySelector('.cand-grid');
    if (popoverTarget.r == null) return;
    const arr = candidates[popoverTarget.r][popoverTarget.c] || [];
    for (const btn of grid.querySelectorAll('.cand-btn')) {
        const n = Number(btn.dataset.n);
        btn.classList.toggle('active', arr.includes(n));
    }
}

/* ====== AFFICHAGE CANDIDATS ====== */
function updateCandidatesVisibilityButton() {
    const hasAnyCandidates = candidates.some(row => row.some(cell => cell.length > 0));
    if (!hasAnyCandidates) {
        toggleCandidatesBtn.textContent = 'candidats';
    }
    else if (!showCandidates) {
        toggleCandidatesBtn.textContent = 'Afficher candidats';
    } else if (!hasAnyCandidates) {
        toggleCandidatesBtn.textContent = 'Afficher candidats';
    } else {
        toggleCandidatesBtn.textContent = 'Masquer candidats';
    }
    renderAllCells();
}

/* ====== EXEMPLE ====== */
function loadExample() {
    const example = {
        values: [
            [0, 0, 0, 0, 0, 0, 6, 0, 8],
            [9, 3, 0, 2, 0, 0, 0, 0, 5],
            [0, 0, 0, 6, 0, 0, 0, 0, 3],
            [5, 7, 0, 0, 4, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 3, 0, 0],
            [0, 0, 0, 0, 8, 0, 0, 0, 1],
            [8, 0, 0, 0, 0, 3, 0, 0, 0],
            [0, 9, 0, 0, 0, 1, 8, 7, 6],
            [1, 0, 5, 0, 0, 0, 0, 0, 0]
        ],
        givens: Array.from({ length: 9 }, () => Array(9).fill(false)),
        candidates: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => []))
    };
    // On commence sans candidats pré-remplis
    setState(example);
    // jsonArea.value = JSON.stringify(example, null, 2);
    setStatus('Exemple chargé.', 'ok');
}

function fillAutoCandidates() {
    const { values } = getState();
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (values[r][c] === 0) {
                // Générer liste de candidats valides
                const newCands = [];
                for (let n = 1; n <= 9; n++) {
                    if (isValidCandidate(r, c, n)) newCands.push(n);
                }
                candidates[r][c] = newCands;
            }
        }
    }
    renderAllCells();
    setStatus('Candidats auto remplis.', 'ok');
}


/* ====== Events ====== */
// importBtn.addEventListener('click', importFromTextarea);
exampleBtn.addEventListener('click', loadExample);

downloadBtn.addEventListener('click', downloadJSON);
fileInput.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (file) importFromFile(file);
    fileInput.value = '';
});

clearValuesBtn.addEventListener('click', clearValues);

toggleCandidatesBtn.addEventListener('click', () => {
    const hasAnyCandidates = candidates.some(row => row.some(cell => cell.length > 0));

    if (!showCandidates) {
        // Si les candidats sont masqués, on les affiche
        showCandidates = true;
        if (!hasAnyCandidates) {
            // S'il n'y a pas de candidats, on les génère
            fillAutoCandidates();
        }
    } else if (!hasAnyCandidates) {
        // Si visibles mais pas de candidats, on les génère
        fillAutoCandidates();
    } else {
        // Si visibles avec candidats, on les masque
        showCandidates = false;
    }

    updateCandidatesVisibilityButton();
});



/* ====== SURBRILLANCE pour les explications ====== */
function clearHighlights() {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const td = gridEl.rows[r].cells[c];
            td.classList.remove('cell-highlight', 'cell-highlight-strong', 'row-highlight', 'col-highlight');
            // Nettoie les styles des candidats keep/kill de démo
            const layer = td.querySelector('.cell-candidates');
            if (!layer) continue;
            for (const el of layer.querySelectorAll('.cand')) {
                el.classList.remove('keep', 'kill');
            }
        }
    }
}

function markCells(cells = [], strong = false) {
    cells.forEach(({ r, c }) => {
        const td = gridEl.rows[r]?.cells[c];
        if (td) td.classList.add(strong ? 'cell-highlight-strong' : 'cell-highlight');
    });
}

function markRow(r) {
    if (r < 0 || r >= SIZE) return;
    for (let c = 0; c < SIZE; c++) gridEl.rows[r].cells[c].classList.add('row-highlight');
}

function markCol(c) {
    if (c < 0 || c >= SIZE) return;
    for (let r = 0; r < SIZE; r++) gridEl.rows[r].cells[c].classList.add('col-highlight');
}

function markCandidates(cands = [], mode = 'keep') {
    // cands: [{r,c,n}]
    cands.forEach(({ r, c, n }) => {
        const td = gridEl.rows[r]?.cells[c];
        if (!td) return;
        const layer = td.querySelector('.cell-candidates');
        if (!layer) return;
        const el = layer.querySelector(`.cand[data-k="${n}"]`);
        if (el) el.classList.add(mode === 'kill' ? 'kill' : 'keep');
    });
}

/* ====== Logging ====== */
const stepLogEl = document.getElementById('stepLog');
const clearLogBtn = document.getElementById('clearLogBtn');

function addLogEntry(message, details = null) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';

    const timestamp = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="log-time">${timestamp}</span> ${message}`;

    if (details) {
        const detailsEl = document.createElement('div');
        detailsEl.className = 'log-details';
        detailsEl.textContent = details;
        entry.appendChild(detailsEl);
    }

    stepLogEl.appendChild(entry);
    stepLogEl.scrollTop = stepLogEl.scrollHeight;
}

function clearLog() {
    stepLogEl.innerHTML = '';
    setStatus('Historique effacé.', 'ok');
}

clearLogBtn?.addEventListener('click', clearLog);

/* ====== API exposée au moteur de résolution ====== */
window.SudokuUI = {
    SIZE,
    // état et rendu
    getState,
    setState,
    reRender: () => { renderAllCells(); updateConflicts(); },
    renderCell,
    // logging
    log: addLogEntry,
    // candidats
    get candidates() { return candidates; },
    setCandidatesAt: (r, c, arr) => { candidates[r][c] = Array.from(new Set(arr)).sort((a, b) => a - b); renderCell(r, c); },
    addCandidate: (r, c, n) => { if (!candidates[r][c].includes(n)) { candidates[r][c].push(n); candidates[r][c].sort((a, b) => a - b); renderCell(r, c); } },
    removeCandidate: (r, c, n) => { const i = candidates[r][c].indexOf(n); if (i >= 0) { candidates[r][c].splice(i, 1); renderCell(r, c); } },
    // saisie d'une valeur
    setValue: (r, c, v) => {
        const td = gridEl.rows[r]?.cells[c];
        if (!td) return;
        const input = td.querySelector('input');
        input.value = v ? String(v) : '';
        if (v) candidates[r][c] = [];
        renderCell(r, c);
        updateConflicts();
    },
    // validation candidats (déjà dans script.js)
    isValidCandidate,
    // surlignage
    clearHighlights,
    markCells,
    markRow,
    markCol,
    markCandidates,
    // status
    setStatus,
};

// Boutons UI de résolution (écoutés par resolve.js)
document.getElementById('clearHighlightsBtn')?.addEventListener('click', () => {
    clearHighlights();
    SudokuUI.setStatus('Surlignage effacé.');
});


/* ====== Init ====== */
buildGrid();
buildPopover();
updateCandidatesVisibilityButton();
setStatus('Prêt — clic droit sur une case pour éditer les candidats. Active « Mode Données » pour marquer les cases données.');
renderAllCells();
