# Manifeste `stryker.mod.json`

Le manifeste rend une installation déterministe lorsque l’archive ne suit pas une structure LiveCPK simple ou contient plusieurs modules Lua. Tous les chemins sont relatifs au dossier du manifeste et doivent rester dans l’archive.

Exemple mixte :

```json
{
  "$schema": "./stryker.mod.schema.json",
  "id": "example-stadium-pack",
  "name": "Example Stadium Pack",
  "version": "1.2.0",
  "author": "Auteur du mod",
  "category": "turf",
  "compatibility": ["Football Life 2026"],
  "sourceUrl": "https://example.invalid/author-page",
  "dependencies": [
    { "id": "required-base-mod-12345678", "version": ">=1.0.0" }
  ],
  "siderOverlay": { "toggleVkey": "0x79", "primary": true },
  "externalDependencies": [
    { "id": "optional-runtime", "fileName": "runtime.dll", "sha256": "64-caracteres-hexadecimaux", "sourceUrl": "https://example.invalid/release", "bundled": false }
  ],
  "components": [
    { "type": "livecpk", "root": "content" },
    { "type": "lua", "root": "modules", "entrypoints": ["stadium-server.lua"] },
    { "type": "sider", "root": "sider-content", "target": "content" }
  ]
}
```

Catégories acceptées : `gameplay`, `turf`, `menu`, `audio`, `kit`, `face`, `scoreboard`, `other`.

Pour LiveCPK, `root` désigne le dossier qui doit devenir une racine `cpk.root`. Pour Lua, `root` désigne le dossier copié sous `modules\STRYKER\<id>` et `entrypoints` contient les fichiers `.lua` que Sider doit charger.

Le composant `sider` est réservé aux données attendues sous le dossier `content` de Sider. STRYKER sauvegarde les fichiers préexistants avant de les remplacer, respecte la priorité du profil et les restaure automatiquement lorsque le mod est désactivé ou désinstallé. Toute autre cible est refusée.

`siderOverlay` est réservé aux contrôleurs interactifs validés par STRYKER. Avec `primary: true`, leur module Lua est placé en premier et `toggleVkey: "0x79"` affecte `F10` à l'ouverture directe du panneau. STRYKER sauvegarde puis restaure la touche précédente à la désactivation. Les autres touches déclarées sont refusées afin d'éviter qu'un ZIP arbitraire remplace un raccourci utilisateur.

`externalDependencies` documente les fichiers que le ZIP ne peut pas redistribuer. Chaque dépendance fournit sa source et son empreinte SHA-256 attendue ; `bundled` doit rester à `false`. Cette déclaration n'autorise jamais STRYKER à télécharger ou exécuter silencieusement un binaire.

Les extensions exécutables ou scriptables (`.exe`, `.dll`, `.bat`, `.cmd`, `.com`, `.msi`, `.ps1`, `.vbs`, `.py`, `.pyw`, `.js`, `.jse`, `.wsf`, `.wsh`, `.hta`, `.scr`, `.jar`, `.lnk`, `.reg`, `.sh`, `.cpl`, `.pif`) entraînent le refus de toute l’archive. Une telle archive doit être inspectée et installée manuellement en suivant la page de l’auteur. Les modules Lua déclarés restent la seule exception scriptable prévue pour Sider.
