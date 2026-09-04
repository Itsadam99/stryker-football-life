# Publication des mises à jour STRYKER

STRYKER utilise `electron-updater` avec les installateurs NSIS produits par `electron-builder`.

Au démarrage, l’application interroge le flux, puis **télécharge la mise à jour en tâche de fond** dès qu’une nouvelle version existe. Une fois le téléchargement terminé, STRYKER propose de redémarrer tout de suite ; si l’utilisateur décline, la mise à jour s’installe d’elle-même à la fermeture suivante. Autrement dit : **il suffit de relancer STRYKER pour être à jour**, sans avoir eu à cliquer sur quoi que ce soit.

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

Le téléchargement est automatique, mais **l’installation reste liée à un redémarrage** : elle a lieu soit sur acceptation explicite, soit à la fermeture normale de l’application. Aucune version n’est appliquée pendant que l’utilisateur travaille.
