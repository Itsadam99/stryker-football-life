# STRYKER

STRYKER est un gestionnaire local de mods inspiré du fonctionnement de Vortex, conçu pour SP Football Life et eFootball PES 2021 sous Windows. Le projet sépare les archives installées du dossier du jeu, génère un bloc Sider identifiable et réversible, gère les profils et explique les conflits de priorité.

Le projet est indépendant. Il n’est affilié ni à Konami, ni à SmokePatch, ni à Nexus Mods. Les mods et leurs pages appartiennent à leurs auteurs respectifs.

## Ce qui fonctionne réellement

- détection stricte d’une installation existante de Football Life/PES 2021 et de `sider.ini` ;
- staging privé des mods dans `%LOCALAPPDATA%\STRYKER\mods` ;
- import de ZIP avec contrôle des chemins, limites de taille et refus du code exécutable ;
- reconnaissance des structures LiveCPK courantes et des manifestes `stryker.mod.json` ;
- déploiement transactionnel des lignes `cpk.root` et des modules Lua ;
- sauvegarde de `sider.ini` avant chaque changement, avec restauration depuis l’interface ;
- activation, ordre de priorité, désinstallation récupérable et profils clonables ;
- détection des collisions de fichiers LiveCPK et des dépendances déclarées ;
- lancement réel du jeu ou de Sider, avec un mode démonstration explicitement signalé ;
- catalogue éditorial qui redirige vers la page des auteurs sans héberger ni simuler un téléchargement ;
- API limitée à `127.0.0.1`, origine contrôlée et mutations protégées par une session éphémère ;
- application Electron autonome, sans Node.js requis chez l’utilisateur final.

STRYKER ne prétend pas automatiser les installateurs `.exe`, les DLL, les archives RAR/7z ou les mods dont la structure est ambiguë. Ceux-ci restent manuels par sécurité.

## Utilisation de l’application

1. Ouvrir STRYKER et sélectionner le dossier qui contient l’exécutable de Football Life ou `PES2021.exe`.
2. Vérifier l’état de l’installation sur le tableau de bord.
3. Télécharger un mod depuis la page de son auteur.
4. Importer son ZIP depuis **Mods → Installer une archive ZIP**.
5. Ajuster l’ordre : le mod placé le plus haut est prioritaire dans le bloc STRYKER.
6. Examiner la page **Conflits**, puis lancer le jeu.

Les lignes Sider déjà présentes hors du bloc suivant sont conservées :

```ini
; >>> STRYKER MANAGED MODS >>>
; contenu généré
; <<< STRYKER MANAGED MODS <<<
```

## Développement

Prérequis : Windows 10/11 et Node.js 20 ou plus récent.

```powershell
npm install
npm run dev
```

Le site Vite est alors disponible sur `http://localhost:5173` et le moteur local sur `http://127.0.0.1:3001`.

Pour ouvrir l’application Electron à partir des sources :

```powershell
npm run desktop
```

Pour produire l’installateur Windows x64 :

```powershell
npm run package:win
```

L’artefact est créé dans `release/`. Aucun système de mise à jour automatique n’est annoncé tant qu’un manifeste distant signé n’est pas configuré.

L’installateur de développement actuel n’est pas signé par un certificat Authenticode public. Windows SmartScreen peut donc afficher un avertissement. Une distribution publique devra être signée avec le certificat de l’éditeur ; une signature auto-signée n’apporterait pas de confiance réelle et n’est volontairement pas utilisée.

## Vérifications

```powershell
npm run check
npm test
npm run build
```

Les tests utilisent uniquement des dossiers temporaires : ils ne modifient pas une vraie installation de Football Life.

## Manifeste de mod

Un ZIP simple contenant `livecpk/<nom>/common/...` est reconnu automatiquement. Pour un mod mixte ou plusieurs modules Lua, ajoutez un `stryker.mod.json`. La documentation et le schéma se trouvent dans [docs/MANIFEST.md](docs/MANIFEST.md) et [docs/stryker.mod.schema.json](docs/stryker.mod.schema.json).

## Données et récupération

Les données locales résident sous `%LOCALAPPDATA%\STRYKER` : état, staging, sauvegardes, activité et corbeille récupérable. Une désinstallation de mod depuis STRYKER retire son déploiement mais déplace son staging dans cette corbeille au lieu de l’effacer immédiatement.

Les principes de confiance et les frontières du système sont détaillés dans [docs/SECURITY.md](docs/SECURITY.md).

## Sources de référence

- [SP Football Life](https://www.pessmokepatch.com/2025/10/spfl26.html)
- [Documentation Sider 7](https://mapote.com/doc/sider/sider7/readme.html)
- [Documentation des profils Vortex](https://wiki.nexusmods.com/index.php/Setting_up_profiles_in_Vortex)
