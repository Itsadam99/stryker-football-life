# Diagnostic tactiques STRYKER

Ce module ne modifie ni le gameplay, ni les tactiques, ni les entraîneurs. Il observe les événements documentés de Sider pour préparer le développement du mod décrit dans docs/TEAM_IDENTITIES_AND_COACHES.md. Pas de lecture/écriture de pointeurs mémoire, pas d’accès aux sauvegardes, pas de connexion réseau.

L’archive avec stryker.mod.json peut être importée dans STRYKER comme un mod local. Autre méthode : placer modules/team-identity-probe.lua dans le dossier modules du Sider actif et ajouter lua.module = "team-identity-probe.lua" à son sider.ini. Sider 7.3 ou supérieur est requis. match-stats.enabled = 1 permet les instantanés de score/horloge ; le module fonctionne sans cette bibliothèque mais le signale.

Pour observer : fermer puis relancer le jeu avec Sider, charger un amical ou une carrière, ouvrir le plan de jeu et lancer un match. Le module écrit dans le sider.log existant, avec le préfixe [STRYKER-TACTICS-PROBE]. Faire les essais ML et BAL séparément et conserver le journal de chaque session avant de relancer le jeu. Ne pas envoyer un journal complet sur un service public : seuls les événements préfixés sont nécessaires ici.

Le journal indique les identifiants vus, les noms et tailles de ressources pertinentes, et quelques instantanés de score/horloge. Il ne mesure pas la possession ou les passes longues et n’identifie pas l’année ou la sauvegarde. Aucune transition n’est interprétée comme une fin de match ou une saison terminée. Au maximum 500 ressources distinctes et 2 000 événements par session ; la première tranche chargée d’une ressource suffit au recensement et ne représente pas nécessairement le fichier complet.

Désinstallation : désactiver/désinstaller dans STRYKER si importé par l’application. En installation manuelle, supprimer uniquement la ligne ajoutée et le fichier team-identity-probe.lua. Aucun résultat de carrière n’est à restaurer.

Tests hors jeu : test_probe.py utilise Lupa 2.8 et son interpréteur LuaJIT 2.1 (API Lua 5.1). Ils vérifient l’exécution des callbacks, l’absence de modifications du contexte, le traitement des statistiques absentes et la limitation des journaux. Ces essais ne remplacent pas un lancement avec le Sider réel.

Depuis la racine du projet, node research/team-identity-probe/build-and-check.mjs construit l’archive dans artifacts/team-identity-research et vérifie son installation, activation/désactivation et désinstallation dans un jeu simulé isolé. Le test ne vise jamais le dossier du jeu réel.
