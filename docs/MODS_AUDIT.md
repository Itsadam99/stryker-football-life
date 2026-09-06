# Mods — STRYKER 3.9.5

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

Les 21 archives locales ont été comparées à leurs empreintes et tailles de catalogue puis installées, désactivées, réactivées et désinstallées dans une installation FL2026 simulée et isolée. Les sauvegardes d’Option File et la map de maillots originale ont été restaurées.

Paquets : Graphic Menu EPL, contrôleur STRYKER DLSS, Ficabre Goalnets, Shirtless Celebration, Facepacks 204/222/223, Premier League Facepack Vol.1, Realism Menu Light, Pyro Supporters, Pyro No Spectator Patch, maillots Bundesliga/LaLiga/Ligue 1/Premier League, Option File Transfers V7, POTM Server 2.4 AIO, Facepacks 159/202/219 et Soccer Revolution 11 Gameplay.

Le parcours Découvrir a été exercé dans Chrome : recherche, installation réelle d’un paquet de test via l’API locale, désactivation, désinstallation, recherche vide et affichage à 420 px sans débordement horizontal. Aucun jeu ou dossier personnel de mods n’a été utilisé pour ces essais.

Les tests de RAR utilisent une véritable archive RAR non compressée créée pour les essais : import local, upload, téléchargement HTTP, empreinte, extraction et rejets de chemins dangereux.

Ce contrôle valide les opérations de STRYKER, pas le rendu ni les comportements pendant un match. Les modifications mémoire de Shirtless Celebration, l’effet Pyro, les presets de filets et le rendu DLSS nécessitent encore une validation dans le jeu et sur la version précise de son exécutable.

## POTM Server 2.4 AIO

L’archive de l’auteur livre deux copies du même module — `modules/POTM_Server.lua` et `modules/common/POTM_Server.lua` — et le correctif « 1-0 en coupe ML » est distribué à part, dans un ZIP contenant uniquement une révision plus récente du même fichier. Installés tels quels, ces deux modules seraient tous les deux déclarés dans `sider.ini` et le serveur POTM se chargerait deux fois.

Le paquet STRYKER ne conserve donc qu’un seul module Lua, la révision du 22/03/2026, avec la racine LiveCPK et les données `content/POTM` des quinze compétitions. Le paquet a été installé, désactivé, réactivé puis désinstallé dans l’installation FL2026 simulée : trois composants reconnus (LiveCPK, content Sider, module Lua), empreinte et taille conformes à la fiche.


## Facepacks livrés en CPK

Les volumes 159, 202 et 219 ne circulent qu’en `.cpk`. Le moteur refuse ce format et continuera de le refuser : Sider ne charge pas un CPK, et son contenu n’est pas inspectable avant écriture.

La conversion se fait donc à l’empaquetage. `scripts/cpk-extract.mjs` lit la table @UTF masquée de l’archive, décompresse les blocs CRILAYLA et restitue les fichiers d’origine ; `scripts/build-facepack-from-cpk.mjs` les replace sous `livecpk/Facepack_Update_<volume>/Asset/...`, refuse toute extension exécutable, écrit le manifeste et produit le ZIP avec son empreinte. Rien du CPK n’est exécuté et l’archive source reste intacte.

Les trois paquets obtenus déclarent une seule racine LiveCPK ciblant la racine Football Life, comme les volumes 204/222/223 déjà publiés. Chacun a été installé, désactivé, réactivé puis désinstallé dans l’installation FL2026 simulée : cinq joueurs par volume, 68, 63 et 73 fichiers de jeu, empreintes et tailles conformes aux fiches.


## Mods de gameplay livrés en CPK de remplacement

Soccer Revolution 11 remplace `dt13_all.cpk`, `dt18_all.cpk` et l’exécutable du jeu. Aucune de ces trois opérations n’existe dans le moteur : il n’y a pas de composant « remplacer un fichier du jeu », et les exécutables sont refusés.

Un CPK de remplacement ne modifie pourtant qu’une poignée de fichiers. `scripts/build-livecpk-from-cpk-diff.mjs` extrait le CPK d’origine du jeu et celui du mod, compare les contenus par SHA-256 et ne garde que ce qui diffère. Sur 427 fichiers, 14 diffèrent : les neuf `common/match/constant/constant_*.bin`, quatre binaires `common/anime/FHSequence/bin` et `common/anime/Mbinfo/json/anim_infos.json`. Servis par `cpk.root`, ils produisent le même résultat en jeu sans écraser un seul fichier de Football Life, et la désactivation suffit à revenir en arrière. L’archive passe ainsi de 508 Mo à 5,0 Mo.

Les deux exécutables modifiés livrés par l’auteur ne sont pas redistribués : ce sont des binaires du jeu, et la règle 7 de [MOD_STORAGE.md](MOD_STORAGE.md) les laisse à leur source d’origine. Le correctif d’exécutable reste donc à appliquer à la main pour qui le souhaite.

## Paquets absents du catalogue installable

Les quatre nouvelles fiches ci-dessous n’ont pas d’archive dans la Release publique mods-2026.09 consultée, ni dans les répertoires d’archives du projet. Elles restent hors de Découvrir :

- Wet Shirt — Martosonic ;
- TurfLoader V4 — Parigo-57 ;
- Shape Turf Loader ;
- Ibrahim Mbaye — Moiduran2.

Mega Facepack V2 possède une archive locale, mais ne fait pas partie du catalogue distribué. Sa prépublication est masquée ; son archive est conservée.

Le contrôleur DLSS reste un module installable ; il ne contient pas les composants graphiques ReShade/RenoDX/NVIDIA. La fiche externe d’installation de ces composants est exclue de Découvrir.
