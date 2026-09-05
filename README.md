# STRYKER

STRYKER est un gestionnaire local de mods inspiré du fonctionnement de Vortex, conçu pour SP Football Life et eFootball PES 2021 sous Windows. Le projet sépare les archives installées du dossier du jeu, génère un bloc Sider identifiable et réversible, gère les profils et explique les conflits de priorité.

L’interface du site et de l’application est disponible en français, anglais, portugais et espagnol. Le site propose le téléchargement direct de la dernière version Windows. Le bouton « Ouvrir l’application » utilise le protocole Windows `stryker://open` afin de lancer ou remettre au premier plan l’application installée ; si le protocole ne répond pas, le site affiche une aide et le lien d’installation.

Le projet est indépendant. Il n’est affilié ni à Konami, ni à SmokePatch, ni à Nexus Mods. Les mods et leurs pages appartiennent à leurs auteurs respectifs.

## Ce qui fonctionne réellement

- détection stricte d’une installation existante de Football Life/PES 2021 et de `sider.ini` ;
- priorité donnée au véritable Sider de Football Life dans `SiderAddons`, avec migration et redéploiement automatiques des anciennes liaisons incorrectes ;
- staging privé des mods dans `%LOCALAPPDATA%\STRYKER\mods` ;
- import de ZIP et RAR par sélection ou glisser-déposer, avec contrôle des chemins, limite de 20 Go et refus du code exécutable ;
- reconnaissance automatique des structures LiveCPK, Asset, modules Lua Sider, content et Option File, avec ou sans manifeste `stryker.mod.json` ;
- déploiement transactionnel des lignes `cpk.root` et des modules Lua ;
- sauvegarde de `sider.ini` avant chaque changement, avec restauration depuis l’interface ;
- installation et réinstallation sans doublon, état visible, activation/désactivation immédiate sans lancer le jeu, ordre de priorité, désinstallation récupérable et profils clonables ;
- détection des collisions LiveCPK, content et Option File ; résolution des dépendances par identifiant de paquet ;
- détection des conflits entre mods sans signaler comme conflit les deux composants d’un même paquet ;
- liaison par une fenêtre Windows native et lancement réel de Football Life, directement ou après démarrage de Sider ;
- reconnaissance prioritaire du lanceur officiel `FL 20XX start.exe`, y compris pour une installation déjà liée ;
- dépôt STRYKER intégré : réception des ZIP, contrôle technique, file de modération, publication et téléchargement ;
- catalogue installable en un clic depuis l’application ou depuis un lien `stryker://` ouvert sur le site, avec installation locale immédiate des paquets livrés avec STRYKER ;
- paquet intégré **Graphic Menu EPL 2025/26** : deux racines LiveCPK, module UIColors et données Sider installés ensemble ;
- API limitée à `127.0.0.1`, origine contrôlée et mutations protégées par une session éphémère ;
- application Electron autonome, sans Node.js requis chez l’utilisateur final.
- mises à jour Windows vérifiées au démarrage, téléchargeables dans l’application et installables au redémarrage depuis un flux HTTPS publié par STRYKER ;

STRYKER ne prétend pas automatiser les installateurs `.exe`, les DLL, les archives 7z ou les mods dont la structure est ambiguë. Ces archives sont refusées avec une explication ; elles ne sont pas affichées comme installables dans Découvrir.

## Utilisation de l’application

1. Ouvrir STRYKER et sélectionner le dossier qui contient l’exécutable de Football Life ou `PES2021.exe`.
2. Vérifier l’état de l’installation sur le tableau de bord.
3. Rechercher un mod dans **Découvrir**, puis choisir **Installer**. Ses boutons deviennent **Activer/Désactiver** et **Désinstaller**. Un ZIP ou RAR local peut aussi être importé depuis **Mods** ou **Découvrir**, sans manifeste obligatoire lorsque sa structure est reconnue.
4. Pour publier un mod, ouvrir **Publier un mod** sur le site, remplir la fiche et envoyer l’archive en modération.
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

L’artefact stable `STRYKER-Setup-x64.exe` et son manifeste `latest.yml` sont créés dans `release/`. Le flux public utilise par défaut la dernière GitHub Release STRYKER. Pour employer un miroir privé :

```powershell
$env:STRYKER_UPDATE_URL = "https://votre-domaine.example/updates/windows"
npm run package:win
```

Publiez ensuite au même emplacement `latest.yml`, l’installateur `.exe` et son fichier `.blockmap`. Les applications déjà installées vérifient ce flux au démarrage, proposent le téléchargement, puis l’installation avec redémarrage. Le détail opérationnel se trouve dans [docs/UPDATES.md](docs/UPDATES.md).

L’installateur de développement actuel n’est pas signé par un certificat Authenticode public. Windows SmartScreen peut donc afficher un avertissement. Une distribution publique devra être signée avec le certificat de l’éditeur ; une signature auto-signée n’apporterait pas de confiance réelle et n’est volontairement pas utilisée.

## Vérifications

```powershell
npm run check
npm test
npm run build
```

Les tests utilisent uniquement des dossiers temporaires : ils ne modifient pas une vraie installation de Football Life.

## Manifeste de mod

Un ZIP simple contenant `livecpk/<nom>/common/...` est reconnu automatiquement. Pour un mod mixte, plusieurs modules Lua ou des données attendues dans `content` par Sider, ajoutez un `stryker.mod.json`. La documentation et le schéma se trouvent dans [docs/MANIFEST.md](docs/MANIFEST.md) et [docs/stryker.mod.schema.json](docs/stryker.mod.schema.json).

## Données et récupération

Les données locales résident sous `%LOCALAPPDATA%\STRYKER` : état, staging, dépôt de ZIP, sauvegardes, activité et corbeille récupérable. Une désinstallation de mod depuis STRYKER retire son déploiement mais déplace son staging dans cette corbeille au lieu de l’effacer immédiatement.

Les principes de confiance et les frontières du système sont détaillés dans [docs/SECURITY.md](docs/SECURITY.md).

L’architecture du catalogue, le parcours auteur et les exigences d’un hébergement public sont détaillés dans [docs/HUB.md](docs/HUB.md).

## Sources de référence

- [SP Football Life](https://www.pessmokepatch.com/2025/10/spfl26.html)
- [Documentation Sider 7](https://mapote.com/doc/sider/sider7/readme.html)
- [Documentation des profils Vortex](https://wiki.nexusmods.com/index.php/Setting_up_profiles_in_Vortex)
- [Graphic Menu EPL 2025/26 — fiche source](https://pes-files.com/pes-2021-new-graphic-menu-epl-2025-26/)
