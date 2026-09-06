# Identités d’équipes et entraîneurs — conception et faisabilité

Statut : recherche et diagnostic, pas encore un mod de gameplay fonctionnel.
Périmètre demandé : Football Life 2026, puis adaptations distinctes PES 2021 et FL2027.

## Comportement attendu

Chaque équipe doit conserver une identité de jeu reconnaissable pendant les matchs. Les réglages doivent influencer les décisions et les déplacements, sans imposer un pourcentage de possession ou un résultat. Les caractéristiques individuelles, le niveau de l’adversaire, le score, la fatigue, les exclusions et les espaces disponibles doivent continuer à compter.

Le style combine plusieurs dimensions : construction courte/directe, rythme, largeur, liberté de mouvement, soutien au porteur, hauteur du bloc, compacité, pressing et comportement à la perte/récupération. Les familles possession positionnelle, combinaisons courtes, pressing haut, transitions rapides, jeu sur les côtés, jeu direct structuré et bloc compact peuvent se combiner. Une famille n’interdit pas les autres solutions.

Les exemples Barça et Atlético demandés servent de premiers scénarios de validation, pas de descriptions éternelles de ces clubs :

- Barça orienté possession : davantage de solutions courtes, de soutien et de circulation ; capacité à accélérer et à jouer dans la profondeur. Une opposition efficace peut perturber cette construction.
- Atlético orienté bloc compact : protection des espaces centraux et transitions, avec capacité à prendre l’initiative contre plus faible ou lorsqu’il faut revenir au score.
- Relance : réduire le ballon aérien systématique du défenseur vers le numéro 9 quand des solutions existent. Garder le dégagement sous pression, le renversement, la profondeur et le jeu direct volontaire. Ne pas supprimer globalement les passes longues.

L’identité initiale associe le club, l’entraîneur et l’effectif de la saison choisie. Toutes les équipes de la base installée doivent être recensées avec leurs identifiants réels. Les équipes non documentées conservent un profil de départ dérivé de leurs tactiques existantes ; elles ne doivent pas recevoir une prétendue identité réelle inventée. Les sélections nationales nécessitent une gestion distincte de celle des clubs.

## Entraîneurs et carrières

- Inclure des entraîneurs réels absents de la base FL, avec identité et date de naissance documentées ; distinguer les personnes réelles des personnages fictifs.
- Chaque entraîneur possède préférences tactiques, systèmes favoris/alternatifs, adaptabilité, expérience, réputation, club actuel et contrat daté.
- Contrats, âge, expérience et retraite suivent le calendrier de la sauvegarde, jamais la date de Windows ni le nombre de lancements du jeu.
- Évaluer les résultats relativement aux moyens et aux objectifs du club. Prévoir une période de tolérance, une tendance sur plusieurs matchs, les blessures et la difficulté du calendrier quand ces données sont accessibles. Pas de licenciement automatique après une seule défaite.
- À échéance : prolongation ou séparation. Mauvais résultats : possibilité de remplacement avant terme. Les entraîneurs libres ou en poste constituent un marché cohérent, sans affecter une même personne à deux clubs simultanément.
- Un nouveau coach peut modifier formation, rôles et titulaires, selon les joueurs disponibles. Transition progressive et adaptations de match ; conserver blessures, suspensions, transferts et choix du joueur humain.
- Ligue des Masters : le joueur conserve sa tactique et sa composition dans son propre club (choix utilisateur confirmé). Le système automatique concerne les autres clubs. Vers une légende : il concerne aussi le club du joueur. Les amicaux utilisent l’identité de référence et ne font pas avancer une carrière.

## Vieillissement et renouvellement

L’objectif est une carrière viable sur au moins 25 saisons, avec un vivier qui se renouvelle plutôt que des entraîneurs réels maintenus indéfiniment. L’âge découle de la date de naissance et de la date de carrière. La retraite doit devenir plus probable avec l’âge, avec une limite maximale de simulation explicite à calibrer ; un contrat existant ne doit pas empêcher toute retraite.

Les entrants peuvent être des entraîneurs fictifs, d’anciens adjoints et, si les données du jeu permettent de reconnaître une retraite, d’anciens joueurs reconvertis. Une reconversion n’est ni immédiate ni garantie. Les entrants reçoivent une identité persistante, un parcours et des préférences variées, sans cloner un coach retraité. Le recrutement dépend de la réputation du club et du candidat, du style recherché et de l’effectif ; pas de tirage uniforme entre tous les noms.

Les retraites, nouveaux arrivants et changements de contrat doivent être idempotents : recharger la même sauvegarde ne recrée pas de coachs et ne répète pas les licenciements. Chaque carrière possède son état distinct et ses instantanés. Un retour à une ancienne sauvegarde restaure l’état correspondant. Une carrière ML et une carrière BAL ne partagent pas leurs mutations.

Ajouter une identité de coach au système ne suffit pas à créer son visage, ses animations ou ses cinématiques. Ces éléments restent un chantier graphique séparé.

## Ce qui est vérifié techniquement

Installation locale inspectée le 5 septembre 2026 : FL_2026.exe version fichier 26.2.0.3 ; dernier journal Sider : 7.3.3, chargé depuis D:\FL 26\SiderAddons. Les bibliothèques Lua et statistiques sont activées dans ce sider.ini. Le fichier sider.ini à la racine du jeu est une autre configuration : ne pas le confondre avec celle du dernier lancement constaté.

L’API publique Sider expose set_teams, after_set_conditions, context_reset, les événements de chargement de ressources et match.stats(). Ce dernier documente le score, la période et l’horloge ; pas la possession, les passes, le classement ou les contrats. context_reset ne prouve pas qu’un match est terminé. Le champ season des conditions est été/hiver ; ce n’est pas l’année de carrière. match_id n’est pas un identifiant fiable de sauvegarde documenté.

Il n’existe pas dans cette documentation de fonction publique pour appliquer un profil tactique ou remplacer un entraîneur. La bibliothèque mémoire et les événements personnalisés ouvrent une voie d’analyse, mais ne constituent pas une preuve de compatibilité pour cette version FL. Aucune adresse mémoire d’une autre version ne sera utilisée sans validation.

Des outils publics décrivent des données tactiques de la base et du fichier EDIT. Ce sont des pistes de format, pas une preuve qu’une modification d’EDIT se propage à une carrière déjà commencée. Il faut identifier les copies utilisées en match et en ML/BAL, et les moments où le jeu les recharge.

## Étapes et critères de passage

1. Diagnostic en lecture seule : observer les ressources chargées et le contexte sur un amical, un match BAL et un match ML, puis à la reprise d’une sauvegarde. Le module de diagnostic n’applique aucune tactique et ne lit/écrit aucun pointeur mémoire.
2. Identifier les blocs tactiques par comparaison contrôlée : modifier un seul réglage via le jeu dans un profil d’essai, comparer avant/après et retrouver son utilisation effective. Démontrer une modification réversible sur deux équipes avant d’étendre la base.
3. Tester un petit ensemble de styles : mêmes équipes, difficulté, durée et effectifs, plusieurs matchs avec/sans mod. Mesurer possession, sorties courtes/longues, transitions et occasions ; vérifier aussi défaites, avance au score, fatigue et infériorité numérique. Les compteurs absents de Sider nécessitent une autre observation vérifiée, éventuellement manuelle au départ.
4. Identifier séparément la sauvegarde, la date de carrière, les résultats de tous les clubs et les formations. Les seules statistiques du match du joueur ne suffisent pas pour gérer les entraîneurs de toute la ligue.
5. Relier contrats et changements de coach à ces données ; tester sauvegarde/rechargement/retour arrière et passage de saison en ML comme en BAL.
6. Simuler au moins 25 saisons pour tester les âges, retraites, pénurie/excès de candidats, affectations et répétitions d’événements ; puis valider l’intégration sur plusieurs saisons réelles du jeu.

Tant que les points 2 et 4 ne sont pas démontrés, ne pas annoncer un gameplay actif ni un système de carrière automatique. Une table de styles en Lua sans liaison avec le moteur n’a aucun effet sur le jeu.

## Sources techniques primaires consultées

- [Guide Lua officiel Sider](https://mapote.com/doc/sider/sider7/scripting.html) : événements, contexte, mémoire et statistiques.
- [Événements personnalisés Sider](https://mapote.com/doc/sider/sider7/custom-events.html).
- [4ccEditor](https://github.com/the4chancup/4ccEditor), notamment pes20.cpp : structures de fichier EDIT et données d’équipe ; à valider distinctement sur FL.
- [DinoEditor, Tactics.vb](https://github.com/smeagol75/DinoEditor/blob/Fixed/Tactics.vb) : piste de structure des fichiers tactiques, pas des adresses de FL2026.

Le prototype de diagnostic est dans research/team-identity-probe. Il reste hors du catalogue public.

## Avancement du premier prototype

Six tests exécutés avec LuaJIT 2.1 via Lupa 2.8 : réussis. Archive construite, installation/déploiement à l’identique, désactivation/réactivation et désinstallation contrôlés via le moteur STRYKER dans un dossier temporaire isolé : réussis.

Le diagnostic 0.1.0 a été installé manuellement dans le SiderAddons local, avec une copie préalable de sider.ini conservée dans artifacts/team-identity-research. Le journal local-installation.json y décrit les deux fichiers concernés et la sauvegarde. Aucun jeu n’a été lancé pour ce contrôle. Prochaine étape nécessaire : une session de jeu utilisateur pour vérifier le chargement du module et examiner ses observations.

## Observations du 6 septembre 2026

La session du 5 septembre à 23:22 contient 63 événements, dont le chargement de Coach.bin, Tactics.bin, TacticsFormation.bin et Team.bin, ainsi que Lorient–Paris FC. La collecte de statistiques a échoué : pcall n’est pas une fonction globale disponible dans les modules Sider (1 130 erreurs répétées). La version 0.1.1 supprime cette dépendance et bloque toute répétition en cas d’échec de l’API de statistiques. Sept tests passent désormais dans un environnement Lua limité aux fonctions documentées de Sider ; le cycle d’installation/désinstallation de l’archive passe aussi.

Une session plus récente, datée du 6 septembre à 10:59:56, charge bien 0.1.1 : 42 événements, aucune erreur du diagnostic, Algérie (1040)–Maroc (32), score 0–0 aux instantanés 0:26, 5:17 et 10:12. Cela valide la lecture en jeu du score et de l’horloge. Ces instantanés ne constituent pas un résultat final et ne mesurent pas la possession.

Extraction en lecture seule des tables locales avec [pes-file-tools](https://github.com/the4chancup/pes-file-tools). Les tailles compressées observées correspondent à :

| Table | Archive candidate | Taille observée | Taille décompressée |
| --- | --- | ---: | ---: |
| Tactics.bin | data_s25262.cpk | 11 120 | 18 672 |
| TacticsFormation.bin | data_s25262.cpk | 154 104 | 616 968 |
| Coach.bin | data_s25262b.cpk | 17 355 | 98 000 |
| Team.bin | data_s25262b.cpk | 50 159 | 1 147 468 |

La correspondance de taille est un indice de la version chargée, pas une comparaison d’empreinte avec la mémoire. Aucun CPK original n’a été modifié.

Le format Team/Coach décrit par [pes-db-generator](https://github.com/the4chancup/pes-db-generator) permet de lire 749 équipes uniques et 980 entraîneurs. Chacune des 749 équipes possède une référence de coach résolue et des lignes tactiques. On recense 1 556 lignes tactiques et 1 558 groupes de formation de 33 entrées. Les relations identifiants tactiques/équipes/formations sont recoupées ; les bits des consignes ne sont pas encore interprétés. Une ligne de World Selection n’a pas de groupe de formation correspondant ; ne pas assimiler cela à un bug sans essai. Huit identifiants d’équipe de la table tactique sont absents de la table des équipes sélectionnée.

Exemples dans cette base locale : Barça 108 / coach 102080 (Hansi Flick), Atlético 172 / coach 52 (Diego Simeone), Paris FC 4211 / coach 101358 (Antoine Kombouaré). Ce sont les données installées, pas une vérification des postes réels actuels de ces personnes.

Une copie de BL00000000, sauvegardée le 6 septembre 2026 à 11:03, a été ouverte avec [pesXdecrypter 6.0.0, outil PES 2021](https://github.com/the4chancup/pesXdecrypter/releases/tag/6.0.0). Sa description donne Paris FC / Ligue 1 et 2/9/2025. Cette date textuelle est un premier repère de calendrier ; le champ interne utilisé par le moteur reste à identifier. Les noms d’équipes et de coachs apparaissent dans les données de carrière, mais les lignes tactiques de base recherchées ne sont pas retrouvées à l’identique : il faut analyser la structure propre à la sauvegarde, sans supposer une propagation des tables de base.

Une copie et un décodage d’EDIT00000000 sont également prêts pour une comparaison contrôlée. Les empreintes des originaux BL et EDIT ont été vérifiées inchangées. Les copies privées, inventaires et journaux restent dans artifacts/team-identity-research, hors Git. Étape suivante : inverser un seul réglage passes courtes/longues dans la tactique principale de Paris FC via l’éditeur du jeu, enregistrer puis comparer la nouvelle copie au point de référence. Ne pas changer les autres consignes pendant cette comparaison.
