# DLSS 5 Neural Rendering pour Football Life

Cette intégration est communautaire, non officielle et expérimentale. Elle vise Football Life 2026 / PES 2021 en DirectX 11 sur les GeForce RTX 20, 30, 40 et 50. Le test local du 1er septembre 2026 a confirmé le chargement de ReShade 6.8.0, de RenoDX DLSS SF 0.1, de NVIDIA NGX et du pont DirectX 11 vers DirectX 12 sur une RTX 5060. Les branches RTX 20/30/40 sont préparées et testées automatiquement avec des GPU simulés, mais n'ont pas été validées matériellement sur cette machine.

STRYKER ne redistribue aucun exécutable ni aucune DLL de ce montage. ReShade demande de renvoyer les utilisateurs vers son site, et les bibliothèques NVIDIA ne doivent pas être republiées comme un pack autonome. La fiche du catalogue ouvre donc les sources amont et conserve une installation manuelle.

## Prérequis

- Football Life 2026 ou PES 2021 configuré en DirectX 11.
- Une GeForce RTX série 20, 30, 40 ou 50 et un pilote NVIDIA récent.
- Une copie de sauvegarde du dossier du jeu.
- Utilisation hors ligne uniquement. Ne pas employer d'injection graphique avec un mode en ligne ou un anti-triche.

## Sources

- ReShade 6.8.0 avec prise en charge des add-ons : <https://reshade.me/>
- RenoDX DLSS SF 0.1 et fichiers DLSS/Streamline : <https://github.com/RankFTW/rhi-repo/releases/tag/renodx-dlss-SF-0.1>
- Projet RHI : <https://github.com/RankFTW/RHI>
- DLL de compatibilité RTX 20/30/40, depuis le message épinglé : <https://discord.com/channels/1408098019194310818/1543976771920330884>

Empreintes de la version testée :

- `ReShade_Setup_6.8.0_Addon.exe` : `AFE4C8F13048306307983B8B3D41D5BF00A86820440B0E57DEA10950E1176445`
- `renodx-dlss_SF_0.1.zip` : `5445F9D4BF302A0BD42388C617BF9DDB02C5B25A84CB7DC3E17684DE452A0100`
- `DLSS310.8.0-Streamline2.13.zip` : `3FDB7CB25250259332550F419DBAC516A2EBA778D8592DA75CB2FE8ABFC781D8`
- `nvngx_dlssnr.dll` patchée 310.8.0.0 pour RTX 20/30/40 : `E67DEE209320CDAFE0E93E45675D7AA34323A53ACC57A72B2E40A181581C989A`

Ces empreintes sont propres aux versions indiquées. Une mise à jour amont aura normalement une autre empreinte.

## Installation manuelle

1. Fermer Football Life et Sider.
2. Installer ReShade 6.8.0 Add-on pour l'exécutable du jeu et choisir DirectX 10/11/12. Pour Football Life 2026, le fichier créé à côté de `FL_2026.exe` est normalement `d3d11.dll`.
3. Extraire `renodx-dlss.addon64` à côté de `d3d11.dll`.
4. Extraire les DLL DLSS et Streamline du paquet amont au même endroit.
5. Retirer ou renommer tout ancien `renodx-dlss5.addon64` : les deux add-ons ne doivent pas être chargés ensemble.
6. Ajouter les réglages suivants dans `ReShade.ini` :

```ini
[ADDON]
LoadFromDllMain=renodx-dlss.addon64

[RENODX-DLSS]
DirectNeuralRenderingEnabled=1
DirectNeuralRenderingForceNgxCore=1
DirectNeuralRenderingHookPoint=2
DirectNeuralRenderingHookPointOrder=2
DLSSAutoExposure=0
DLSSPath=nvngx_dlss.dll
DLSSQualityMode=0
StreamlinePath=sl.interposer.dll
```

La valeur `2` correspond au hook `On Present` dans la version SF 0.1 testée. L'add-on peut normaliser ou réordonner ces lignes au premier lancement.

## Vérification

Après le lancement, ouvrir l'overlay ReShade avec la touche `Home` et vérifier la présence de l'add-on RenoDX DLSS. Dans `ReShade.log`, les lignes suivantes confirment que le pont technique est chargé :

- `registered addon "RenoDX DLSS"`
- `using force-loaded NVIDIA parameter provider`
- `creating device-only D3D12 proxy from D3D11 host`
- `RenoDX DLSS first present`

Si l'image devient noire, instable ou présente de gros artefacts, désactiver Neural Rendering dans l'overlay et redémarrer le jeu.

## Contrôle avec STRYKER 3.6

STRYKER 3.6 ajoute un panneau **DLSS 5 Neural Rendering** dans la page Paramètres. Il détecte les fichiers installés et la génération du GPU, permet d'activer ou désactiver le rendu neuronal, de choisir le niveau de qualité et de régler l'exposition automatique. Football Life doit être fermé pendant une modification effectuée depuis STRYKER. Une sauvegarde `ReShade.ini.stryker-dlss.bak` est créée avant l'écriture.

Sur RTX 20/30/40, le panneau propose **Sélectionner et installer**. L'utilisateur télécharge lui-même la DLL du message épinglé ; STRYKER exige la version 310.8.0.0 et son SHA-256 exact, sauvegarde la DLL d'origine sous `nvngx_dlssnr.dll.stryker-original.bak`, copie la version vérifiée puis permet une restauration. Sur RTX 50, ce bouton est désactivé et la branche NVIDIA d'origine est conservée. La DLL patchée porte une signature NVIDIA devenue `HashMismatch` après modification et n'est donc jamais incluse dans le ZIP public.

Le catalogue contient également **STRYKER DLSS 5 Universal RTX Controller**, un petit ZIP Lua installable automatiquement. STRYKER le place en première position et affecte `F10` à son panneau dédié : il n'est plus nécessaire d'ouvrir l'overlay avec Espace ni de faire défiler les modules. Utiliser :

- `F10` pour ouvrir ou fermer directement le panneau DLSS ;
- les flèches `Haut` / `Bas` pour sélectionner Neural Rendering, le niveau de qualité ou l'exposition automatique ;
- les flèches `Gauche` / `Droite` pour changer la valeur et l'enregistrer ;
- `Entrée` pour relire la configuration présente dans `ReShade.ini`.

La touche Sider précédente est sauvegardée et restaurée si le contrôleur est désactivé ou désinstallé dans STRYKER.

Le contrôleur en jeu sauvegarde `ReShade.ini.sider-dlss.bak`. Les changements prennent effet au prochain lancement, car Sider ne peut pas recréer en toute sécurité le moteur NVIDIA déjà chargé pendant une partie.

Le ZIP Controller est publié sous licence MIT et ne contient que le module Lua, son manifeste, son guide et sa licence. Il ne contient aucune DLL tierce : les dépendances ReShade/RenoDX/NVIDIA restent à obtenir depuis leurs sources respectives.

## Désinstallation

Fermer le jeu puis restaurer la sauvegarde de `ReShade.ini`. Supprimer uniquement les fichiers ajoutés par cette installation : `d3d11.dll`, `renodx-dlss.addon64`, les fichiers `nvngx_*.dll`, les fichiers `sl.*.dll`, `ReShade.ini`, `ReShade.log` et `ReShadePreset.ini`. Ne jamais supprimer un fichier qui existait avant l'installation sans restaurer sa sauvegarde.
