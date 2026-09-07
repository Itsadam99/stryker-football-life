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

## Première consigne identifiée par une modification contrôlée

Le fichier EDIT sauvegardé le 6 septembre à 11:20:05 a été copié et décodé, puis comparé à la référence. L’utilisateur confirme avoir choisi **passes courtes** pour Paris FC. Les deux blocs data.dat ont la même longueur (10 995 800 octets). Seuls 33 octets diffèrent : 32 octets à l’offset 0x30, de rôle encore inconnu, et **un octet tactique à 0xA5FE04, passant de 0 à 1**.

L’octet se situe à +0x68 dans un enregistrement de 0x274 octets commençant à 0xA5FD9C et portant l’identifiant Paris FC 4211. Les enregistrements voisins à ±0x274 portent 4206 et 4212, ce qui recoupe la taille des enregistrements tactiques EDIT décrite par 4ccEditor. Pour ce réglage et ce format observés : 0 = passes longues, 1 = passes courtes. Ne pas transposer l’offset absolu à un autre fichier ou celui relatif à Tactics.bin, dont les consignes sont compactées différemment.

Les 99 octets de formation suivant l’identifiant de cet enregistrement ont trois correspondances exactes dans la copie de carrière analysée : 0x1E3C0, 0x13E588 et 0x13E6C8. Une formation peut être partagée par plusieurs équipes ou plusieurs plans ; ces occurrences ne prouvent pas à elles seules l’emplacement du plan actif de Paris FC. Aucune de ces données n’a été modifiée. Le contrôle en match de la fréquence des passes longues reste à effectuer après identification de la liaison avec le plan effectivement utilisé.

L’observation structurée est conservée dans research/team-identity-probe/tactical-field-observations.json. Le réglage choisi par l’utilisateur dans l’éditeur est conservé ; aucun original n’a été réécrit par les outils d’analyse.

## Copie tactique propre à la carrière et premier fichier d’essai

Le recoupement suivant identifie une table BAL commençant après 84 octets d’en-tête : 750 équipes de 1 680 octets, suivies de 750 enregistrements de coachs de 600 octets. L’indice correspond entre les deux tables ; il ne correspond pas à l’identifiant d’équipe de la base. Le coach porte son identifiant à +0, son nom à +4 et trois plans de 160 octets à +60. Le bloc de l’équipe comporte également un plan candidat de 160 octets à +1 116. Ne pas y copier 480 octets : les données suivantes ont une autre fonction.

Dans la première copie analysée, 631 équipes recoupées par leur nom anglais possèdent exactement les mêmes 480 octets de plans du coach que leur enregistrement EDIT de référence. Les noms localisés et équipes non recoupées demandent une identification distincte. Pour Paris FC, indice 73 / coach 101358, les trois plans et le plan propre à l’équipe correspondent à leurs références EDIT.

Une nouvelle copie a été prise depuis la carrière enregistrée le 6 septembre à 15:54, qui affiche désormais le **24 octobre 2025**. Sa taille décodée a évolué à 19 807 017 octets, mais les structures de Paris FC et les quatre valeurs de construction sont identiques aux emplacements repérés. `career_format.py` valide ces structures et produit une copie où quatre octets passent de 0 à 1 : 123 940, 1 304 044, 1 304 204 et 1 304 364. Toutes les autres données du bloc de carrière restent identiques.

`build_career_trial.py` ajoute uniquement un titre distinct dans le bloc de description, puis chiffre et déchiffre le fichier avec pesXdecrypter PES 2021. Les six blocs obtenus correspondent exactement aux blocs attendus. Le fichier d’essai a été ajouté dans l’emplacement libre **BL00000002**, sous le titre **STRYKER TEST - Paris FC**. Les empreintes des deux sauvegardes préexistantes ont été contrôlées inchangées. Les copies, rapports et données privées restent hors Git dans artifacts/team-identity-research.

**Contrôle utilisateur réussi : la sauvegarde 3 se charge et affiche les passes courtes ; la sauvegarde 1 affiche toujours les passes longues.** Une carrière existante peut donc reprendre cette modification au chargement. La réduction des longs ballons pendant un match, les autres consignes et formations, l’application sans rechargement et le format ML restent à valider.

## Moteur de renouvellement des coachs — simulation séparée

Le prototype `career_coaches.py` gère une saison explicitement fournie, les échéances et renouvellements de contrats, les départs après une saison insuffisante par rapport aux attentes du club, les retraites et un vivier fictif qui se renouvelle. La date de Windows n’intervient pas. La limite de retraite de simulation est actuellement 72 ans, avec une probabilité croissante dès 62 ans : ce sont des réglages de prototype à calibrer, pas des règles réelles du football. Une retraite peut interrompre un contrat plus long.

L’attribution tient compte de la réputation et de la proximité des préférences tactiques, conserve l’unicité des affectations, et ne réembauche pas immédiatement un coach au club qui vient de le remplacer. Les huit dimensions tactiques combinent identité du club et vision du coach. Les systèmes favoris sont conservés dans l’intention émise ; ils ne sont pas encore traduits en placements, rôles ou choix de titulaires PES. En ML, aucune intention n’est émise pour le club du joueur, conformément à sa décision.

Le moteur exige les résultats de tous les clubs, des identités distinctes et des dates de naissance documentées pour les personnes réelles. Le marché ne comprend actuellement que les entraîneurs disponibles ; débaucher un coach sous contrat et convertir d’anciens joueurs seront des extensions. Les sélections sont exclues et demandent un calendrier propre. Les appels répétés sont idempotents ; restaurer un ancien instantané permet de reproduire le même futur, mais la correspondance automatique avec les fichiers de sauvegarde n’est pas encore raccordée.

À cette étape, 16 tests Python passaient pour l’adaptateur et cette simulation, dont 25 saisons avec **749 clubs et 980 entraîneurs initiaux entièrement fictifs**, sans coach retraité en poste ni double affectation. Cela valide les invariants du code ; aucune carrière FL n’a encore subi 25 saisons de cette simulation.

## Deuxième essai : styles, formations et affectation d’un coach

La [cartographie du fichier EDIT publiée par ses auteurs sur Rigged Wiki](https://implyingrigged.info/wiki/Pro_Evolution_Soccer_2021/Edit_file) décrit les champs du plan de 160 octets. `tactical_plans.py` utilise cette description pour les consignes binaires, trois curseurs et les positions. La construction courte reste la seule consigne confirmée séparément par un changement contrôlé FL. Le compilateur conserve les octets inconnus, les instructions avancées et le gardien. Six formations originales sont proposées ; l’affectation aux postes minimise les changements de rôle parmi les onze emplacements existants. Cela n’est pas encore une sélection de titulaires fondée sur les aptitudes, blessures ou fatigue.

Le nouvel essai traite les **730 équipes nommées de la carrière, sans équipe ignorée**, à partir de leurs plans locaux. Les plans orientés possession avec relance longue passent en construction courte ; les équipes orientées jeu direct conservent ce choix. Deux profils de conception spécifiques sont ajoutés pour Barça/Flick et Atlético/Simeone. Il ne s’agit pas de 730 nouvelles analyses du football réel. Les trois plans sont préparés, mais leur sélection automatique selon le score n’est pas encore pilotée par le mod.

Le lien coach du bloc équipe est à +652, avec l’indice interne d’équipe à +648. Les références coach correspondent sur 730 équipes sur 730. `career_application.py` contrôle ces deux valeurs et modifie ensemble la référence équipe, l’identifiant du coach et son nom. Il refuse les coachs déjà employés et ceux absents du catalogue natif fourni. `operations_from_simulation` traduit les intentions du moteur en opérations explicites, avec exclusion du club humain en ML. L’écriture ML reste interdite tant que son format distinct n’est pas cartographié ; un coach fictif sans identité native préparée bloque l’application au lieu d’emprunter celle d’une personne réelle.

La sauvegarde **BL00000003**, titre **STRYKER TEST - Coach et styles**, est installée dans l’emplacement 4. Le test affecte explicitement Laurent Blanc, identifiant natif 18 disponible dans cette copie de carrière, à Paris FC : principal 4-3-3, défensif 4-1-4-1, troisième plan 4-2-3-1. Cette affectation expérimentale n’est ni un événement sportif réel ni un licenciement calculé en fin de saison. Le bloc de carrière diffère sur 1 189 octets ; le cycle de chiffrement/déchiffrement reproduit exactement les six blocs attendus. Toutes les sauvegardes préexistantes ont conservé leurs empreintes. **Contrôle utilisateur réussi : Laurent Blanc et la formation principale 4-3-3 sont affichés dans la sauvegarde 4.** Les autres consignes et le comportement pendant un match restent à observer. Une révision suivante corrige le 4-2-3-1 avec des rôles de milieux gauche/droit ; elle produit 1 200 octets modifiés et a passé le cycle de chiffrement, mais reste non installée pendant la session en cours.

## Calendrier observé et travail restant avant publication

Deux champs à 11 322 908 et 11 516 880 portent l’année sur 16 bits little-endian, puis mois/jour sur un octet chacun. Ils concordent avec les descriptions de trois sauvegardes : 2 septembre 2025, 24 octobre 2025 et 21 février 2026. `career_calendar.py` exige leur accord avec la description D/M/Y. Cette lecture n’identifie pas encore à elle seule la fin d’une saison ou la compétition correspondante.

Avant un mod public installable : mesurer le comportement du deuxième essai en match ; lire les résultats de toutes les équipes et leurs compétitions ; relier chaque sauvegarde à son état de simulation et gérer les retours arrière ; compléter les biographies des entraîneurs réels ; créer et tester les identités natives des nouveaux coachs ; traiter la Ligue des Masters ; raccorder le lancement/chargement dans STRYKER. Les formations adaptées à l’effectif et les changements en cours de match demandent aussi une intégration supplémentaire. Les outils actuels travaillent sur des copies hors jeu, sans boucle automatique ni écriture mémoire.

Les sources, profils, observations, tests et instructions de reproduction sont conservés sur `codex/team-identities-coaches`. Les données de jeu et sauvegardes privées restent dans les artifacts locaux. Une archive de sources de développement accompagne cette étape ; elle n’est pas présentée comme un mod final du catalogue.

La suite de carrière compte désormais 29 tests. Une installation en cours de saison peut traiter sa première saison partielle si le calendrier de cette saison est explicitement fourni ; aucune fin de saison n’est déduite de la date seule. Pour identifier les tableaux de résultats natifs, la prochaine comparaison demande les matchs, victoires, nuls, défaites et points de Paris FC après enregistrement de la sauvegarde 4.

## Résultats de compétition identifiés et raccordés — 8 septembre 2026

L’utilisateur corrige son indication initiale et confirme **6 matchs, 2 victoires, 2 nuls, 2 défaites, 8 points** pour Paris FC. Ces valeurs correspondent au premier enregistrement de résultats du bloc d’équipe : début +744, quinze entrées de vingt octets. Chaque entrée contient l’identifiant de compétition sur 16 bits, puis points, matchs, victoires, nuls et défaites sur un octet chacun. Deux champs de buts candidats suivent à +8/+12 ; le byte +7 et l’entier +16 restent non interprétés. Le marqueur 65535 indique une entrée vide.

La compétition native 20 contient les 18 équipes de Ligue 1 de cette carrière. Au 24 octobre 2025, on totalise 108 apparitions d’équipes, 45 victoires, 18 nuls et 45 défaites ; les deux compteurs de buts totalisent chacun 121. Paris FC est également recoupé à 0 point après 2 matchs le 2 septembre 2025, puis 30 points après 23 matchs (9 V, 3 N, 11 D) le 21 février 2026.

Les deux premières copies contiennent 843 lignes sur 78 compétitions ; la troisième contient 1 403 lignes sur 128 compétitions. Toutes les compétitions ont des totaux victoires/défaites et buts cohérents. Les phases 148 et 175 présentent toutefois des points non standards, dont des points sans matchs : elles sont signalées et ne sont pas traitées comme une ligue simple. Il ne faut pas confondre les identifiants de compétition propres à la carrière avec ceux de Competition.bin.

`career_results.py` extrait ces observations et choisit exactement une compétition explicitement liée à chaque club. `career_cycle.py` peut fournir ces résultats au moteur annuel uniquement après contrôle des membres et du nombre programmé de matchs de chaque ligue simulée. La suite vérifie ce raccordement avec un calendrier synthétique complet et refuse les saisons incomplètes. **Les calendriers réels ne sont pas encore raccordés ; aucun changement annuel automatique n’a été appliqué dans le jeu.**

379 équipes nommées n’ont aucune ligne de résultats dans les deux premières références ; 194 dans la troisième. Cette absence ne vaut pas une série de défaites. Le moteur distingue désormais une indisponibilité explicite de résultats : il peut gérer contrats et âge à une échéance autorisée, mais n’évalue pas la performance du club concerné. La politique des compétitions et phases non identifiées reste à définir avant activation globale.

`career_history.py` stocke des checkpoints immuables contenant les observations et, lorsqu’il existe, l’état du moteur. La restauration d’un ancien état, les branches, l’idempotence et la détection d’altération sont testées. L’identité de carrière et le parent sont explicites ; la découverte automatique des branches depuis les fichiers du jeu reste à développer. Deux checkpoints d’observations ont été créés pour la copie de référence et l’essai qui en dérive, sans inventer un état de coach pour les données réelles.

**40 tests de carrière passent.** Le code et les observations restent sur la branche du mod ; les rapports détaillés et checkpoints privés restent dans les artifacts. Travail restant : calendrier et phases des compétitions, biographies et identités natives des entrants, connexion persistante au chargement/enregistrement, adaptation à la ML et validation du comportement en match. La sauvegarde 4 précédemment validée est inchangée.
