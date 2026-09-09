# Calendriers natifs BAL — observations du 9 septembre 2026

Lecture seule de quatre copies privées FL26. Aucun fichier du jeu ou de
sauvegarde original n'a été écrit. Le nouveau fichier `BL00000000` du
8 septembre a été copié dans `season-snapshot-20260909` et décodé : date
18/11/2025, 19 807 769 octets de données, empreinte de la sauvegarde chiffrée
`906867d480b66d13717d8fc0688d6ea8e550508cec33ebe59e1d95d3488386e4`.
La copie et l'original avaient la même empreinte immédiatement après copie.

## Correspondance des identifiants de compétition

Le [CommonLib publié par ses auteurs](https://github.com/antony-hk/pes-sider-commonlib-proposal/blob/main/CommonLib.lua)
décrit `CompetitionRegulation.bin` : enregistrement de 2 352 octets,
identifiant de tournoi u16 LE à +2, identifiant de `Competition.bin` à +8.
L'extraction locale `data_s25262.cpk` recoupe ce format : 214 enregistrements,
503 328 octets, empaquetés sur 10 326 octets. Le journal Sider charge exactement
ces deux tailles. Empreinte décompressée :
`35f11b1ac0856e25c0f1eb4d5c0694bd887f277bcbdd3c11740da4d4dd01c15d`.

À l'offset 148 176 de cette table : tournoi **20**, base **12**, nom **Ligue 1**.
Les tournois 148 et 175 sont les groupes A et B des playoffs de la base 128,
ce qui explique le besoin de traiter leurs points reportés séparément.
Le byte +11 paraît indiquer un nombre d'équipes, mais ne doit pas servir à
construire les calendriers des carrières existantes : les effectifs et règles
copiés dans une carrière peuvent diverger des tables actuellement installées.

La lecture fraîche du `Coach.bin` de `data_s25262b.cpk` confirme aussi 17 355
octets empaquetés / 98 000 décompressés et l'empreinte inchangée
`bb22eff95370b658784f1a332e99bf30a3234428f58849be08099309cbd2a3ae`.

## Références de journées et rencontres programmées dans BAL

Des champs de compétition sont répétés toutes les **788** positions en octets.
Les ancrages ci-dessous décrivent précisément les champs observés ; ils ne
prétendent pas nommer les autres champs ou le début complet de la structure.

- Premier identifiant tournoi u16 LE à **2 040 080**, capacité observée 300.
- Nom UTF-8 immédiatement après l'identifiant, champ de 116 octets.
- Tableau de 58 références u32 LE à **identifiant +136** ; valeurs inutilisées
  `0xffffffff`. Ligue 1 : 34 références **114 à 147**.
- Première rencontre de la première journée à **2 276 484**. Une référence de
  journée ajoute `référence × 520`. Chaque journée contient jusqu'à 16 rencontres
  espacées de 32 octets.
- Dans une rencontre, les u32 à +0 et +4 désignent les équipes. Les 14 bits bas
  donnent l'indice de l'équipe dans la carrière ; les bits hauts son identifiant
  dans la base. Exemple Paris FC : indice 73 / identifiant 4211.
- À +8, les 16 bits bas portent l'identifiant de rencontre. À +12 : tournoi dans
  les 16 bits bas, indice local de journée dans les bits 16 à 21, emplacement de
  rencontre dans les bits 22 à 25.
- Les quatre mots suivants ne livrent aucun score exploitable dans les copies
  observées, même pour des matchs déjà joués. Ces données constituent ici le
  **programme**. Les résultats continuent à venir des lignes vérifiées à +744
  de chaque bloc équipe.

`season_schedule.py` vérifie toutes ces correspondances et exige une rencontre
à domicile et une à l'extérieur pour chaque paire d'équipes. Il exige aussi
que les membres correspondent exactement aux résultats de la même copie.
Une journée vide, une référence répétée/hors limites, une identité incohérente,
un participant répété ou une phase complexe provoquent un refus.

## Vérifications sur les quatre copies

Les copies des 2 septembre 2025, 24 octobre 2025, 21 février 2026 et
18 novembre 2025 passent les contrôles pour ces 14 compétitions. Cela ne
présume pas qu'elles appartiennent toutes à une même branche chronologique.

| Tournoi natif | Nom installé | Journées | Équipes | Matchs programmés par équipe |
| --- | --- | ---: | ---: | ---: |
| 17 | Premier League | 38 | 20 | 38 |
| 18 | Serie A TIM | 38 | 20 | 38 |
| 19 | LaLiga | 38 | 20 | 38 |
| 20 | Ligue 1 | 34 | 18 | 34 |
| 21 | Eredivisie | 34 | 18 | 34 |
| 22 | Liga Portugal Betclic | 34 | 18 | 34 |
| 50 | Bundesliga | 34 | 18 | 34 |
| 79 | EFL Championship | 46 | 24 | 46 |
| 80 | LaLiga 2 | 42 | 22 | 42 |
| 81 | Ligue 2 BKT | 42 | 21 | **40** |
| 82 | Serie BKT | 38 | 20 | 38 |
| 116 | Mir Russian Premier Liga | 30 | 16 | 30 |
| 117 | Super League | 26 | 14 | 26 |
| 118 | Trendyol Süper Lig | 34 | 18 | 34 |

La Ligue 2 illustre une distinction indispensable : avec 21 participants, les
42 journées incluent des journées de repos. **Compter les références de journées
donnerait un seuil de fin de championnat faux.** Le lecteur compte réellement
les apparitions dans les rencontres programmées et obtient 40 matchs par équipe.
Le nom « Super League » est celui du jeu ; cette table n'est pas une description
des règles sportives réelles actuelles.

Au 18 novembre, les 18 équipes de Ligue 1 ont joué 9 matchs sur 34. Aucun des
14 championnats n'est terminé dans les quatre copies. Les rapports détaillés sont
privés : `season-database-samples/verified-native-schedules-20260909.json`.
Six tests synthétiques supplémentaires passent, dont les journées de repos et
les refus de références, identités, membres et nombres de matchs incohérents.

## Utilisation possible et limite restante

`verified_league_rule(data, snapshot, competition_id)` produit un objet compatible
avec `require_completed_leagues`. On peut donc désormais vérifier la fin d'un
de ces **championnats** en exigeant que chaque nombre de matchs réellement joués
atteigne celui du programme natif. L'empreinte de la même copie est obligatoire.
Le calendrier Windows ou le changement d'année ne participent pas à cette preuve.

Cela ne prouve pas le passage de saison global de la carrière. Les coupes peuvent
continuer après un championnat et les championnats ont des échéances différentes.
La boucle de coachs doit donc définir ses événements par championnat, avec un
checkpoint par événement, ou attendre une condition globale explicitement définie.
L'empreinte de programme identifie son contenu, **pas à elle seule l'année de
saison** : un futur tirage peut réutiliser les mêmes rencontres.

Le plus petit échantillon encore manquant pour valider une frontière native de
saison est une copie après la dernière journée d'un championnat, puis une copie
de la même carrière après génération de la saison suivante. Il faut y vérifier
le renouvellement des programmes et la remise à zéro des résultats avant de
déclarer le passage de saison automatiquement validé en jeu. Les champs d'année
voisins des noms de compétition ne sont pas interprétés faute de cette comparaison.
