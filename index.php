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
  <script src="https://unpkg.com/lucide@latest"></script>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Seboku</h1>
        <div class="subtitle">Pour apprendre...</div>
      </div>

      <div class="toolbar">
  <label class="btn" for="fileInput"><i data-lucide="download"></i>Importer</label>
  <button class="btn" id="downloadBtn"><i data-lucide="upload"></i>Télécharger</button>
  <button class="btn" id="exampleBtn"><i data-lucide="wand-2"></i>Exemple</button>
      </div>
    </header>


    <section class="card">

      <div class="card-header toolbar">

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
          </div>

          <div>
            <button class="btn" id="clearAllBtn" title="Tout remettre à zéro"><i data-lucide="file-plus"></i>Nouvelle grille</button>
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
      </div>


      <div class="grid-wrapper">
        <table class="sudoku-grid" aria-label="Grille Sudoku 9×9" id="grid"></table>
      </div>

      <div class="card-footer toolbar">
        
      </div>

      
    </section>

    <aside class="card right-panel">
      <h3 style="margin-top:0">Explications :</h3>
      <!-- <div class="meta">Tu peux coller/éditer ici. Format :
        <code>{"values": number[9][9], "givens": boolean[9][9], "candidates": number[][][]}</code>
      </div>
      <textarea id="jsonArea" placeholder='{"values":[[0,0,0,...],[...]], "givens":[[false,false,...],[...]], "candidates":[[[],[],...],[...]]}'></textarea> -->
      <div id="explanations" class="grid-wrapper">
      </div>
      
      <div class="grid-footer">
        <!-- <button class="btn" id="importBtn">Importer depuis la zone</button> -->
        <!-- <button class="btn" id="copyBtn">Copier le JSON</button> -->
        
      </div>
    </aside>
  </div>

  <div id="status" class="status">Prêt.</div>

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

  <script src="script.js?<?= MODE == 'debug' ? date('dmyhs') : $version; ?>"></script>

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
