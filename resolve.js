/*******************************************************
 * resolve.js — Orchestrateur central des techniques
 * Chaque technique est ajoutée via window.SudokuTechniqueRegistry
 *******************************************************/

// Registre global des techniques (chaque technique "push" un objet ici)
window.SudokuTechniqueRegistry = window.SudokuTechniqueRegistry || [];

// Ordre logique de résolution (hors AUTO)
const TECH_ORDER = () =>
    window.SudokuTechniqueRegistry
        .filter(t => t.key !== 'auto')
        .map(t => t.key);

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
    autoOpt.textContent = 'Auto';
    select.appendChild(autoOpt);

    // Puis toutes les autres techniques selon registre
    window.SudokuTechniqueRegistry.forEach(tech => {
        if (tech.key === 'auto') return;
        const opt = document.createElement('option');
        opt.value = tech.key;
        opt.textContent = tech.label;
        select.appendChild(opt);
    });
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
 * Gestion des événements
 ******************************************************/
document.getElementById('nextStepBtn')?.addEventListener('click', () => {
    clearHighlights();
    const step = findNextStep();
    applyStep(step);
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
