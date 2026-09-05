# Mods — STRYKER 3.9.3

## Corrections

- Découvrir ne contient que les paquets installables : les liens SmokePatch, ressources externes et prépublications sont exclus.
- Recherche par nom, auteur, description et tags, insensible aux accents, avec plusieurs mots.
- Installation, activation/désactivation et désinstallation depuis la même carte ; identification du paquet installé sans confusion avec un identifiant voisin.
- ZIP et RAR acceptés par le sélecteur Electron, le glisser-déposer et le téléchargement distant. L’extension RAR est conservée.
- Analyse locale déterministe des archives sans manifeste : common/Asset, LiveCPK, modules Lua identifiables avec leurs fichiers auxiliaires, content et EDIT00000000.
- Refus explicite des variantes ambiguës, manifestes invalides, CPK non pris en charge et exécutables. Aucun script fourni dans l’archive n’est exécuté pour deviner son installation.
- Dépendances résolues par identifiant de paquet. Le correctif Pyro installe sa base depuis Découvrir et passe devant elle lors de sa première installation.
- Détection des collisions étendue à content et aux Option Files. Les maps kits/map.txt et kit-server/map.txt sont fusionnées en conservant les équipes d’origine.
- Adaptation des chemins Lua vers les fichiers auxiliaires et les ressources LiveCPK du paquet isolé. Les archives et les sources en staging restent intactes.
- Réapplication des corrections de déploiement aux installations existantes, une fois au démarrage. Un échec est journalisé et la migration sera retentée.
- Installation d’un paquet déjà présent dans un autre profil : activation dans le profil courant, sans duplication des fichiers.

## Vérifications effectuées

Les 17 archives locales ont été comparées à leurs empreintes et tailles de catalogue puis installées, désactivées, réactivées et désinstallées dans une installation FL2026 simulée et isolée. Les sauvegardes d’Option File et la map de maillots originale ont été restaurées.

Paquets : Graphic Menu EPL, contrôleur STRYKER DLSS, Ficabre Goalnets, Shirtless Celebration, Facepacks 204/222/223, Premier League Facepack Vol.1, Realism Menu Light, Pyro Supporters, Pyro No Spectator Patch, maillots Bundesliga/LaLiga/Ligue 1/Premier League, Option File Transfers V7 et POTM Server 2.4 AIO.

Le parcours Découvrir a été exercé dans Chrome : recherche, installation réelle d’un paquet de test via l’API locale, désactivation, désinstallation, recherche vide et affichage à 420 px sans débordement horizontal. Aucun jeu ou dossier personnel de mods n’a été utilisé pour ces essais.

Les tests de RAR utilisent une véritable archive RAR non compressée créée pour les essais : import local, upload, téléchargement HTTP, empreinte, extraction et rejets de chemins dangereux.

Ce contrôle valide les opérations de STRYKER, pas le rendu ni les comportements pendant un match. Les modifications mémoire de Shirtless Celebration, l’effet Pyro, les presets de filets et le rendu DLSS nécessitent encore une validation dans le jeu et sur la version précise de son exécutable.

## POTM Server 2.4 AIO

L’archive de l’auteur livre deux copies du même module — `modules/POTM_Server.lua` et `modules/common/POTM_Server.lua` — et le correctif « 1-0 en coupe ML » est distribué à part, dans un ZIP contenant uniquement une révision plus récente du même fichier. Installés tels quels, ces deux modules seraient tous les deux déclarés dans `sider.ini` et le serveur POTM se chargerait deux fois.

Le paquet STRYKER ne conserve donc qu’un seul module Lua, la révision du 22/03/2026, avec la racine LiveCPK et les données `content/POTM` des quinze compétitions. Le paquet a été installé, désactivé, réactivé puis désinstallé dans l’installation FL2026 simulée : trois composants reconnus (LiveCPK, content Sider, module Lua), empreinte et taille conformes à la fiche.

## Paquets absents du catalogue installable

Les quatre nouvelles fiches ci-dessous n’ont pas d’archive dans la Release publique mods-2026.09 consultée, ni dans les répertoires d’archives du projet. Elles restent hors de Découvrir :

- Wet Shirt — Martosonic ;
- TurfLoader V4 — Parigo-57 ;
- Shape Turf Loader ;
- Ibrahim Mbaye — Moiduran2.

Mega Facepack V2 possède une archive locale, mais ne fait pas partie du catalogue distribué. Sa prépublication est masquée ; son archive est conservée.

Le contrôleur DLSS reste un module installable ; il ne contient pas les composants graphiques ReShade/RenoDX/NVIDIA. La fiche externe d’installation de ces composants est exclue de Découvrir.
