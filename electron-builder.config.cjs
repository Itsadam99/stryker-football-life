const packageJson = require("./package.json");

const configuredUrl = String(process.env.STRYKER_UPDATE_URL || "").trim().replace(/\/+$/, "");
const updateUrl = configuredUrl || "https://github.com/Itsadam99/stryker-football-life/releases/latest/download";

// Un dépôt synchronisé (OneDrive, Dropbox…) fait échouer l'empaquetage : le
// client pose des verrous sur l'arborescence pendant qu'electron-builder la
// crée, et le renommage de win-unpacked se solde par un EPERM. Bâtir ailleurs
// évite aussi d'envoyer 250 Mo dans le cloud à chaque build.
//   set STRYKER_BUILD_DIR=%LOCALAPPDATA%\stryker-build
const buildDir = String(process.env.STRYKER_BUILD_DIR || "").trim();

module.exports = {
  ...packageJson.build,
  ...(buildDir ? { directories: { ...packageJson.build.directories, output: buildDir } } : {}),
  publish: [
    {
      provider: "generic",
      url: updateUrl,
      channel: "latest",
    },
  ],
};
