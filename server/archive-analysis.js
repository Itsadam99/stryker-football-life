import fs from "node:fs";
import path from "node:path";

// Deterministic structure detection: no network, AI, or execution of supplied scripts.
export function analyzeArchive(extractRoot, { walkFiles, relativeFiles, findDirectoriesNamed }) {
  const components = [];
  const allFiles = walkFiles(extractRoot);
  const inside = (parent, file) => file === parent || file.startsWith(parent + path.sep);
  const contentRoots = findDirectoriesNamed(extractRoot, "content", 5);
  const moduleRoots = findDirectoriesNamed(extractRoot, "modules", 5);
  const resourceRoots = [...new Set(["common", "asset"].flatMap((name) =>
    findDirectoriesNamed(extractRoot, name, 7).map((directory) => path.dirname(directory))))]
    .filter((root) => ![...contentRoots, ...moduleRoots].some((parent) => inside(parent, root)))
    .sort((a, b) => a.length - b.length);
  const selectedRoots = [];
  for (const root of resourceRoots) {
    if (selectedRoots.some((parent) => inside(parent, root))) continue;
    selectedRoots.push(root);
    const files = relativeFiles(root);
    if (files.length) components.push({
      type: "livecpk", root: path.relative(extractRoot, root), files,
      ...(files.every((file) => /^asset\/model\/character\/face\/real\//i.test(file)) ? { target: "football-life-livecpk-root" } : {}),
    });
  }
  for (const root of contentRoots) {
    const files = relativeFiles(root);
    if (files.length) components.push({ type: "sider", root: path.relative(extractRoot, root), target: "content", files });
  }
  // Only declarations are read; never apply launch commands or execute the archive.
  const iniFiles = allFiles.filter((file) => path.basename(file).toLowerCase() === "sider.ini");
  const declaredModules = iniFiles.flatMap((file) => [...fs.readFileSync(file, "utf8").matchAll(
    /^\s*lua\.module\s*=\s*["']([^"']+)["']/gm)].map((match) => match[1].replace(/\\/g, "/")));
  const luaFiles = allFiles.filter((file) => /\.lua$/i.test(file)
    && !contentRoots.some((root) => inside(root, file)));
  const groups = new Map();
  for (const file of luaFiles) {
    const root = moduleRoots.find((directory) => inside(directory, file)) || path.dirname(file);
    const files = groups.get(root) || [];
    files.push(file);
    groups.set(root, files);
  }
  // Separate modules directories can represent mutually exclusive variants.
  if (groups.size > 1) throw new Error("Plusieurs ensembles de modules Lua sont présents. Importez chaque variante séparément.");
  for (const [root, files] of groups) {
    const relative = (file) => path.relative(root, file).replace(/\\/g, "/");
    const detected = files.filter((file) => {
      if (declaredModules.length) return declaredModules.some((entry) => entry.toLowerCase() === relative(file).toLowerCase());
      const source = fs.readFileSync(file, "utf8").replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\r\n]*/g, "");
      return /(?:function\s+\w+\.init\s*\(|\w+\.init\s*=|\binit\s*=\s*(?:function|\w+))/.test(source)
        && /\breturn\s+(?:\w+|\{)/.test(source);
    }).map(relative);
    const entrypoints = declaredModules.length
      ? declaredModules.map((entry) => detected.find((file) => file.toLowerCase() === entry.toLowerCase()))
      : detected;
    if (!entrypoints.length || entrypoints.some((entry) => !entry)) throw new Error("Les points d’entrée Lua ne sont pas identifiables ou des modules déclarés sont absents. Importez la version complète du mod.");
    components.push({ type: "lua", root: path.relative(extractRoot, root), entrypoints: [...new Set(entrypoints)] });
  }
  const editFiles = allFiles.filter((file) => path.basename(file).toUpperCase() === "EDIT00000000");
  if (editFiles.length > 1) throw new Error("Plusieurs Option Files sont présents. Importez uniquement la variante souhaitée.");
  if (editFiles.length === 1) {
    const saveRoot = path.join(extractRoot, ".stryker-detected-save");
    fs.mkdirSync(saveRoot);
    fs.copyFileSync(editFiles[0], path.join(saveRoot, "EDIT00000000"));
    components.push({ type: "save", root: path.relative(extractRoot, saveRoot), target: "football-life-save", files: ["edit00000000"] });
  }
  if (!components.length) throw new Error("Structure de mod non reconnue : aucun dossier common, Asset, content, module Sider ou Option File. Importez l’archive complète du mod.");
  if (allFiles.some((file) => /\.cpk$/i.test(file))) throw new Error("Cette archive contient des fichiers CPK. Leur installation n’est pas encore prise en charge par STRYKER.");
  return components;
}
