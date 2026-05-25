/*******************************************************
 * candidates.js — Gestion des candidats et du popover
 *******************************************************/

(function () {
    'use strict';

    let candidatesVisible = false;
    let valuesVisible = true;
    let currentPopoverCell = null;

    const SIZE = 9;
    const gridEl = document.getElementById('grid');
    const candPopover = document.getElementById('candPopover');
    const toggleCandidatesBtn = document.getElementById('toggleCandidatesBtn');
    const toggleValuesBtn = document.getElementById('toggleValuesBtn');

    /*******************************************************
     * EXTENSION DES FONCTIONS GLOBALES
     *******************************************************/

    // Sauvegarder les fonctions originales
    const _originalGetState = window.getState;
    const _originalSetState = window.setState;

    // Étendre getState pour inclure les candidats
    window.getState = function () {
        const state = _originalGetState();
        if (!gridEl || !gridEl.rows) return state;

        const candidates = Array.from({ length: SIZE }, () =>
            Array.from({ length: SIZE }, () => [])
        );

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const td = gridEl.rows[r].cells[c];
                const cands = td.dataset.candidates;
                candidates[r][c] = cands ? JSON.parse(cands) : [];
            }
        }

        state.candidates = candidates;
        return state;
    };

    // Étendre setState pour inclure les candidats
    window.setState = function (state) {
        _originalSetState(state);

        if (state.candidates && gridEl && gridEl.rows) {
            for (let r = 0; r < SIZE; r++) {
                for (let c = 0; c < SIZE; c++) {
                    const td = gridEl.rows[r].cells[c];
                    const cands = state.candidates[r][c] || [];
                    td.dataset.candidates = JSON.stringify(cands);
                }
            }
        }

        renderAllCells();
    };

    /*******************************************************
     * GÉNÉRATION ET NETTOYAGE DES CANDIDATS
     *******************************************************/

    function generateCandidates() {
        if (!gridEl || !gridEl.rows) return;

        const state = window.getState();
        const { values } = state;

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                if (values[r][c] !== 0) {
                    gridEl.rows[r].cells[c].dataset.candidates = '[]';
                    continue;
                }

                const possible = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

                // Éliminer les valeurs de la ligne
                for (let col = 0; col < SIZE; col++) {
                    if (values[r][col] !== 0) possible.delete(values[r][col]);
                }

                // Éliminer les valeurs de la colonne
                for (let row = 0; row < SIZE; row++) {
                    if (values[row][c] !== 0) possible.delete(values[row][c]);
                }

                // Éliminer les valeurs du bloc 3x3
                const br = Math.floor(r / 3) * 3;
                const bc = Math.floor(c / 3) * 3;
                for (let row = br; row < br + 3; row++) {
                    for (let col = bc; col < bc + 3; col++) {
                        if (values[row][col] !== 0) possible.delete(values[row][col]);
                    }
                }

                const td = gridEl.rows[r].cells[c];
                td.dataset.candidates = JSON.stringify(Array.from(possible).sort());
            }
        }

        renderAllCells();
    }

    // Nettoyer les candidats invalides
    window.sanitizeCandidates = function () {
        if (!gridEl || !gridEl.rows) return;

        const state = window.getState();
        const { values } = state;

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const td = gridEl.rows[r].cells[c];

                // Vider les candidats si une valeur est présente
                if (values[r][c] !== 0) {
                    td.dataset.candidates = '[]';
                    continue;
                }

                const cands = JSON.parse(td.dataset.candidates || '[]');
                const possible = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

                // Éliminer les valeurs impossibles
                for (let col = 0; col < SIZE; col++) {
                    if (values[r][col] !== 0) possible.delete(values[r][col]);
                }
                for (let row = 0; row < SIZE; row++) {
                    if (values[row][c] !== 0) possible.delete(values[row][c]);
                }
                const br = Math.floor(r / 3) * 3;
                const bc = Math.floor(c / 3) * 3;
                for (let row = br; row < br + 3; row++) {
                    for (let col = bc; col < bc + 3; col++) {
                        if (values[row][col] !== 0) possible.delete(values[row][col]);
                    }
                }

                // Filtrer les candidats actuels
                const validCands = cands.filter(n => possible.has(n));
                td.dataset.candidates = JSON.stringify(validCands);
            }
        }

        renderAllCells();
    };

    /*******************************************************
     * AFFICHAGE/MASQUAGE DES CANDIDATS ET VALEURS
     *******************************************************/

    if (toggleCandidatesBtn) {
        toggleCandidatesBtn.addEventListener('click', function () {
            candidatesVisible = !candidatesVisible;

            if (candidatesVisible) {
                // Générer les candidats s'ils n'existent pas
                const state = window.getState();
                const hasCandidates = state.candidates &&
                    state.candidates.some(row => row.some(cell => cell.length > 0));

                if (!hasCandidates) {
                    generateCandidates();
                }

                toggleCandidatesBtn.innerHTML = '<i data-lucide="grid-3x3"></i>Masquer candidats';
            } else {
                toggleCandidatesBtn.innerHTML = '<i data-lucide="grid-3x3"></i>Afficher candidats';
            }

            renderAllCells();
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        });
    }

    if (toggleValuesBtn) {
        toggleValuesBtn.addEventListener('click', function () {
            valuesVisible = !valuesVisible;

            if (valuesVisible) {
                toggleValuesBtn.innerHTML = '<i data-lucide="eye-off"></i>Masquer valeurs';
            } else {
                toggleValuesBtn.innerHTML = '<i data-lucide="eye"></i>Afficher valeurs';
            }

            renderAllCells();
            if (typeof lucide !== 'undefined' && lucide.createIcons) {
                lucide.createIcons();
            }
        });
    }

    /*******************************************************
     * POPOVER DE SÉLECTION DES CANDIDATS
     *******************************************************/

    if (candPopover) {
        const candGrid = candPopover.querySelector('.cand-grid');
        if (candGrid) {
            // Créer les boutons 1-9
            for (let i = 1; i <= 9; i++) {
                const btn = document.createElement('button');
                btn.className = 'btn xs cand-num';
                btn.textContent = i;
                btn.dataset.num = i;
                candGrid.appendChild(btn);
            }
        }

        // Gestion des clics dans le popover
        candPopover.addEventListener('click', function (e) {
            if (e.target.classList.contains('cand-num')) {
                e.target.classList.toggle('active');
            }

            // Bouton "Tout"
            if (e.target.dataset.action === 'all' || e.target.closest('[data-action="all"]')) {
                candPopover.querySelectorAll('.cand-num').forEach(btn => {
                    btn.classList.add('active');
                });
            }

            // Bouton "Aucun"
            if (e.target.dataset.action === 'none' || e.target.closest('[data-action="none"]')) {
                candPopover.querySelectorAll('.cand-num').forEach(btn => {
                    btn.classList.remove('active');
                });
            }

            // Bouton "OK"
            if (e.target.dataset.action === 'ok' || e.target.closest('[data-action="ok"]')) {
                applyPopoverCandidates();
                hidePopover();
            }
        });

        // Fermer le popover en cliquant en dehors
        document.addEventListener('click', function (e) {
            if (candPopover.getAttribute('aria-hidden') === 'false' &&
                !candPopover.contains(e.target) &&
                !e.target.closest('.sudoku-grid td')) {
                hidePopover();
            }
        });
    }

    function showPopover(td, r, c) {
        if (!candPopover) return;

        currentPopoverCell = { td, r, c };

        // Récupérer les candidats actuels
        const cands = JSON.parse(td.dataset.candidates || '[]');

        // Mettre à jour l'état des boutons
        candPopover.querySelectorAll('.cand-num').forEach(btn => {
            const num = Number(btn.dataset.num);
            btn.classList.toggle('active', cands.includes(num));
        });

        // Positionner le popover
        const rect = td.getBoundingClientRect();
        candPopover.style.left = rect.left + 'px';
        candPopover.style.top = (rect.bottom + 5) + 'px';
        candPopover.setAttribute('aria-hidden', 'false');
    }

    function hidePopover() {
        if (!candPopover) return;
        candPopover.setAttribute('aria-hidden', 'true');
        currentPopoverCell = null;
    }

    function applyPopoverCandidates() {
        if (!currentPopoverCell) return;

        const { td } = currentPopoverCell;
        const selected = [];

        candPopover.querySelectorAll('.cand-num.active').forEach(btn => {
            selected.push(Number(btn.dataset.num));
        });

        td.dataset.candidates = JSON.stringify(selected.sort());
        renderCell(td);
    }

    /*******************************************************
     * RENDU DES CELLULES
     *******************************************************/

    function renderCell(td) {
        if (!td) return;

        const input = td.querySelector('.cell-input');
        if (!input) return;

        const hasValue = input.value !== '';
        const cands = JSON.parse(td.dataset.candidates || '[]');

        // Retirer l'ancien affichage des candidats
        const oldCandDiv = td.querySelector('.cell-candidates');
        if (oldCandDiv) oldCandDiv.remove();

        // Afficher/masquer l'input selon valuesVisible
        input.style.display = valuesVisible ? '' : 'none';

        // Afficher les candidats si le mode est actif et qu'il n'y a pas de valeur
        if (candidatesVisible && !hasValue && cands.length > 0) {
            const candDiv = document.createElement('div');
            candDiv.className = 'cell-candidates';

            for (let i = 1; i <= 9; i++) {
                const span = document.createElement('span');
                span.textContent = cands.includes(i) ? i : '';
                span.className = 'cand-digit';
                if (cands.includes(i)) span.classList.add('active');
                candDiv.appendChild(span);
            }

            td.appendChild(candDiv);
        }
    }

    function renderAllCells() {
        if (!gridEl || !gridEl.rows) return;

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                renderCell(gridEl.rows[r].cells[c]);
            }
        }
    }

    // Ajouter le gestionnaire de clic droit sur les cellules
    if (gridEl) {
        gridEl.addEventListener('contextmenu', function (e) {
            const td = e.target.closest('td');
            if (!td) return;

            e.preventDefault();
            const input = td.querySelector('.cell-input');
            if (!input) return;

            const r = Number(input.dataset.r);
            const c = Number(input.dataset.c);
            showPopover(td, r, c);
        });
    }

    /*******************************************************
     * EXPORT DES FONCTIONS POUR LES AUTRES MODULES
     *******************************************************/

    window.SudokuUI = {
        renderCell,
        reRender: renderAllCells
    };

    /*******************************************************
     * GESTION DES HIGHLIGHTS (pour les techniques)
     *******************************************************/

    window.clearHighlights = function () {
        if (!gridEl || !gridEl.rows) return;

        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const td = gridEl.rows[r].cells[c];
                td.classList.remove('highlight', 'highlight-eliminate', 'highlight-place');
            }
        }
    };

    window.highlightCell = function (r, c, type = 'highlight') {
        if (!gridEl || !gridEl.rows) return;
        const td = gridEl.rows[r]?.cells[c];
        if (td) td.classList.add(type);
    };

    // Alias legacy utilises par plusieurs techniques historiques.
    window.highlightCellStrong = function (r, c) {
        window.highlightCell(r, c, 'highlight-place');
    };

    window.highlightCandidate = function (r, c, _digit, mode = 'keep') {
        if (mode === 'kill') {
            window.highlightCell(r, c, 'highlight-eliminate');
            return;
        }
        window.highlightCell(r, c, 'highlight');
    };

})();
