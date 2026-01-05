document.addEventListener('DOMContentLoaded', function () {
    const grid = document.getElementById('grid');
    const downloadBtn = document.getElementById('downloadBtn');
    const fileInput = document.getElementById('fileInput');
    const exampleBtn = document.getElementById('exampleBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');

    // Créer la grille 9x9 (version table compatible avec index.php)
    function createGrid() {
        if (!grid) return;

        // Si la grille est déjà créée, ne rien faire
        if (grid.rows && grid.rows.length > 0) return;

        const tbody = document.createElement('tbody');
        for (let r = 0; r < 9; r++) {
            const tr = document.createElement('tr');
            for (let c = 0; c < 9; c++) {
                const td = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'numeric';
                input.maxLength = 1;
                input.className = 'cell-input';
                input.dataset.r = r;
                input.dataset.c = c;

                input.addEventListener('input', function (e) {
                    e.target.value = e.target.value.replace(/[^1-9]/g, '').slice(0, 1);
                });

                td.appendChild(input);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        grid.appendChild(tbody);
    }

    // Obtenir les valeurs de la grille
    function getGridValues() {
        if (!grid || !grid.rows) return Array(9).fill(0).map(() => Array(9).fill(0));

        const values = [];
        for (let i = 0; i < 9; i++) {
            const row = [];
            for (let j = 0; j < 9; j++) {
                const input = grid.rows[i]?.cells[j]?.querySelector('input');
                const value = input ? input.value : '';
                row.push(value === '' ? 0 : parseInt(value));
            }
            values.push(row);
        }
        return values;
    }

    // Définir les valeurs de la grille
    function setGridValues(values) {
        if (!grid || !grid.rows) return;

        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const input = grid.rows[i]?.cells[j]?.querySelector('input');
                if (input) {
                    const value = values[i][j];
                    input.value = value === 0 ? '' : value;
                }
            }
        }
    }

    // Exporter/Télécharger la grille
    if (downloadBtn) {
        downloadBtn.addEventListener('click', function () {
            const values = getGridValues();
            const data = JSON.stringify({ values, givens: Array(9).fill(0).map(() => Array(9).fill(false)) }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sudoku.json';
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // Importer la grille
    if (fileInput) {
        fileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    try {
                        const data = JSON.parse(e.target.result);
                        const values = data.values || data;
                        if (Array.isArray(values) && values.length === 9 &&
                            values.every(row => Array.isArray(row) && row.length === 9)) {
                            setGridValues(values);
                        } else {
                            alert('Format de fichier invalide');
                        }
                    } catch (error) {
                        alert('Erreur lors de la lecture du fichier');
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    // Charger un exemple
    if (exampleBtn) {
        exampleBtn.addEventListener('click', function () {
            const example = [
                [0, 0, 9, 0, 0, 0, 0, 8, 0],
                [0, 0, 0, 0, 5, 0, 0, 2, 0],
                [8, 0, 0, 0, 0, 3, 7, 6, 0],
                [5, 0, 0, 4, 1, 0, 0, 3, 7],
                [0, 4, 7, 0, 0, 6, 6, 1, 0],
                [0, 0, 7, 0, 0, 0, 0, 4, 8],
                [3, 0, 0, 5, 4, 1, 3, 7, 2],
                [3, 2, 1, 9, 6, 7, 8, 5, 4],
                [4, 7, 5, 3, 3, 0, 1, 9, 6]
            ];
            setGridValues(example);
        });
    }

    // Effacer la grille
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function () {
            if (!grid || !grid.rows) return;

            for (let i = 0; i < 9; i++) {
                for (let j = 0; j < 9; j++) {
                    const td = grid.rows[i]?.cells[j];
                    const input = td?.querySelector('input');
                    if (input) {
                        input.value = '';
                    }
                    if (td) {
                        td.classList.remove('given');
                    }
                }
            }
        });
    }

    // Initialiser la grille si elle n'existe pas
    createGrid();
});