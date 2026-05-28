/*******************************************************
 * resolve.js — Orchestrateur central des techniques
 * Chaque technique est ajoutée via window.SudokuTechniqueRegistry
 *******************************************************/

// Registre global des techniques (chaque technique "push" un objet ici)
window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

// Ordre logique de résolution (hors AUTO)
const TECH_ORDER = () => {
    const orderedKeys = ['nakedSingle', 'hiddenSingle', 'nakedPair', 'hiddenPair', 'nakedTriple', 'hiddenTriple', 'pointing', 'boxline', 'uniqueRectangle', 'coloring', 'xwing', 'ywing', 'xywing', 'swordfish'];//, 'xyzwing', 'simpleColoring', 'forcingChains'];
    const availableTechs = window.SudokuTechniqueRegistry
        .filter(t => t.key !== 'auto')
        .map(t => t.key);

    // D'abord les techniques dans l'ordre spécifié
    const ordered = orderedKeys.filter(key => availableTechs.includes(key));
    // Puis les autres techniques éventuelles
    const remaining = availableTechs.filter(key => !orderedKeys.includes(key));

    return [...ordered, ...remaining];
};

// Historique des états pour l’undo
let stepHistory = [];
let explanationCursor = -1;

function getExplanationElements() {
    const explanationsDiv = document.getElementById('explanations');
    if (!explanationsDiv) return [];
    return Array.from(explanationsDiv.querySelectorAll('.explanation'));
}

function focusExplanation(index, { smooth = true } = {}) {
    const items = getExplanationElements();
    if (items.length === 0) {
        explanationCursor = -1;
        return;
    }

    const safeIndex = Math.max(0, Math.min(index, items.length - 1));
    explanationCursor = safeIndex;

    items.forEach((el, i) => {
        const isCurrent = i === safeIndex;
        el.classList.toggle('explanation-current', isCurrent);
        el.hidden = !isCurrent;
    });

    items[safeIndex].scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
}

function syncExplanationMenuButtons() {
    const prevBtn = document.getElementById('explanationsPrevBtn');
    const nextBtn = document.getElementById('explanationsNextBtn');
    const clearBtn = document.getElementById('explanationsClearBtn');
    const toolbarNextBtn = document.getElementById('nextStepBtn');
    const items = getExplanationElements();
    const hasItems = items.length > 0;

    if (!hasItems) {
        explanationCursor = -1;
    } else if (explanationCursor < 0 || explanationCursor >= items.length) {
        explanationCursor = 0;
    }

    if (prevBtn) prevBtn.disabled = stepHistory.length === 0;
    if (nextBtn) nextBtn.disabled = !!toolbarNextBtn?.disabled;
    if (clearBtn) clearBtn.disabled = !hasItems;
}

function markNewestExplanationAsCurrent() {
    focusExplanation(0, { smooth: false });
    syncExplanationMenuButtons();
}

function initExplanationMenu() {
    const prevBtn = document.getElementById('explanationsPrevBtn');
    const nextBtn = document.getElementById('explanationsNextBtn');
    const clearBtn = document.getElementById('explanationsClearBtn');
    const explanationsDiv = document.getElementById('explanations');

    if (!explanationsDiv) return;

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            const toolbarPrevBtn = document.getElementById('prevStepBtn');
            toolbarPrevBtn?.click();

            // Aligner le rendu visuel des explications avec l'action d'undo.
            const items = getExplanationElements();
            if (items.length > 0) {
                focusExplanation(Math.min(items.length - 1, explanationCursor + 1));
                syncExplanationMenuButtons();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const toolbarNextBtn = document.getElementById('nextStepBtn');
            toolbarNextBtn?.click();
            syncExplanationMenuButtons();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            explanationsDiv.innerHTML = '';
            explanationCursor = -1;
            syncExplanationMenuButtons();
            setStatus('Liste des explications effacée.', 'ok');
        });
    }

    syncExplanationMenuButtons();
}

function resetExplanationPanel() {
    const explanationsDiv = document.getElementById('explanations');
    if (explanationsDiv) {
        explanationsDiv.innerHTML = '';
    }
    explanationCursor = -1;
    stepHistory = [];
    clearHighlights();
    syncExplanationMenuButtons();
}

window.resetExplanationPanel = resetExplanationPanel;

function buildEmptyCandidates() {
    return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => []));
}

// Compat legacy: certaines techniques utilisent encore les globals `gridEl` et `candidates`.
function syncLegacyTechniqueGlobals() {
    const state = getState();
    window.gridEl = document.getElementById('grid');
    window.candidates = Array.isArray(state.candidates) ? state.candidates : buildEmptyCandidates();
}

function persistLegacyTechniqueCandidates() {
    if (!Array.isArray(window.candidates)) return;
    const state = getState();
    setState({
        values: state.values,
        givens: state.givens,
        candidates: window.candidates
    });
}

// Création d'une copie profonde de l'état courant
function getDeepState() {
    return structuredClone(getState());
}

// Restaure un état complet
function restoreDeepState(snapshot) {
    setState(snapshot); // déjà géré dans script.js
    updateConflicts();
    renderAllCells();
    clearHighlights();
    setStatus("État restauré (étape précédente).");
}

/*******************************************************
 * Peupler dynamiquement le select des techniques
 ******************************************************/
function populateTechniqueSelect() {
    const select = document.getElementById('techniqueSelect');
    if (!select) return;

    // On vide le select
    select.innerHTML = '';

    // Ajout d'abord de l'option AUTO
    const autoOpt = document.createElement('option');
    autoOpt.value = 'auto';
    autoOpt.textContent = 'Technique auto';
    select.appendChild(autoOpt);

    // Icônes par niveau de difficulté (meilleur support que la couleur CSS dans <option>)
    const DIFF_ICON = {
        basic: '🟢',
        intermediate: '🔵',
        advanced: '🟠',
        expert: '🔴'
    };

    // Puis toutes les autres techniques dans l'ordre de TECH_ORDER()
    const order = TECH_ORDER();
    const reg = window.SudokuTechniqueRegistry;

    // Préserver la sélection actuelle si existante
    const prev = select.getAttribute('data-selected') || select.value;

    order.forEach(key => {
        const tech = reg.find(t => t.key === key);
        if (!tech || tech.key === 'auto') return;
        const difficulty = TECHNIQUE_DIFFICULTY[tech.key] || 'basic';
        const icon = DIFF_ICON[difficulty] || '';
        const opt = document.createElement('option');
        opt.value = tech.key;
        opt.textContent = `${icon} ${tech.label}`;
        opt.dataset.difficulty = difficulty;
        select.appendChild(opt);
    });

    // Restaurer la sélection précédente si possible
    if (prev && Array.from(select.options).some(o => o.value === prev)) {
        select.value = prev;
    }
}

/*******************************************************
 * Trouver la prochaine étape
 ******************************************************/
function findNextStep() {
    // Nettoyer les candidats avant de chercher la prochaine étape
    cleanCandidates();
    syncLegacyTechniqueGlobals();

    const techChoice = document.getElementById('techniqueSelect')?.value || 'auto';

    const order = techChoice === 'auto' ? TECH_ORDER() : [techChoice];

    for (const key of order) {
        const tech = window.SudokuTechniqueRegistry.find(t => t.key === key);
        if (!tech || typeof tech.finder !== 'function') continue;

        const step = tech.finder();
        if (step) return { ...step, key }; // on ajoute la clé pour l'applier
    }

    return null;
}

/*******************************************************
 * Nettoyage des candidats
 ******************************************************/
function cleanCandidates() {
    if (typeof window.ensureCandidates === 'function') {
        window.ensureCandidates();
    }
    // Utilise la fonction sanitizeCandidates() définie dans script.js
    window.sanitizeCandidates();
    SudokuUI.reRender(); // Mise à jour de l'affichage
    setStatus('Candidats nettoyés et validés.', 'ok');
}

/*******************************************************
 * Appliquer une étape 
 ******************************************************/
function applyStep(step) {
    if (!step) {
        setStatus('Aucune étape disponible pour cette technique.', 'warn');
        return;
    }

    // Sauvegarde de l'état AVANT application
    stepHistory.push(getDeepState());
    syncExplanationMenuButtons();

    const tech = window.SudokuTechniqueRegistry.find(t => t.key === step.key);

    if (!tech || typeof tech.applier !== 'function') {
        setStatus(`Technique "${step.key}" non implémentée.`, 'err');
        return;
    }

    tech.applier(step); // application

    // Persist des modifications de candidats faites via globals legacy.
    persistLegacyTechniqueCandidates();

    // Nettoyer les candidats après chaque application
    cleanCandidates();
}


/*******************************************************
// Gestion des événements
 ******************************************************/
// Définition des niveaux de difficulté des techniques
const TECHNIQUE_DIFFICULTY = {
    nakedSingle: 'basic',
    hiddenSingle: 'basic',
    nakedPair: 'intermediate',
    hiddenPair: 'intermediate',
    nakedTriple: 'advanced',
    hiddenTriple: 'advanced',
    pointing: 'advanced',
    boxline: 'expert',
    uniqueRectangle: 'expert',
    coloring: 'advanced',
    xwing: 'expert',
    ywing: 'expert',
    swordfish: 'expert',
    xywing: 'expert'
};

const TECHNIQUE_DIFFICULTY_RANK = {
    basic: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4
};

const EXPERT_TECHNIQUES = new Set(['boxline', 'uniqueRectangle', 'xwing', 'ywing', 'swordfish', 'xywing']);
let techniqueDifficultyPreviewCacheKey = '';
let techniqueDifficultyPreviewCacheValue = null;

function buildTechniqueDifficultyCacheKey(state) {
    const values = state && Array.isArray(state.values) ? state.values : [];
    const givens = state && Array.isArray(state.givens) ? state.givens : [];
    if (!values.length || !givens.length) return '';

    const flatValues = [];
    const flatGivens = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            flatValues.push(String(Number((values[r] && values[r][c]) || 0)));
            flatGivens.push((givens[r] && givens[r][c]) ? '1' : '0');
        }
    }
    return flatValues.join('') + '|' + flatGivens.join('');
}

function sanitizeForSimulation() {
    if (typeof window.ensureCandidates === 'function') {
        window.ensureCandidates();
    }
    if (typeof window.sanitizeCandidates === 'function') {
        window.sanitizeCandidates();
    }
    syncLegacyTechniqueGlobals();
}

function findNextStepForSimulation(order) {
    sanitizeForSimulation();

    for (const key of order) {
        const tech = window.SudokuTechniqueRegistry.find(t => t.key === key);
        if (!tech || typeof tech.finder !== 'function') continue;

        try {
            const step = tech.finder();
            if (step) return { ...step, key };
        } catch (_) {
            // Ignore les erreurs ponctuelles d'une technique pendant la simulation.
        }
    }

    return null;
}

function applyStepForSimulation(step) {
    const tech = window.SudokuTechniqueRegistry.find(t => t.key === step.key);
    if (!tech || typeof tech.applier !== 'function') return false;

    try {
        tech.applier(step);
        persistLegacyTechniqueCandidates();
        sanitizeForSimulation();
        return true;
    } catch (_) {
        return false;
    }
}

function computeDifficultyScoreFromTechniqueStats(stats) {
    const count = (key) => Number(stats[key] || 0);
    const used = (key) => count(key) > 0;
    const usedExpertTechniques = Array.from(EXPERT_TECHNIQUES).filter(key => used(key)).length;

    if (usedExpertTechniques >= 3) return 10;
    if (used('coloring') || used('xwing')) return 9;
    if (used('pointing') && (used('boxline') || used('uniqueRectangle'))) return 8;
    if (used('hiddenTriple')) return 7;
    if (used('nakedTriple')) return 6;
    if (used('hiddenPair')) return 5;
    if (used('nakedPair') && !used('nakedSingle')) return 4;
    if (used('nakedPair')) return 3;
    if (used('hiddenSingle')) return 2;
    if (used('nakedSingle')) return 1;
    return 0;
}

function levelFromScore(score) {
    if (score <= 0) return 'basic';
    if (score <= 5) return 'basic';
    if (score <= 8) return 'advanced';
    return 'expert';
}

function findHardestUsedTechnique(stats) {
    const order = TECH_ORDER();
    const ranked = order.slice().sort((a, b) => {
        const da = TECHNIQUE_DIFFICULTY_RANK[TECHNIQUE_DIFFICULTY[a] || 'basic'] || 1;
        const db = TECHNIQUE_DIFFICULTY_RANK[TECHNIQUE_DIFFICULTY[b] || 'basic'] || 1;
        if (db !== da) return db - da;
        return order.indexOf(a) - order.indexOf(b);
    });

    return ranked.find(key => Number(stats[key] || 0) > 0) || null;
}

// Retourne une estimation basee sur une simulation complete de resolution.
// La grille visible est restauree a l'identique apres calcul.
function peekTechniqueDifficulty() {
    const stateSnapshot = getDeepState();
    const cacheKey = buildTechniqueDifficultyCacheKey(stateSnapshot);
    if (cacheKey && cacheKey === techniqueDifficultyPreviewCacheKey && techniqueDifficultyPreviewCacheValue) {
        return techniqueDifficultyPreviewCacheValue;
    }

    const order = TECH_ORDER();
    const stats = {};
    const maxSteps = 300;
    const prevCandidates = Array.isArray(window.candidates) ? structuredClone(window.candidates) : null;
    const prevStepHistory = stepHistory;
    const prevStatusText = document.getElementById('status')?.textContent || '';

    let score = 0;
    let solved = false;

    try {
        window.__sudokuDifficultySimulationInProgress = true;
        setState(structuredClone(stateSnapshot));
        stepHistory = [];
        clearHighlights();

        for (let i = 0; i < maxSteps; i++) {
            const step = findNextStepForSimulation(order);
            if (!step) break;

            stats[step.key] = (stats[step.key] || 0) + 1;

            const applied = applyStepForSimulation(step);
            if (!applied) break;
        }

        const endState = getState();
        const values = endState && Array.isArray(endState.values) ? endState.values : [];
        solved = values.length > 0 && values.every(row => Array.isArray(row) && row.every(v => Number(v) >= 1 && Number(v) <= 9));
        score = computeDifficultyScoreFromTechniqueStats(stats);
    } finally {
        setState(stateSnapshot);
        updateConflicts();
        renderAllCells();
        clearHighlights();
        stepHistory = prevStepHistory;
        if (prevCandidates) {
            window.candidates = prevCandidates;
        }
        if (typeof setStatus === 'function' && prevStatusText) {
            setStatus(prevStatusText);
        }
        window.__sudokuDifficultySimulationInProgress = false;
        syncExplanationMenuButtons();
    }

    const hardestKey = findHardestUsedTechnique(stats);
    const result = {
        key: hardestKey,
        level: levelFromScore(score),
        score,
        solved,
        stats
    };

    techniqueDifficultyPreviewCacheKey = cacheKey;
    techniqueDifficultyPreviewCacheValue = result;
    return result;
}

window.peekTechniqueDifficulty = peekTechniqueDifficulty;

function getTechniqueUsageReport() {
    const preview = peekTechniqueDifficulty();
    if (!preview) return null;

    const stats = preview.stats || {};
    const order = TECH_ORDER();
    const registry = window.SudokuTechniqueRegistry || [];

    const items = order
        .map((key) => {
            const count = Number(stats[key] || 0);
            if (count <= 0) return null;
            const tech = registry.find((t) => t.key === key);
            return {
                key,
                label: tech && tech.label ? tech.label : key,
                difficulty: TECHNIQUE_DIFFICULTY[key] || 'basic',
                count
            };
        })
        .filter(Boolean);

    const totalSteps = items.reduce((sum, item) => sum + Number(item.count || 0), 0);

    return {
        score: Number(preview.score || 0),
        level: preview.level || 'basic',
        solved: !!preview.solved,
        hardestKey: preview.key || null,
        totalSteps,
        items
    };
}

window.getTechniqueUsageReport = getTechniqueUsageReport;

// Transforme une URL YouTube (watch/shorts/youtu.be) en URL d'embed. Retourne '' si non supporté.
function toEmbedUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '');
        if (host === 'youtu.be') {
            const id = u.pathname.split('/').filter(Boolean)[0] || '';
            return id ? `https://www.youtube.com/embed/${id}` : '';
        }
        if (host === 'youtube.com' || host === 'm.youtube.com') {
            if (u.pathname.startsWith('/watch')) {
                const id = u.searchParams.get('v') || '';
                return id ? `https://www.youtube.com/embed/${id}` : '';
            }
            if (u.pathname.startsWith('/shorts/')) {
                const id = u.pathname.split('/')[2] || '';
                return id ? `https://www.youtube.com/embed/${id}` : '';
            }
        }
    } catch (_) { /* ignore */ }
    return '';
}

function displayExplanation(step) {
    if (!step) return;

    const explanationsDiv = document.getElementById('explanations');
    if (!explanationsDiv) return;

    // Trouver la technique utilisée
    const tech = window.SudokuTechniqueRegistry.find(t => t.key === step.key);
    if (!tech) return;

    // Déterminer la difficulté de la technique
    const difficulty = TECHNIQUE_DIFFICULTY[step.key] || 'basic';

    // Créer l'élément d'explication
    const explanation = document.createElement('div');
    explanation.className = 'explanation';
    explanation.innerHTML = `
        <h4 class="technique-name ${difficulty}">${tech.label}</h4>
        <p class="technique-desc">${step.explanation || 'Pas d\'explication disponible.'}</p>
    `;

    // Ajouter un lien et un embed vidéo si disponible (tech.video ou step.video)
    const videoUrl = step.video || tech.video;
    if (videoUrl) {
        const videoWrap = document.createElement('div');
        videoWrap.className = 'explanation-video';
        // const link = document.createElement('p');
        // link.innerHTML = `<a href="${videoUrl}" target="_blank" rel="noopener">Voir la vidéo</a>`;
        // videoWrap.appendChild(link);
        const embed = toEmbedUrl(videoUrl);
        if (embed) {
            const container = document.createElement('div');
            container.className = 'video-container';
            container.innerHTML = `<iframe src="${embed}" title="Tutoriel vidéo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
            videoWrap.appendChild(container);
        }
        explanation.appendChild(videoWrap);
    }

    // Ajouter la nouvelle explication au début
    explanation.style.animation = 'fadeIn 0.3s ease-out';
    explanationsDiv.insertBefore(explanation, explanationsDiv.firstChild);
    markNewestExplanationAsCurrent();
}

/*******************************************************
 * Afficher un indice (technique uniquement, explication repliée)
 ******************************************************/
function displayHint(step) {
    if (!step) {
        setStatus('Aucune technique trouvée pour un indice.', 'warn');
        return;
    }

    const explanationsDiv = document.getElementById('explanations');
    if (!explanationsDiv) return;

    // Trouver la technique utilisée
    const tech = window.SudokuTechniqueRegistry.find(t => t.key === step.key);
    if (!tech) return;

    // Déterminer la difficulté de la technique
    const difficulty = TECHNIQUE_DIFFICULTY[step.key] || 'basic';

    // Créer l'élément d'indice (technique visible, explication en <details>)
    const hint = document.createElement('div');
    hint.className = 'explanation';
    hint.innerHTML = `
        <h4 class="technique-name ${difficulty}">Indice : ${tech.label}</h4>
        <details>
            <summary>Voir l'explication</summary>
            <p class="technique-desc">${step.explanation || 'Pas d\'explication disponible.'}</p>
            <div class="hint-actions">
                <button type="button" class="btn apply-hint-btn">Appliquer</button>
            </div>
        </details>
    `;

    // Vidéo dans le <details> de l'indice s'il y en a une
    const vid2 = step.video || tech.video;
    if (vid2) {
        const detailsEl = hint.querySelector('details');
        if (detailsEl) {
            const videoWrap = document.createElement('div');
            videoWrap.className = 'explanation-video';
            // const link = document.createElement('p');
            // link.innerHTML = `<a href="${vid2}" target="_blank" rel="noopener">Voir la vidéo</a>`;
            // videoWrap.appendChild(link);
            const embed = toEmbedUrl(vid2);
            if (embed) {
                const container = document.createElement('div');
                container.className = 'video-container';
                container.innerHTML = `<iframe src="${embed}" title="Tutoriel vidéo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
                videoWrap.appendChild(container);
            }
            detailsEl.appendChild(videoWrap);
        }
    }

    hint.style.animation = 'fadeIn 0.3s ease-out';
    explanationsDiv.insertBefore(hint, explanationsDiv.firstChild);
    markNewestExplanationAsCurrent();

    const detailsEl = hint.querySelector('details');
    const techForPreview = window.SudokuTechniqueRegistry.find(t => t.key === step.key);

    // Affiche le meme surlignage que la resolution, sans modifier l'etat de la grille.
    const previewHintHighlights = () => {
        if (!detailsEl || !detailsEl.open || !techForPreview || typeof techForPreview.applier !== 'function') return;
        const snapshot = getDeepState();
        const prevStatus = document.getElementById('status')?.textContent || '';
        clearHighlights();
        try {
            techForPreview.applier(step);
        } catch (_) {
            clearHighlights();
        }
        setState(snapshot);
        updateConflicts();
        renderAllCells();
        if (Array.isArray(snapshot.candidates)) {
            window.candidates = structuredClone(snapshot.candidates);
        }
        if (typeof setStatus === 'function' && prevStatus) {
            setStatus(prevStatus);
        }
    };

    if (detailsEl) {
        detailsEl.addEventListener('toggle', () => {
            if (detailsEl.open) {
                previewHintHighlights();
                return;
            }
            clearHighlights();
        });
    }

    // Raccorder le bouton "Appliquer" pour exécuter l'étape proposée
    const applyBtn = hint.querySelector('.apply-hint-btn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            // Éviter les doubles clics
            applyBtn.disabled = true;
            applyBtn.textContent = 'Appliqué';

            // Refermer le détail et nettoyer les surlignages (optionnel)
            // const detailsEl = hint.querySelector('details');
            // if (detailsEl) detailsEl.open = false;
            clearHighlights();

            // Afficher l'explication détaillée puis appliquer l'étape
            // displayExplanation(step);
            applyStep(step);
        });
    }

    // Optionnel: journaliser
    setStatus(`Indice proposé: ${tech.label}`, 'ok');
}

document.getElementById('nextStepBtn')?.addEventListener('click', () => {
    if (typeof window.incrementDemandCounter === 'function') {
        window.incrementDemandCounter();
    }
    cleanCandidates();
    clearHighlights();
    const step = findNextStep();
    // console.log('Next step found:', step);
    displayExplanation(step);
    applyStep(step);
});

// Bouton Indice: suggère la technique sans appliquer l'étape
document.getElementById('hintBtn')?.addEventListener('click', () => {
    if (typeof window.incrementDemandCounter === 'function') {
        window.incrementDemandCounter();
    }
    // On ne touche pas aux surlignages pour garder le contexte courant
    const step = findNextStep();
    displayHint(step);
    // Pas d'application de l'étape ici
});

document.getElementById('clearHighlightsBtn')?.addEventListener('click', clearHighlights);

// Appeler le populate après que les fichiers techniques ont été chargés
window.addEventListener('DOMContentLoaded', () => {
    populateTechniqueSelect();
    initExplanationMenu();
    if (typeof window.invalidateDifficultyEstimate === 'function') {
        window.invalidateDifficultyEstimate();
    }
});

document.getElementById('prevStepBtn')?.addEventListener('click', () => {
    if (stepHistory.length === 0) {
        setStatus("Aucune étape précédente disponible.", "warn");
        syncExplanationMenuButtons();
        return;
    }
    const prev = stepHistory.pop();
    restoreDeepState(prev);
    syncExplanationMenuButtons();
});
