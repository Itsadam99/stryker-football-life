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

1. Lancer Football Life depuis STRYKER.
2. Appuyer sur `F10` : le **Centre de contrôle DLSS 5** de STRYKER s'affiche par-dessus le jeu.
3. Régler, puis **Appliquer**. Les changements DLSS prennent effet au lancement suivant.
4. `Origine` ouvre l'overlay RenoDX complet, qui applique ses réglages en direct.

STRYKER ne capte `F10` que pendant une partie et seulement si ce paquet est installé : un raccourci global permanent volerait la touche aux autres applications. C'est aussi pour cela que l'overlay RenoDX est déplacé sur `Origine` à l'installation, et rendu à `F10` si le paquet est retiré.

Le module Lua ne dessine rien dans l'overlay de Sider : il sert de marqueur d'installation.

Une sauvegarde `ReShade.ini.stryker-dlss.bak` est créée avant la première écriture.

Projet communautaire expérimental, à utiliser uniquement hors ligne.
