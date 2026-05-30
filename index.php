<?php
$version = '1.0.0';
define('MODE', 'debug'); // 'debug' or 'production'
// if (!defined('ROOT'))define('ROOT', '');
?>

<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Apprendre le Sudoku</title>
  <link rel="stylesheet" href="style.css?<?= MODE == 'debug' ? date('dmyhs') : $version; ?>" />
  <link rel="stylesheet" href="candidates.css?<?= MODE == 'debug' ? date('dmyhs') : $version; ?>" />
  <script src="https://unpkg.com/lucide@latest"></script>
  <script async src="https://docs.opencv.org/4.10.0/opencv.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>
</head>
<body>
  <div class="container">
    <header class="app-header">
      <div class="brand-block">
        <h1>Seboku</h1>
        <div class="subtitle">Pour apprendre...</div>
      </div>

      <div class="header-actions-row" aria-label="Actions principales">
        <button class="btn icon-btn burger-btn" id="burgerMenuBtn" type="button" title="Afficher/masquer les outils" aria-label="Afficher ou masquer les outils">
          <i data-lucide="menu"></i>
        </button>
        <label class="btn icon-btn" for="fileInput" title="Importer JSON" aria-label="Importer JSON"><i data-lucide="download"></i></label>
                <button class="btn icon-btn" id="downloadBtn" type="button" title="Télécharger" aria-label="Télécharger"><i data-lucide="upload"></i></button>
<label class="btn icon-btn" for="photoInput" title="Importer une photo" aria-label="Importer une photo"><i data-lucide="camera"></i></label>
        <button class="btn icon-btn" id="clearAllBtn" type="button" title="Nouvelle partie" aria-label="Nouvelle partie"><i data-lucide="file-plus"></i></button>
        <button class="btn icon-btn" id="exampleBtn" type="button" title="Exemple" aria-label="Exemple"><i data-lucide="wand-2"></i></button>
      </div>
    </header>


    <section class="card card-grid">

      <div class="card-header toolbar" id="mainTools">

          <div>
            <label class="btn btn-with-color" title="Activer pour marquer/retirer une case comme donnée (indice de départ)">
              <i data-lucide="bookmark"></i>
              <input type="checkbox" id="givenMode" />
              Mode Données
              <input type="color" id="givenColorPicker" value="#b7ffcf" />
            </label>
          </div>
          
          <div>
            <button class="btn" id="toggleCandidatesBtn" title="Afficher/Masquer/Régénérer les candidats"><i data-lucide="grid-3x3"></i>Afficher candidats</button>
            <button class="btn" id="sanitizeCandidatesBtn" title="Nettoyer les candidats invalides (ligne, colonne, bloc)"><i data-lucide="eraser"></i>Nettoyer candidats</button>
          </div>

          <div>
            <button class="btn btn-with-color" id="clearValuesBtn" title="Efface seulement les valeurs (conserve les 'données')">
              <i data-lucide="eraser"></i>Effacer valeurs
              <input type="color" id="valueColorPicker" value="#e5e7eb" />
            </button>
            <button class="btn" id="toggleValuesBtn" title="Afficher ou masquer toutes les valeurs"><i data-lucide="eye-off"></i>Masquer valeurs</button>
          </div>
          

        <div>
          <button class="btn" id="prevStepBtn"><i data-lucide="chevron-left"></i>précédent</button>
          <select class="btn" id="techniqueSelect" title="Choisir une technique"></select>
            <button class="btn" id="hintBtn" title="Proposer la prochaine technique (sans appliquer)"><i data-lucide="lightbulb"></i>Indice</button>
            <button class="btn" id="nextStepBtn" title="Appliquer un pas de résolution">suivant<i data-lucide="chevron-right" style="margin-left:6px"></i></button>
        </div>


        <input style="display:none" type="file" id="fileInput" accept="application/json,.json" />
        <input style="display:none" type="file" id="photoInput" accept="image/*" capture="environment" />
      </div>


      <div class="grid-wrapper">
        <div class="grid-topbar" aria-label="Informations de partie">
          <button class="grid-timer" id="gridTimerBtn" type="button" aria-pressed="false" title="Mettre en pause le timer" aria-label="Mettre en pause le timer">
            <span id="gridTimerToggleIcon"><i data-lucide="pause"></i></span>
            <span id="gridTimerValue" aria-live="polite">00:00</span>
          </button>
          <div class="grid-demand-counter" id="demandCounter" aria-live="polite">Aides: 0</div>
          <div class="grid-difficulty" id="gridDifficulty" aria-live="polite">Difficulte: -</div>
        </div>
        <table class="sudoku-grid" aria-label="Grille Sudoku 9×9" id="grid"></table>
        <div class="mobile-grid-digits" id="mobileGridDigits" aria-label="Saisie rapide mobile">
          <button class="btn mobile-digit-btn" type="button" data-digit="1">1</button>
          <button class="btn mobile-digit-btn" type="button" data-digit="2">2</button>
          <button class="btn mobile-digit-btn" type="button" data-digit="3">3</button>
          <button class="btn mobile-digit-btn" type="button" data-digit="4">4</button>
          <button class="btn mobile-digit-btn" type="button" data-digit="5">5</button>
          <button class="btn mobile-digit-btn" type="button" data-digit="6">6</button>
          <button class="btn mobile-digit-btn" type="button" data-digit="7">7</button>
          <button class="btn mobile-digit-btn" type="button" data-digit="8">8</button>
          <button class="btn mobile-digit-btn" type="button" data-digit="9">9</button>
          <button class="btn mobile-digit-btn" type="button" data-action="clear" title="Effacer la valeur" aria-label="Effacer la valeur">⌫</button>
        </div>
        <div class="grid-play-menu" id="gridPlayMenu" hidden>
          <button class="btn grid-play-btn" id="gridMenuValuesBtn" type="button" title="Afficher/masquer les valeurs" aria-label="Afficher ou masquer les valeurs"><i data-lucide="eye-off"></i></button>
          <button class="btn grid-play-btn" id="gridMenuCandidatesBtn" type="button" title="Afficher/masquer les candidats" aria-label="Afficher ou masquer les candidats"><i data-lucide="grid-3x3"></i></button>
          <button class="btn grid-play-btn" id="gridMenuSanitizeBtn" type="button" title="Nettoyer les candidats invalides" aria-label="Nettoyer les candidats"><i data-lucide="eraser"></i></button>
          <button class="btn grid-play-btn" id="gridMenuHintBtn" type="button" title="Proposer un indice" aria-label="Indice"><i data-lucide="lightbulb"></i></button>
          <!-- <button class="btn grid-play-btn" id="gridMenuSolveBtn" type="button" title="Appliquer un pas de resolution" aria-label="Resolution"><i data-lucide="play"></i></button> -->
        </div>

        <div id="resolutionOverlay" class="resolution-overlay" hidden aria-live="polite">
          <div class="resolution-overlay-panel" role="dialog" aria-modal="false" aria-label="Assistant de resolution">
            <div class="resolution-overlay-header">
              <div class="resolution-overlay-icon-actions" aria-label="Actions resolution">
                <button class="btn xs resolution-overlay-icon-btn primary" id="resolutionOverlayNextBtn" type="button" title="Etape suivante" aria-label="Etape suivante">
                  <i data-lucide="chevron-right"></i>
                </button>
                <button class="btn xs resolution-overlay-icon-btn" id="resolutionOverlayCloseBtn" type="button" title="Fermer" aria-label="Fermer la fenetre">
                  <i data-lucide="x"></i>
                </button>
              </div>
            </div>
            <div id="resolutionOverlayBody" class="resolution-overlay-body"></div>
            <div class="resolution-overlay-actions">
              <button class="btn xs" id="resolutionOverlayVideoBtn" type="button" hidden>Voir la video</button>
            </div>
          </div>

          <div id="resolutionOverlayVideoPanel" class="resolution-overlay-video" hidden>
            <div class="resolution-overlay-video-header">
              <strong>Video technique</strong>
              <button class="btn xs" id="resolutionOverlayVideoCloseBtn" type="button">Fermer la video</button>
            </div>
            <div class="video-container">
              <iframe id="resolutionOverlayVideoFrame" src="" title="Video de resolution" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
            </div>
          </div>
        </div>
      </div>

      <div class="card-footer toolbar">
        
      </div>

      <div id="photoPreviewPanel" class="photo-preview" hidden>
        <div class="photo-preview-header">
          <div class="photo-preview-title">Apercu photo avant OCR</div>
          <div class="photo-preview-actions">
            <button class="btn xs" id="photoCancelBtn" type="button">Annuler</button>
            <button class="btn xs" id="photoPrevStepBtn" type="button" disabled>Etape precedente</button>
            <button class="btn xs" id="photoNextStepBtn" type="button">Etape suivante</button>
            <button class="btn xs primary" id="photoRunBtn" type="button">Lancer OCR</button>
          </div>
        </div>
        <div class="photo-preview-frame" id="photoPreviewFrame">
          <img id="photoPreviewImg" alt="Apercu de la photo importee" />
          <div id="photoCornersOverlay" class="photo-corners-overlay" hidden>
            <svg class="corner-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polygon id="photoCornersPolygon" points="" />
            </svg>
            <span class="corner-marker" data-corner="0"></span>
            <span class="corner-marker" data-corner="1"></span>
            <span class="corner-marker" data-corner="2"></span>
            <span class="corner-marker" data-corner="3"></span>
          </div>
        </div>

        <div id="photoWarpPanel" class="photo-warp" hidden>
          <div class="photo-preview-title">Image carree redressee</div>
          <div class="photo-warp-controls" id="photoWarpControls">
            <label class="warp-control" title="-100 assombrit, +100 eclaircit">
              Luminosite
              <input type="range" id="ocrBrightness" min="-100" max="100" value="0" />
            </label>
            <label class="warp-control" title="100 = neutre, plus grand = contraste plus fort">
              Contraste
              <input type="range" id="ocrContrast" min="50" max="220" value="130" />
            </label>
          </div>
          <details class="photo-warp-advanced" id="photoWarpAdvanced">
            <summary>Options avancees</summary>
            <div class="photo-warp-advanced-grid">
              <label class="warp-control" title="Taille de fenetre du seuil adaptatif (impair)">
                Fenetre seuil
                <input type="range" id="ocrBlockSize" min="9" max="41" step="2" value="15" />
              </label>
              <label class="warp-control" title="Compensation du seuil adaptatif">
                Compensation C
                <input type="range" id="ocrThresholdC" min="0" max="20" value="6" />
              </label>
              <label class="warp-control" title="Force du denoise (ouverture morphologique)">
                Debruitage
                <input type="range" id="ocrDenoise" min="0" max="3" value="1" />
              </label>
              <label class="warp-control warp-control-toggle" title="Blanchit les lignes detectees avant OCR pour mieux isoler les chiffres">
                Nettoyage lignes
                <input type="checkbox" id="ocrLineCleanup" checked />
              </label>
              <label class="warp-control warp-control-toggle" title="Force le recalcul des bordures du cadre depuis l'espacement des cellules internes">
                Cadre strict
                <input type="checkbox" id="ocrStrictBorder" checked />
              </label>
            </div>
            <div class="photo-warp-advanced-actions">
              <button class="btn xs" id="ocrResetTuningBtn" type="button">Reset reglages</button>
              <button class="btn xs" id="ocrSaveTuningBtn" type="button">Enregistrer</button>
            </div>
          </details>
          <div id="photoWarpSettingsMeta" class="photo-warp-meta"></div>
          <div class="photo-warp-frame" id="photoWarpFrame">
            <img id="photoWarpPreviewImg" alt="Apercu de la grille redressee" />
            <div id="photoWarpLinesOverlay" class="photo-warp-lines-overlay" hidden></div>
            <div id="photoWarpGridOverlay" class="photo-warp-grid-overlay" hidden></div>
          </div>
        </div>
      </div>


      
    </section>
  </div>

  <!-- Popover candidats -->
  <div id="candPopover" class="cand-popover" aria-hidden="true">
    <div class="cand-grid">
      <!-- 9 boutons injectés par JS -->
    </div>
    <div class="cand-actions">
      <button class="btn xs" data-action="all">Tout</button>
      <button class="btn xs" data-action="none">Aucun</button>
      <button class="btn xs primary" data-action="ok">OK</button>
    </div>
  </div>

  <div id="overlayNumpad" class="overlay-numpad" hidden>
    <div class="overlay-numpad-grid">
      <button type="button" data-digit="1">1</button>
      <button type="button" data-digit="2">2</button>
      <button type="button" data-digit="3">3</button>
      <button type="button" data-digit="4">4</button>
      <button type="button" data-digit="5">5</button>
      <button type="button" data-digit="6">6</button>
      <button type="button" data-digit="7">7</button>
      <button type="button" data-digit="8">8</button>
      <button type="button" data-digit="9">9</button>
    </div>
    <div class="overlay-numpad-actions">
      <button type="button" data-action="clear">Effacer</button>
      <button type="button" data-action="cancel">Annuler</button>
    </div>
  </div>

  <script src="picture.js?<?= MODE == 'debug' ? date('dmyhs') : $version; ?>"></script>
  <script src="ocr.js?<?= MODE == 'debug' ? date('dmyhs') : $version; ?>"></script>
  <script src="script.js?<?= MODE == 'debug' ? date('dmyhs') : $version; ?>"></script>
  <script src="candidates.js?<?= MODE == 'debug' ? date('dmyhs') : $version; ?>"></script>

  <?php
  $techDir = __DIR__ . '/techniques';
  if (is_dir($techDir)) {
      foreach (scandir($techDir) as $file) {
          if (substr($file, -3) === '.js') {
              echo '<script src="techniques/' . htmlspecialchars($file) . '?' . ((MODE == 'debug') ? date('dmyhs') : $version) . '"></script>' . PHP_EOL;
          }
      }
  }
  ?>
  <script src="resolve.js?<?= MODE == 'debug' ? date('dmyhs') : $version; ?>"></script>


</body>
</html>
