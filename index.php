<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Apprndre le Sudokuy</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Seboku</h1>
        <div class="subtitle">Apprendre...</div>
      </div>

      <div class="toolbar">
        <label class="btn" for="fileInput">Importer</label>
        <button class="btn" id="downloadBtn">Télécharger</button>
        <button class="btn" id="exampleBtn">Exemple</button>
      </div>
    </header>


    <section class="card">

      <div class="card-header toolbar">
        <div class="">
          <button class="btn" id="toggleCandidatesBtn" title="Afficher/Masquer/Régénérer les candidats">Afficher candidats</button>
          <button class="btn" id="clearValuesBtn" title="Efface seulement les valeurs (conserve les 'données')">Effacer valeurs</button>
        </div>
        <div>
          <button class="btn" id="prevStepBtn">Étape précédente</button>
          <select class="btn" id="techniqueSelect" title="Choisir une technique"></select>
          <button class="btn" id="nextStepBtn" title="Appliquer un pas de résolution">Étape suivante</button>
        </div>


        <input style="display:none" type="file" id="fileInput" accept="application/json,.json" />
      </div>


      <div class="grid-wrapper">
        <table class="sudoku-grid" aria-label="Grille Sudoku 9×9" id="grid"></table>
      </div>
      <div class="card-footer toolbar">
        
      </div>
      <div id="status" class="status">Prêt.</div>
    </section>

    <aside class="card right-panel">
      <h3 style="margin-top:0">Zone JSON</h3>
      <div class="meta">Tu peux coller/éditer ici. Format :
        <code>{"values": number[9][9], "givens": boolean[9][9], "candidates": number[][][]}</code>
      </div>
      <textarea id="jsonArea" placeholder='{"values":[[0,0,0,...],[...]], "givens":[[false,false,...],[...]], "candidates":[[[],[],...],[...]]}'></textarea>
      <div class="grid-footer">
        <button class="btn" id="importBtn">Importer depuis la zone</button>
        <button class="btn" id="copyBtn">Copier le JSON</button>
        
      </div>
    </aside>
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

  <script src="script.js?v=1"></script>

  <?php
  $techDir = __DIR__ . '/techniques';
  if (is_dir($techDir)) {
      foreach (scandir($techDir) as $file) {
          if (substr($file, -3) === '.js') {
              echo '<script src="techniques/' . htmlspecialchars($file) . '"></script>' . PHP_EOL;
          }
      }
  }
  ?>
  <script src="resolve.js"></script>


</body>
</html>
