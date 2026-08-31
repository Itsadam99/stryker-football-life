# STRYKER Hub

STRYKER sépare désormais clairement les ressources externes des paquets réellement hébergés. Un paquet hébergé suit le cycle suivant :

1. le créateur remplit la fiche **Publier un mod** et confirme son droit de redistribution ;
2. le navigateur envoie le ZIP au dépôt sans le charger entièrement en mémoire ;
3. le serveur refuse les chemins dangereux, les fichiers exécutables, les archives démesurées et les structures non reconnues ;
4. la proposition reste privée dans `pending_review` ;
5. un modérateur peut l’installer dans STRYKER pour le contrôler, le refuser ou le publier ;
6. après publication seulement, la fiche et son téléchargement apparaissent dans `/api/catalog` ;
7. l’application recalcule l’empreinte SHA-256 après téléchargement avant d’installer le contenu.

Les fichiers du dépôt se trouvent sous `%LOCALAPPDATA%\STRYKER\hub` dans l’application locale. `STRYKER_DATA_DIR` permet de choisir une racine persistante différente sur un serveur.

Les paquets livrés avec l’application sont décrits dans `bundled-mods/catalog.json`. Leur empreinte SHA-256 est contrôlée au démarrage avant qu’ils apparaissent dans le catalogue. L’autorisation de redistribution de chaque paquet doit être vérifiée avant une diffusion publique de l’installateur.

Les archives tierces `bundled-mods/*.zip` restent hors du dépôt Git public : elles dépassent souvent la limite de taille GitHub et peuvent être soumises aux droits de leurs auteurs. Un mainteneur autorisé les place localement avant l’empaquetage. L’installateur de Release peut alors les contenir si leur redistribution a bien été autorisée.

## Installation depuis le site

Le bouton **Installer avec STRYKER** utilise un lien de la forme :

```text
stryker://install/<id-du-mod>?repository=https%3A%2F%2Fmods.example.org
```

L’application n’accepte que les dépôts HTTPS. HTTP est toléré uniquement pour `localhost` pendant le développement. La fiche, le ZIP et son empreinte doivent provenir du même domaine.

## Hébergement public

Le dépôt intégré constitue le moteur fonctionnel et le parcours complet de publication. Avant une ouverture publique, l’exploitant doit placer le service derrière HTTPS et ajouter l’infrastructure opérationnelle adaptée au trafic : comptes créateurs, authentification séparée des modérateurs, limitation distribuée, analyse antivirus, stockage objet, sauvegardes, journal d’audit, traitement des signalements et politique de retrait. Ces éléments dépendent de l’hébergeur et des comptes choisis ; ils ne sont pas simulés dans l’application desktop.

Le serveur local reste volontairement lié à `127.0.0.1` par défaut. Il ne devient pas publiquement accessible sans une configuration d’hébergement explicite.

Le mode serveur public s’active explicitement avec les variables suivantes :

```text
STRYKER_HUB_PUBLIC=1
STRYKER_HOST=0.0.0.0
STRYKER_DATA_DIR=D:\donnees-persistantes\stryker
STRYKER_ADMIN_TOKEN=<secret aléatoire d’au moins 32 caractères>
```

Dans ce mode, la création d’une proposition reste publique, mais toutes les mutations de modération exigent le secret administrateur dans `X-STRYKER-Admin-Token`. Ce secret n’est jamais renvoyé par `/api/session`.
