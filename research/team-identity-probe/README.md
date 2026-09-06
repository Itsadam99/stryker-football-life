# Diagnostic tactiques STRYKER

Ce module ne modifie ni le gameplay, ni les tactiques, ni les entraîneurs. Il observe les événements documentés de Sider pour préparer le développement du mod décrit dans docs/TEAM_IDENTITIES_AND_COACHES.md. Pas de lecture/écriture de pointeurs mémoire, pas d’accès aux sauvegardes, pas de connexion réseau.

L’archive avec stryker.mod.json peut être importée dans STRYKER comme un mod local. Autre méthode : placer modules/team-identity-probe.lua dans le dossier modules du Sider actif et ajouter lua.module = "team-identity-probe.lua" à son sider.ini. Sider 7.3 ou supérieur est requis. match-stats.enabled = 1 permet les instantanés de score/horloge ; le module fonctionne sans cette bibliothèque mais le signale.

Pour observer : fermer puis relancer le jeu avec Sider, charger un amical ou une carrière, ouvrir le plan de jeu et lancer un match. Le module écrit dans le sider.log existant, avec le préfixe [STRYKER-TACTICS-PROBE]. Faire les essais ML et BAL séparément et conserver le journal de chaque session avant de relancer le jeu. Ne pas envoyer un journal complet sur un service public : seuls les événements préfixés sont nécessaires ici.

Le journal indique les identifiants vus, les noms et tailles de ressources pertinentes, et quelques instantanés de score/horloge. Il ne mesure pas la possession ou les passes longues et n’identifie pas l’année ou la sauvegarde. Aucune transition n’est interprétée comme une fin de match ou une saison terminée. Au maximum 500 ressources distinctes et 2 000 événements par session ; la première tranche chargée d’une ressource suffit au recensement et ne représente pas nécessairement le fichier complet.

Désinstallation : désactiver/désinstaller dans STRYKER si importé par l’application. En installation manuelle, supprimer uniquement la ligne ajoutée et le fichier team-identity-probe.lua. Aucun résultat de carrière n’est à restaurer.

Tests hors jeu : test_probe.py utilise Lupa 2.8 et son interpréteur LuaJIT 2.1 (API Lua 5.1). Ils vérifient l’exécution des callbacks, l’absence de modifications du contexte, le traitement des statistiques absentes et la limitation des journaux. Ces essais ne remplacent pas un lancement avec le Sider réel.

Version 0.1.1 : correction de l’appel à pcall, absent des fonctions Lua exposées aux modules par Sider. Les tests chargent maintenant le module avec la liste restreinte des fonctions documentées. Une erreur de match.stats désactive les essais suivants pour la session, en laissant Sider journaliser la première erreur. Le correctif a également été observé dans le jeu : journal du 6 septembre 2026, Algérie–Maroc, trois instantanés de score/horloge et aucune erreur du diagnostic.

Depuis la racine du projet, node research/team-identity-probe/build-and-check.mjs construit l’archive dans artifacts/team-identity-research et vérifie son installation, activation/désactivation et désinstallation dans un jeu simulé isolé. Le test ne vise jamais le dossier du jeu réel.

inspect-database.py lit quatre tables déjà décompressées (--teams, --coaches, --tactics, --formations) et crée un inventaire JSON neuf (--output). Il vérifie tailles de lignes, unicité des identifiants et groupes de formation, et signale les correspondances absentes. Les bits de tactique restent bruts : aucune signification possession/pressing/passes longues n’est encore attribuée. Il n’écrit jamais dans les tables.

## Essai sur une copie de carrière BAL

`career_format.py` repère une équipe par nom exact unique et identifiant de coach attendu, contrôle la structure de quatre plans, et modifie uniquement leur octet de construction courte/longue dans une copie de données décodées. Le format a été observé dans deux états d’une même carrière FL26 26.2.0.3 ; ce n’est pas un éditeur universel et aucun offset ML n’est supposé compatible.

`build_career_trial.py` reçoit les six blocs décodés d’une copie, prépare un dossier neuf, attribue un titre de test, chiffre puis déchiffre le résultat avec les exécutables PES 2021 de [pesXdecrypter 6.0.0](https://github.com/the4chancup/pesXdecrypter/releases/tag/6.0.0). Il exige l’égalité exacte des six blocs après ce cycle et vérifie que les sources restent inchangées. Les outils externes et sauvegardes ne sont pas inclus dans Git. Ce script n’installe jamais lui-même de sauvegarde dans le jeu.

Exemple avec des dossiers de copies locales :

```powershell
python research/team-identity-probe/build_career_trial.py --decoded CHEMIN_COPIE_DECODEE --output NOUVEAU_DOSSIER --crypto-tools DOSSIER_PESX --team "Paris FC" --coach 101358 --title "STRYKER TEST - Paris FC"
```

Un essai a été ajouté manuellement au troisième emplacement BAL libre, sans remplacer les deux sauvegardes existantes. Son chargement et ses consignes affichées restent à vérifier dans FL. Un cycle de chiffrement correct ne prouve pas la validité en jeu.

## Simulation des entraîneurs hors jeu

`career_coaches.py` calcule un nouvel instantané JSON à partir d’un état de carrière et des résultats de **tous** les clubs en fin de saison. Contrats, renouvellements, mauvais résultats prolongés, retraites et entrants fictifs suivent la date explicitement fournie. Les résultats manquants, sélections nationales, doubles affectations et biographies réelles sans source sont refusés. Les seuils de performance/retraite sont des paramètres de prototype ; ils ne reproduisent pas encore la politique de chaque club.

Les préférences combinent huit dimensions du coach et du club, ainsi que les systèmes favoris du coach. Elles sont des intentions : aucun rôle de joueur, composition ou curseur PES n’est encore écrit par ce moteur. Aucune intention automatique n’est émise pour le club du joueur en ML ; elle est émise en BAL. Les âges fictifs ne servent jamais à compléter une biographie réelle inconnue. Le vivier fictif actuel emploie des noms de test et ne prétend pas identifier d’anciens joueurs du jeu.

Le moteur retourne une copie et utilise un hasard déterministe propre à la carrière. Un événement répété ne recrée pas de coachs ; repartir du même ancien instantané produit le même futur. **La liaison des instantanés aux fichiers du jeu, le calendrier interne, les résultats de toutes les équipes, les changements en cours de saison, les effets tactiques en match et la sélection des joueurs restent à implémenter.** Ce code est exclu de l’archive Sider de diagnostic et du catalogue public.

Tests des outils de carrière, sans dépendances Python externes :

```powershell
python -m unittest discover -s research/team-identity-probe -p "test_career*.py" -v
```

16 tests réussis, dont une population entièrement fictive de 749 clubs / 980 entraîneurs initiaux sur 25 saisons. Il s’agit d’une simulation de code, pas de 25 saisons jouées dans FL.
