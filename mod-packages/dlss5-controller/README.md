# STRYKER DLSS 5 Universal RTX Controller

Module Sider permettant de configurer RenoDX DLSS depuis un panneau dédié dans Football Life/PES 2021, sur GeForce RTX 20, 30, 40 et 50, sans ouvrir l'interface ReShade ni faire défiler les autres modules.

Ce ZIP ne contient pas ReShade, RenoDX, NVIDIA DLSS ou Streamline. Ces dépendances doivent être installées séparément depuis leurs sources amont avant d'utiliser le contrôleur.

## Compatibilité GPU automatique

- RTX 50 : conserver la DLL NVIDIA d'origine. STRYKER bloque le patch de compatibilité sur cette génération.
- RTX 40 : la DLL communautaire épinglée rétroporte les fonctions réservées à Blackwell.
- RTX 20 / RTX 30 : la DLL communautaire épinglée sélectionne une branche presque entièrement FP16 et limite l'utilisation des registres.

Pour les RTX 20/30/40, ouvrir **Paramètres > DLSS 5 Neural Rendering** dans STRYKER, cliquer sur **Sélectionner et installer**, puis choisir la dernière `nvngx_dlssnr.dll` du message épinglé :

<https://discord.com/channels/1408098019194310818/1543976771920330884>

Version actuellement acceptée : `310.8.0.0`  
SHA-256 : `e67dee209320cdafe0e93e45675d7aa34323a53acc57a72b2e40a181581c989a`

STRYKER refuse toute autre empreinte, sauvegarde la DLL présente en `nvngx_dlssnr.dll.stryker-original.bak` et permet de la restaurer. La DLL épinglée n'est pas incluse dans ce ZIP car il s'agit d'un binaire NVIDIA modifié dont la signature Authenticode n'est plus valide.

## Utilisation en jeu

1. Appuyer sur `F10` pour ouvrir directement **STRYKER DLSS 5 Controller**.
2. Utiliser les flèches `Haut` et `Bas` pour choisir un réglage.
3. Utiliser les flèches `Gauche` et `Droite` pour modifier et enregistrer sa valeur.
4. Appuyer sur `Entrée` pour relire la configuration actuelle, ou sur `F10` pour fermer.
5. Redémarrer Football Life pour appliquer le changement au moteur DLSS.

STRYKER place automatiquement ce contrôleur en premier dans l'overlay et réserve `F10` lors de son activation. La touche d'overlay précédente est restaurée si le mod est désactivé.

Les modes proposés suivent l'énumération Streamline : Jeu/automatique, Performance, Équilibré, Qualité, Ultra Performance, Ultra Qualité et DLAA.

Une sauvegarde `ReShade.ini.sider-dlss.bak` est créée avant chaque écriture.

Projet communautaire expérimental, à utiliser uniquement hors ligne.
