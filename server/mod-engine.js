import crypto from "crypto";
import fs from "fs";
import path from "path";
import { assertPathInside, sanitizeSegment } from "./paths.js";
import { inferCategory, isKitMap } from "./sider-manager.js";
import { extractZipSafely } from "./zip-extractor.js";
import { extractRarSafely } from "./rar-extractor.js";
import { expandPackedPayload } from "./packed-payload.js";
import { analyzeArchive } from "./archive-analysis.js";

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024 * 1024;
const MAX_FILES = 200_000;
const BLOCKED_EXECUTABLE_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".ps1", ".vbs",
  ".py", ".pyw", ".js", ".jse", ".wsf", ".wsh", ".hta", ".scr", ".jar", ".lnk", ".reg", ".sh", ".cpl", ".pif",
]);
const ALLOWED_CATEGORIES = new Set(["gameplay", "turf", "menu", "audio", "kit", "face", "scoreboard", "other"]);

function normalizeSiderOverlay(value) {
  if (!value || typeof value !== "object") return null;
  const toggleVkey = String(value.toggleVkey || "").trim().toLowerCase();
  if (toggleVkey !== "0x79") throw new Error("Le raccourci d’overlay déclaré n’est pas autorisé. Seul F10 (0x79) est accepté.");
  return { toggleVkey, primary: value.primary === true };
}

function cleanText(value, fallback, maxLength = 200) {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function walkFiles(root, { maxFiles = MAX_FILES } = {}) {
  const results = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Les liens symboliques ne sont pas acceptés dans les archives.");
      if (entry.isDirectory()) stack.push(fullPath);
      if (entry.isFile()) {
        results.push(fullPath);
        if (results.length > maxFiles) throw new Error(`Archive trop volumineuse : plus de ${maxFiles.toLocaleString("fr-FR")} fichiers.`);
      }
    }
  }
  return results;
}

function relativeFiles(root) {
  return walkFiles(root).map((file) => path.relative(root, file).replace(/\\/g, "/").toLowerCase());
}

function findDirectoriesNamed(root, targetName, maxDepth = 4) {
  const matches = [];
  const queue = [{ directory: root, depth: 0 }];
  while (queue.length > 0) {
    const { directory, depth } = queue.shift();
    if (depth > maxDepth) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.name.toLowerCase() === targetName.toLowerCase()) matches.push(fullPath);
      else queue.push({ directory: fullPath, depth: depth + 1 });
    }
  }
  return matches;
}

function findManifest(extractRoot) {
  const candidates = walkFiles(extractRoot, { maxFiles: MAX_FILES })
    .filter((file) => ["stryker.mod.json", "mod.json"].includes(path.basename(file).toLowerCase()))
    .sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);

  for (const candidate of candidates) {
    const explicit = path.basename(candidate).toLowerCase() === "stryker.mod.json";
    try {
      const manifest = JSON.parse(fs.readFileSync(candidate, "utf-8"));
      if (manifest && Array.isArray(manifest.components)) {
        return { manifest, manifestPath: candidate, baseDir: path.dirname(candidate) };
      }
      if (explicit) throw new Error("liste des composants absente");
    } catch (error) {
      if (explicit) throw new Error("Manifeste STRYKER invalide : " + error.message);
      // A community mod.json without STRYKER fields is treated as ordinary metadata.
    }
  }
  return null;
}

function validateManifestComponents(manifestInfo, extractRoot) {
  if (!manifestInfo.manifest.components.length) throw new Error("Le manifeste ne contient aucun composant installable.");
  return manifestInfo.manifest.components.map((component) => {
    if (!component || !["livecpk", "lua", "sider", "save"].includes(component.type)) {
      throw new Error("Le manifeste contient un type de composant non pris en charge.");
    }
    if (!component.root || typeof component.root !== "string") {
      throw new Error("Chaque composant du manifeste doit définir une racine.");
    }
    const absoluteRoot = path.resolve(manifestInfo.baseDir, component.root);
    assertPathInside(extractRoot, absoluteRoot, "Composant du manifeste");
    if (!fs.existsSync(absoluteRoot) || !fs.statSync(absoluteRoot).isDirectory()) {
      throw new Error(`Composant introuvable : ${component.root}`);
    }

    const normalized = {
      type: component.type,
      root: path.relative(extractRoot, absoluteRoot),
    };
    if (component.type === "livecpk") {
      const target = String(component.target || "").trim().toLowerCase();
      if (target && target !== "football-life-livecpk-root") {
        throw new Error("La cible LiveCPK du manifeste n’est pas prise en charge.");
      }
      const files = relativeFiles(absoluteRoot);
      if (target && !files.every((file) => /^asset\/model\/character\/face\/real\//i.test(file))) {
        throw new Error("Un Facepack destiné à Football Life ne peut contenir que des fichiers Asset/model/character/face/real.");
      }
      if (target) normalized.target = target;
      normalized.files = files;
    }
    if (component.type === "lua") {
      const entrypoints = Array.isArray(component.entrypoints) ? component.entrypoints : [];
      if (entrypoints.length === 0) throw new Error("Un composant Lua doit déclarer au moins un entrypoint.");
      normalized.entrypoints = entrypoints.map((entrypoint) => {
        const absoluteEntry = path.resolve(absoluteRoot, entrypoint);
        assertPathInside(absoluteRoot, absoluteEntry, "Entrée Lua");
        if (!fs.existsSync(absoluteEntry) || !absoluteEntry.toLowerCase().endsWith(".lua")) {
          throw new Error(`Entrée Lua invalide : ${entrypoint}`);
        }
        return path.relative(absoluteRoot, absoluteEntry).replace(/\\/g, "/");
      });
    }
    if (component.type === "sider") {
      const target = String(component.target || "").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
      if (target.toLowerCase() !== "content") {
        throw new Error("Un composant Sider ne peut cibler que le dossier content.");
      }
      normalized.target = target;
      normalized.files = relativeFiles(absoluteRoot);
    }
    if (component.type === "save") {
      const target = String(component.target || "").trim().toLowerCase();
      if (target !== "football-life-save") {
        throw new Error("Un composant de sauvegarde ne peut cibler que le dossier de sauvegarde Football Life.");
      }
      const files = relativeFiles(absoluteRoot);
      if (files.length !== 1 || files[0] !== "edit00000000") {
        throw new Error("Un Option File STRYKER doit contenir uniquement le fichier EDIT00000000.");
      }
      normalized.target = target;
      normalized.files = files;
    }
    return normalized;
  });
}

function inspectExtractedContent(extractRoot) {
  const files = walkFiles(extractRoot);
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += fs.statSync(file).size;
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("Archive refusée : taille décompressée supérieure à 100 Go.");
    }
  }
  const blocked = files
    .filter((file) => BLOCKED_EXECUTABLE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map((file) => path.relative(extractRoot, file));
  if (blocked.length > 0) {
    throw new Error(
      `Archive contenant du code exécutable (${blocked.slice(0, 3).join(", ")}). STRYKER refuse l’installation automatique de ce type de mod.`
    );
  }
}

export class ModEngine {
  constructor({ store, siderManager, dataDirectories }) {
    this.store = store;
    this.siderManager = siderManager;
    this.dataDirectories = dataDirectories;
  }

  activeProfile(state = this.store.snapshot()) {
    const profile = state.profiles.find((item) => item.id === state.activeProfileId);
    if (!profile) throw new Error("Profil actif introuvable.");
    return profile;
  }

  list() {
    const state = this.store.snapshot();
    const profile = this.activeProfile(state);
    const enabled = new Set(profile.enabledMods);
    return profile.modOrder
      .map((id, index) => state.mods[id] ? { ...state.mods[id], enabled: enabled.has(id), priority: index + 1 } : null)
      .filter(Boolean);
  }

  async installArchive(archivePath, metadata = {}) {
    if (!archivePath || typeof archivePath !== "string") throw new Error("Sélectionnez une archive ZIP ou RAR.");
    const resolvedArchive = path.resolve(archivePath);
    if (!fs.existsSync(resolvedArchive) || !fs.statSync(resolvedArchive).isFile()) throw new Error("Archive introuvable.");
    const archiveKind = path.extname(resolvedArchive).toLowerCase();
    if (archiveKind !== ".zip" && archiveKind !== ".rar") {
      throw new Error("Seules les archives ZIP et RAR sont installées automatiquement. Extrayez les autres formats puis créez un ZIP.");
    }
    if (fs.statSync(resolvedArchive).size > MAX_ARCHIVE_BYTES) throw new Error("Archive supérieure à la limite de sécurité de 20 Go.");

    const archiveHash = hashFile(resolvedArchive);

    const tempRoot = path.join(this.dataDirectories.temp, `install-${crypto.randomUUID()}`);
    fs.mkdirSync(tempRoot, { recursive: true });
    let totalFiles = 0;
    let totalBytes = 0;

    try {
      // Les deux extracteurs partagent le même contrat : chemins validés en
      // amont, et onEntry reçoit la taille décompressée pour les limites.
      const extractArchive = archiveKind === ".rar" ? extractRarSafely : extractZipSafely;
      await extractArchive(resolvedArchive, tempRoot, {
        onEntry: (entry) => {
          totalFiles += 1;
          totalBytes += Number(entry.uncompressedSize || 0);
          if (totalFiles > MAX_FILES || totalBytes > MAX_UNCOMPRESSED_BYTES) {
            throw new Error("Archive refusée : limite de fichiers ou de taille décompressée dépassée.");
          }
        },
      });

      await expandPackedPayload(tempRoot);

      inspectExtractedContent(tempRoot);
      const manifestInfo = findManifest(tempRoot);
      const components = manifestInfo
        ? validateManifestComponents(manifestInfo, tempRoot)
        : analyzeArchive(tempRoot, { walkFiles, relativeFiles, findDirectoriesNamed });

      const manifest = manifestInfo?.manifest || {};
      const siderOverlay = manifest.siderOverlay ? normalizeSiderOverlay(manifest.siderOverlay) : null;
      const requestedName = cleanText(metadata.name || manifest.name, path.basename(resolvedArchive, path.extname(resolvedArchive)), 120);
      const idBase = sanitizeSegment(metadata.id || manifest.id || requestedName, "mod").toLowerCase();
      const packageIdWasDeclared = Boolean(metadata.id || manifest.id);
      const beforeInstall = this.store.snapshot();
      const existing = Object.values(beforeInstall.mods).find((mod) => (
        mod.archiveHash === archiveHash
        || (packageIdWasDeclared && (
          mod.packageId === idBase
          || mod.id === idBase
        ))
      ));
      const id = existing?.id || `${idBase}-${archiveHash.slice(0, 8)}`;
      const stagingPath = existing?.stagingPath || path.join(this.dataDirectories.mods, id);
      assertPathInside(this.dataDirectories.mods, stagingPath, "Dossier du mod");
      let retiredStaging = null;
      if (fs.existsSync(stagingPath)) {
        retiredStaging = path.join(this.dataDirectories.trash, `replaced-${sanitizeSegment(id)}-${Date.now()}`);
        assertPathInside(this.dataDirectories.trash, retiredStaging, "Ancienne version du mod");
        fs.renameSync(stagingPath, retiredStaging);
      }
      try {
        fs.renameSync(tempRoot, stagingPath);
      } catch (error) {
        if (retiredStaging && fs.existsSync(retiredStaging) && !fs.existsSync(stagingPath)) {
          fs.renameSync(retiredStaging, stagingPath);
        }
        throw error;
      }

      const installedNow = new Date().toISOString();
      const record = {
        id,
        packageId: idBase,
        name: requestedName,
        version: cleanText(metadata.version || manifest.version, "1.0.0", 40),
        author: cleanText(metadata.author || manifest.author, "Auteur non renseigné", 120),
        category: ALLOWED_CATEGORIES.has(metadata.category || manifest.category) ? (metadata.category || manifest.category) : inferCategory(requestedName),
        compatibility: (Array.isArray(metadata.compatibility) ? metadata.compatibility : Array.isArray(manifest.compatibility) ? manifest.compatibility : []).filter((value) => typeof value === "string").slice(0, 20).map((value) => value.slice(0, 100)),
        dependencies: (Array.isArray(manifest.dependencies) ? manifest.dependencies : []).filter((dependency) => dependency && typeof dependency.id === "string" && dependency.id.length <= 160).slice(0, 100).map((dependency) => ({ id: dependency.id, ...(typeof dependency.version === "string" ? { version: dependency.version.slice(0, 40) } : {}) })),
        siderOverlay,
        sourceUrl: cleanText(metadata.sourceUrl || manifest.sourceUrl, "", 1000),
        sourceType: metadata.sourceType || "local-archive",
        archiveName: path.basename(resolvedArchive),
        archiveHash,
        installedAt: existing?.installedAt || installedNow,
        lastInstalledAt: installedNow,
        installCount: Number(existing ? (existing.installCount || 1) : 0) + 1,
        stagingPath,
        components,
        managed: true,
      };

      try {
        this.store.update((draft) => {
          draft.mods[id] = record;
          const profile = draft.profiles.find((item) => item.id === draft.activeProfileId);
          const alreadyInProfile = profile.modOrder.includes(id);
          if (!alreadyInProfile) profile.modOrder.push(id);
          if ((!existing || !alreadyInProfile) && !profile.enabledMods.includes(id)) profile.enabledMods.push(id);
          // A patch must override its base package on its first installation.
          if (!existing || !alreadyInProfile) {
            const dependencies = record.dependencies.map((dependency) => Object.values(draft.mods).find((item) => item.id === dependency.id || item.packageId === dependency.id)?.id).filter(Boolean);
            const firstDependency = profile.modOrder.findIndex((item) => dependencies.includes(item));
            if (firstDependency >= 0) {
              profile.modOrder = profile.modOrder.filter((item) => item !== id);
              profile.modOrder.splice(firstDependency, 0, id);
            }
          }
          profile.updatedAt = new Date().toISOString();
        });
        const next = this.store.snapshot();
        const deployment = this.siderManager.deploy(next, this.activeProfile(next));
        this.store.update((draft) => {
          draft.deployment = {
            engineRevision: 2,
            lastDeployedAt: new Date().toISOString(),
            lastSiderHash: deployment.hash,
            profileId: draft.activeProfileId,
          };
        });
      } catch (error) {
        this.store.replace(beforeInstall);
        const failedTarget = path.join(this.dataDirectories.trash, `failed-${id}-${Date.now()}`);
        if (fs.existsSync(stagingPath)) fs.renameSync(stagingPath, failedTarget);
        if (retiredStaging && fs.existsSync(retiredStaging) && !fs.existsSync(stagingPath)) {
          fs.renameSync(retiredStaging, stagingPath);
        }
        throw error;
      }

      const action = existing ? "reinstalled" : "installed";
      this.store.addActivity("install", `Mod ${existing ? "réinstallé" : "installé"} : ${record.name}`, { modId: id, archiveHash, action });
      return record;
    } catch (error) {
      if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
      throw error;
    }
  }

  deployCurrentProfile() {
    const state = this.store.snapshot();
    const profile = this.activeProfile(state);
    const deployment = this.siderManager.deploy(state, profile);
    this.store.update((draft) => {
      draft.deployment = {
        engineRevision: 2,
        lastDeployedAt: new Date().toISOString(),
        lastSiderHash: deployment.hash,
        profileId: profile.id,
      };
    });
    return deployment;
  }

  toggle(modId, enabled) {
    const state = this.store.snapshot();
    if (!state.mods[modId]) throw new Error("Mod introuvable.");
    const previous = state;
    this.store.update((draft) => {
      const profile = draft.profiles.find((item) => item.id === draft.activeProfileId);
      const set = new Set(profile.enabledMods);
      enabled ? set.add(modId) : set.delete(modId);
      profile.enabledMods = [...set];
      profile.updatedAt = new Date().toISOString();
    });
    try {
      this.deployCurrentProfile();
    } catch (error) {
      this.store.replace(previous);
      throw error;
    }
    this.store.addActivity("profile", `${enabled ? "Activation" : "Désactivation"} : ${state.mods[modId].name}`, { modId });
    return this.list().find((mod) => mod.id === modId);
  }

  reorder(orderedIds) {
    const state = this.store.snapshot();
    const profile = this.activeProfile(state);
    const expected = [...profile.modOrder].sort();
    const received = [...new Set(orderedIds || [])].sort();
    if (expected.length !== received.length || expected.some((id, index) => id !== received[index])) {
      throw new Error("La liste de réorganisation doit contenir chaque mod exactement une fois.");
    }
    const previous = state;
    this.store.update((draft) => {
      const target = draft.profiles.find((item) => item.id === draft.activeProfileId);
      target.modOrder = [...orderedIds];
      target.updatedAt = new Date().toISOString();
    });
    try {
      this.deployCurrentProfile();
    } catch (error) {
      this.store.replace(previous);
      throw error;
    }
    this.store.addActivity("profile", "Priorités des mods mises à jour", { orderedIds });
    return this.list();
  }

  uninstall(modId) {
    const state = this.store.snapshot();
    const mod = state.mods[modId];
    if (!mod) throw new Error("Mod introuvable.");
    const previous = state;
    let retiredStaging = null;
    if (fs.existsSync(mod.stagingPath)) {
      assertPathInside(this.dataDirectories.mods, mod.stagingPath, "Staging du mod");
      retiredStaging = path.join(this.dataDirectories.trash, `${sanitizeSegment(mod.id)}-${Date.now()}`);
      assertPathInside(this.dataDirectories.trash, retiredStaging, "Corbeille");
      fs.renameSync(mod.stagingPath, retiredStaging);
    }

    try {
      this.store.update((draft) => {
        delete draft.mods[modId];
        for (const profile of draft.profiles) {
          profile.modOrder = profile.modOrder.filter((id) => id !== modId);
          profile.enabledMods = profile.enabledMods.filter((id) => id !== modId);
          profile.updatedAt = new Date().toISOString();
        }
      });
      this.deployCurrentProfile();
    } catch (error) {
      this.store.replace(previous);
      if (retiredStaging && fs.existsSync(retiredStaging) && !fs.existsSync(mod.stagingPath)) {
        fs.renameSync(retiredStaging, mod.stagingPath);
      }
      throw error;
    }

    const recoverablePaths = retiredStaging ? [retiredStaging] : [];
    this.store.addActivity("uninstall", `Mod désinstallé : ${mod.name}`, { modId, recoverablePaths });
    return { success: true, recoverablePaths };
  }

  conflicts() {
    const state = this.store.snapshot();
    const profile = this.activeProfile(state);
    const enabled = new Set(profile.enabledMods);
    const fileOwners = new Map();

    for (const modId of profile.modOrder) {
      if (!enabled.has(modId)) continue;
      const mod = state.mods[modId];
      for (const component of mod?.components || []) {
        if (!["livecpk", "sider", "save"].includes(component.type)) continue;
        for (const file of component.files || []) {
          const key = component.type === "sider" ? "content/" + file.toLowerCase()
            : component.type === "save" ? "save/" + file.toLowerCase() : file.toLowerCase();
          // Kit maps are combined by team ID at deployment, not overwritten as a file.
          if (isKitMap(key)) continue;
          const owners = fileOwners.get(key) || [];
          if (!owners.includes(modId)) owners.push(modId);
          fileOwners.set(key, owners);
        }
      }
    }

    const conflicts = [];
    for (const [file, owners] of fileOwners.entries()) {
      if (owners.length < 2) continue;
      conflicts.push({
        file,
        winnerModId: owners[0],
        loserModIds: owners.slice(1),
        modIds: owners,
      });
      if (conflicts.length >= 10_000) break;
    }

    return {
      total: conflicts.length,
      truncated: conflicts.length >= 10_000,
      conflicts,
    };
  }

  dependencyIssues() {
    const state = this.store.snapshot();
    const profile = this.activeProfile(state);
    const enabled = new Set(profile.enabledMods);
    const issues = [];
    for (const modId of profile.modOrder) {
      if (!enabled.has(modId)) continue;
      const mod = state.mods[modId];
      for (const dependency of mod?.dependencies || []) {
        const required = Object.values(state.mods).find((item) => item.id === dependency.id || item.packageId === dependency.id);
        if (!required) issues.push({ modId, dependency, reason: "missing" });
        else if (!enabled.has(required.id)) issues.push({ modId, dependency, reason: "disabled" });
      }
    }
    return issues;
  }

  profiles() {
    const state = this.store.snapshot();
    return state.profiles.map((profile) => ({
      ...profile,
      active: profile.id === state.activeProfileId,
      enabledCount: profile.enabledMods.length,
      modCount: profile.modOrder.length,
    }));
  }

  createProfile({ name, description = "", cloneActive = true }) {
    const safeName = cleanText(name, "", 80);
    const safeDescription = cleanText(description, "", 500);
    if (!safeName) throw new Error("Le profil doit avoir un nom.");
    const state = this.store.snapshot();
    const active = this.activeProfile(state);
    const id = `${sanitizeSegment(safeName).toLowerCase()}-${crypto.randomBytes(3).toString("hex")}`;
    const now = new Date().toISOString();
    const profile = {
      id,
      name: safeName,
      description: safeDescription,
      createdAt: now,
      updatedAt: now,
      modOrder: cloneActive ? [...active.modOrder] : [],
      enabledMods: cloneActive ? [...active.enabledMods] : [],
    };
    this.store.update((draft) => draft.profiles.push(profile));
    this.store.addActivity("profile", `Profil créé : ${profile.name}`, { profileId: id });
    return profile;
  }

  activateProfile(profileId) {
    const state = this.store.snapshot();
    if (!state.profiles.some((profile) => profile.id === profileId)) throw new Error("Profil introuvable.");
    const previous = state;
    this.store.update((draft) => { draft.activeProfileId = profileId; });
    try {
      this.deployCurrentProfile();
    } catch (error) {
      this.store.replace(previous);
      throw error;
    }
    const profile = this.activeProfile(this.store.snapshot());
    this.store.addActivity("profile", `Profil activé : ${profile.name}`, { profileId });
    return profile;
  }

  deleteProfile(profileId) {
    if (profileId === "default") throw new Error("Le profil principal ne peut pas être supprimé.");
    const state = this.store.snapshot();
    if (!state.profiles.some((profile) => profile.id === profileId)) throw new Error("Profil introuvable.");
    const wasActive = state.activeProfileId === profileId;
    try {
      this.store.update((draft) => {
        draft.profiles = draft.profiles.filter((profile) => profile.id !== profileId);
        if (draft.activeProfileId === profileId) draft.activeProfileId = "default";
      });
      if (wasActive) this.deployCurrentProfile();
    } catch (error) {
      this.store.replace(state);
      throw error;
    }
    this.store.addActivity("profile", "Profil supprimé", { profileId });
    return { success: true };
  }
}

export { hashFile, walkFiles };
