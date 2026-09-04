# Publication des mises à jour STRYKER

STRYKER utilise `electron-updater` avec les installateurs NSIS produits par `electron-builder`.

**À chaque lancement, STRYKER cherche une mise à jour.** S’il en trouve une, il l’annonce aussitôt dans une boîte de dialogue : « La version X est disponible » — *Mettre à jour maintenant* / *Plus tard*.

En acceptant, l’installateur est téléchargé puis appliqué, et l’application redémarre sur la nouvelle version. En refusant, rien n’est téléchargé : la proposition reviendra au prochain lancement, et la page **Paramètres → Mise à jour** permet de la déclencher à tout moment.

Le téléchargement n’est jamais lancé sans accord : l’installateur pèse environ 250 Mo.

## Préparer une version

1. Augmenter la version dans `package.json` et `package-lock.json`, ainsi que la valeur de secours `APP_VERSION` dans `src/components/DesktopApp.tsx`.
2. Utiliser le flux GitHub Releases STRYKER par défaut, ou définir `STRYKER_UPDATE_URL` vers une autre adresse HTTPS permanente.
3. Construire l’installateur.

```powershell
npm run check
npm test
npm run package:win
```

Sans `STRYKER_UPDATE_URL`, le build utilise `https://github.com/Itsadam99/stryker-football-life/releases/latest/download`. Pour un miroir privé, définissez une adresse HTTPS stable **avant** l’empaquetage : elle est inscrite dans `app-update.yml` au moment du build.

## Publier une version

```powershell
npm run release:check   # contrôle le lot sans rien envoyer
npm run release         # crée la release GitHub et téléverse les trois fichiers
```

Le script publie ensemble, sur le tag `v<version>` :

- `STRYKER-Setup-x64.exe` ;
- `STRYKER-Setup-x64.exe.blockmap` ;
- `latest.yml`.

`latest.yml` est le manifeste que lit `electron-updater` : il porte la version, la taille et l’empreinte SHA-512 attendue. **Publier l’installateur sans lui coupe silencieusement les mises à jour de tout le parc** — l’application ne verra jamais la nouvelle version. C’est la raison d’être du script : il refuse de publier si le manifeste manque, s’il annonce une autre version que `package.json`, ou si la taille décrite ne correspond pas à l’installateur présent. En cas de refus, relancez `npm run package:win` : le lot est périmé.

Republier un tag existant remplace les fichiers (`--clobber`) au lieu d’échouer, ce qui permet de corriger une version mal publiée.

## Sécurité de diffusion

Pour une diffusion publique, signez toutes les versions Windows avec le même certificat Authenticode d’éditeur. Ne désactivez pas la vérification de signature de `electron-updater`. Servez exclusivement les fichiers par HTTPS et conservez les anciennes versions le temps que les téléchargements en cours se terminent.

Rien n’est téléchargé ni installé sans accord explicite. Si une mise à jour a été téléchargée puis laissée de côté, `electron-updater` la conserve et l’applique à la fermeture normale de l’application. Aucune version n’est appliquée pendant que l’utilisateur travaille.

## Vérifier que le mécanisme est vivant

`resources/app-update.yml`, dans le dossier d’installation, doit contenir une `url:` HTTPS ; sans elle, l’updater se désactive et la page Paramètres affiche « Aucun serveur de mises à jour configuré ». Le dossier `%LOCALAPPDATA%\stryker-football-life-updater` conserve la trace du dernier téléchargement : sa présence prouve qu’une mise à jour a bien été récupérée par ce canal.
