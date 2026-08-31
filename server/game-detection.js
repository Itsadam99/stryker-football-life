import fs from "fs";
import path from "path";

const GAME_EXECUTABLES = [
  { file: "FL 2026 start.exe", version: "SP Football Life 2026" },
  { file: "FL_2026 start.exe", version: "SP Football Life 2026" },
  { file: "FL_2026.exe", version: "SP Football Life 2026" },
  { file: "FL 2025 start.exe", version: "SP Football Life 2025" },
  { file: "FL_2025 start.exe", version: "SP Football Life 2025" },
  { file: "FL_2025.exe", version: "SP Football Life 2025" },
  { file: "FL 2024 start.exe", version: "SP Football Life 2024" },
  { file: "FL_2024 start.exe", version: "SP Football Life 2024" },
  { file: "FL_2024.exe", version: "SP Football Life 2024" },
  { file: "PES2021.exe", version: "eFootball PES 2021" },
];

const SIDER_INI_CANDIDATES = [
  path.join("SiderAddons", "sider.ini"),
  path.join("Sider", "sider.ini"),
  path.join("sider", "sider.ini"),
  "sider.ini",
];

const SIDER_EXE_CANDIDATES = [
  path.join("SiderAddons", "sider.exe"),
  path.join("Sider", "sider.exe"),
  path.join("sider", "sider.exe"),
  "sider.exe",
  "Sider.exe",
];

function findCaseInsensitive(directory, relativeCandidate) {
  const parts = relativeCandidate.split(/[\\/]+/);
  let current = directory;

  for (const part of parts) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) return null;
    const match = fs.readdirSync(current).find((entry) => entry.toLowerCase() === part.toLowerCase());
    if (!match) return null;
    current = path.join(current, match);
  }

  return current;
}

export function findPreferredFootballLifeLauncher(directory) {
  if (!directory || typeof directory !== "string") return null;
  for (const candidate of GAME_EXECUTABLES.filter(({ file }) => / start\.exe$/i.test(file))) {
    const fullPath = findCaseInsensitive(directory, candidate.file);
    if (fullPath && fs.statSync(fullPath).isFile()) return fullPath;
  }
  return null;
}

function inspectDirectory(directory) {
  const game = GAME_EXECUTABLES
    .map((candidate) => ({ ...candidate, fullPath: findCaseInsensitive(directory, candidate.file) }))
    .find((candidate) => candidate.fullPath && fs.statSync(candidate.fullPath).isFile());

  if (!game) return null;

  const siderPath = SIDER_INI_CANDIDATES
    .map((candidate) => findCaseInsensitive(directory, candidate))
    .find((candidate) => candidate && fs.statSync(candidate).isFile());

  const siderExecutablePath = SIDER_EXE_CANDIDATES
    .map((candidate) => findCaseInsensitive(directory, candidate))
    .find((candidate) => candidate && fs.statSync(candidate).isFile());

  return {
    gamePath: directory,
    gameExecutablePath: game.fullPath,
    siderPath: siderPath || "",
    siderExecutablePath: siderExecutablePath || "",
    detectedVersion: game.version,
    missing: [
      ...(!siderPath ? ["sider.ini"] : []),
    ],
  };
}

export function detectAtPath(selectedPath) {
  if (!selectedPath || typeof selectedPath !== "string") {
    throw new Error("Sélectionnez le dossier ou l’exécutable de Football Life/PES 2021.");
  }

  const resolved = path.resolve(selectedPath.trim());
  if (!fs.existsSync(resolved)) {
    throw new Error("Le chemin sélectionné n’existe pas.");
  }

  let root = fs.statSync(resolved).isFile() ? path.dirname(resolved) : resolved;
  let inspection = inspectDirectory(root);

  if (!inspection) {
    const childDirectories = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .slice(0, 100);

    for (const child of childDirectories) {
      const childPath = path.join(root, child.name);
      inspection = inspectDirectory(childPath);
      if (inspection) break;
    }
  }

  if (!inspection) {
    throw new Error(
      "Aucune installation valide détectée. STRYKER attend FL 2026 start.exe, FL_2026.exe, une version antérieure de Football Life ou PES2021.exe. Aucun fichier ne sera créé automatiquement."
    );
  }

  if (!inspection.siderPath) {
    throw new Error(
      `${inspection.detectedVersion} a été trouvé, mais aucun sider.ini valide n’est présent. Installez ou configurez Sider avant de lier le jeu.`
    );
  }

  return inspection;
}

export function detectCommonInstallation() {
  const candidates = [
    "C:\\Program Files (x86)\\SP Football Life 2026",
    "C:\\Program Files\\SP Football Life 2026",
    "C:\\Program Files (x86)\\SP Football Life 2025",
    "C:\\Program Files\\SP Football Life 2025",
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\eFootball PES 2021",
    "C:\\Program Files\\Steam\\steamapps\\common\\eFootball PES 2021",
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      return detectAtPath(candidate);
    } catch {
      // Continue with the next exact candidate.
    }
  }

  throw new Error("Aucune installation compatible n’a été trouvée dans les emplacements Windows habituels.");
}

export { GAME_EXECUTABLES };
