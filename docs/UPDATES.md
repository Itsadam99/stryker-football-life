# Publication des mises à jour STRYKER

STRYKER utilise `electron-updater` avec les installateurs NSIS produits par `electron-builder`. L’application vérifie automatiquement le flux au démarrage, affiche la nouvelle version, télécharge l’installateur à la demande, puis propose **Installer et redémarrer**.

## Préparer une version

1. Augmenter la version dans `package.json`, `package-lock.json`, `server/index.js` et la valeur de secours de `DesktopApp.tsx`.
2. Utiliser le flux GitHub Releases STRYKER par défaut, ou définir une autre adresse HTTPS permanente.
3. Construire l’installateur.

```powershell
npm run check
npm test
npm run package:win
```

Sans `STRYKER_UPDATE_URL`, le build utilise `https://github.com/Itsadam99/stryker-football-life/releases/latest/download`. Pour un miroir privé, définissez une adresse HTTPS stable avant l’empaquetage.

## Publier une version

Téléverser ensemble dans le dossier HTTPS configuré :

- `latest.yml` ;
- `STRYKER-Setup-<version>-x64.exe` ;
- `STRYKER-Setup-<version>-x64.exe.blockmap`.

Le fichier `latest.yml` contient la version, la taille et l’empreinte SHA-512 attendue. Il doit toujours être publié après l’installateur et le blockmap afin qu’aucun client ne découvre une version dont les fichiers ne sont pas encore disponibles.

## Sécurité de diffusion

Pour une diffusion publique, signez toutes les versions Windows avec le même certificat Authenticode d’éditeur. Ne désactivez pas la vérification de signature de `electron-updater`. Servez exclusivement les fichiers par HTTPS et conservez les anciennes versions le temps que les téléchargements en cours se terminent.

Une mise à jour est installée uniquement après action de l’utilisateur. Si elle est téléchargée mais pas immédiatement appliquée, `electron-updater` la conserve et peut aussi l’installer lors d’une fermeture normale de l’application.
