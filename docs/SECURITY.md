# Modèle de sécurité

STRYKER traite les archives de mods et les chemins de jeu comme des entrées non fiables.

## Frontières

- Le serveur écoute uniquement sur `127.0.0.1`.
- Les navigateurs d’origine distante sont refusés ; les mutations exigent en plus un jeton de session éphémère.
- Electron n’expose ni Node.js ni API système à la page. Les liens externes sont ouverts par le navigateur Windows.
- La configuration privée et l’activité restent dans `%LOCALAPPDATA%\STRYKER` et ne sont pas exposées par le site public.

## Archives

- ZIP uniquement pour l’installation automatique.
- Rejet des chemins absolus, traversées `..`, liens symboliques, archives trop grandes et extensions exécutables.
- Calcul SHA-256 de l’archive et détection des doublons.
- Staging hors du dossier du jeu ; aucune archive ne remplace directement un fichier du jeu.

Ces contrôles réduisent le risque mais ne constituent pas un antivirus. Un fichier téléchargé doit toujours provenir de la page de l’auteur et peut être analysé avec la protection Windows avant import.

## Déploiement et récupération

- Chaque changement de `sider.ini` crée une sauvegarde horodatée.
- Seul le bloc marqué STRYKER est régénéré ; les lignes manuelles externes sont préservées.
- Le dossier Lua géré est préparé séparément puis échangé. En cas d’échec, l’ancien déploiement et `sider.ini` sont restaurés.
- Les composants Sider ne peuvent cibler que `content`. Chaque fichier préexistant est sauvegardé avant remplacement et restauré lors d’une désactivation ou désinstallation.
- Une désinstallation déplace le staging dans la corbeille STRYKER.

## Limites intentionnelles

- Aucun identifiant utilisateur ni service de compte n’est stocké.
- Aucun téléchargement silencieux, télémétrie, mise à jour forcée ou exécution automatique d’un installateur de mod.
- Les signatures de mises à jour applicatives ne sont pas encore configurées ; l’interface l’indique explicitement.
