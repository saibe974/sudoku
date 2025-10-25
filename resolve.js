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

    const tech = window.SudokuTechniqueRegistry.find(t => t.key === step.key);

    if (!tech || typeof tech.applier !== 'function') {
        setStatus(`Technique "${step.key}" non implémentée.`, 'err');
        return;
    }

    tech.applier(step); // application

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
    cleanCandidates();
    clearHighlights();
    const step = findNextStep();
    // console.log('Next step found:', step);
    displayExplanation(step);
    applyStep(step);
});

// Bouton Indice: suggère la technique sans appliquer l'étape
document.getElementById('hintBtn')?.addEventListener('click', () => {
    // On ne touche pas aux surlignages pour garder le contexte courant
    const step = findNextStep();
    displayHint(step);
    // Pas d'application de l'étape ici
});

document.getElementById('clearHighlightsBtn')?.addEventListener('click', clearHighlights);

// Appeler le populate après que les fichiers techniques ont été chargés
window.addEventListener('DOMContentLoaded', () => {
    populateTechniqueSelect();
});

document.getElementById('prevStepBtn')?.addEventListener('click', () => {
    if (stepHistory.length === 0) {
        setStatus("Aucune étape précédente disponible.", "warn");
        return;
    }
    const prev = stepHistory.pop();
    restoreDeepState(prev);
});
