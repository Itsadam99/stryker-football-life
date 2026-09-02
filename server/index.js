import crypto from "crypto";
import express from "express";
import fs from "fs";
import helmet from "helmet";
import path from "path";
import { execFile } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { detectAtPath, detectCommonInstallation } from "./game-detection.js";
import { DlssManager } from "./dlss-manager.js";
import { ModEngine } from "./mod-engine.js";
import { assertPathInside, ensureDataDirectories, resolveDataRoot, sanitizeSegment } from "./paths.js";
import { ProcessManager } from "./process-manager.js";
import { RepositoryManager } from "./repository-manager.js";
import { RemoteInstaller } from "./remote-installer.js";
import { SiderManager, fileHash } from "./sider-manager.js";
import { StateStore } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const APP_VERSION = "3.8.0";
const MAX_LOCAL_ARCHIVE_BYTES = 20 * 1024 * 1024 * 1024;

function ensureMockSandbox(mockDir) {
  fs.mkdirSync(path.join(mockDir, "livecpk"), { recursive: true });
  const siderPath = path.join(mockDir, "sider.ini");
  if (!fs.existsSync(siderPath)) {
    fs.writeFileSync(siderPath, [
      "[sider]",
      "debug = 0",
      "close.on.exit = 0",
      "start.minimized = 1",
      "",
      "; STRYKER sandbox — no real game files are used.",
      "",
    ].join("\r\n"), "utf-8");
  }
}

function safePublicSettings(settings) {
  const publicSettings = {
    ...settings,
    exeName: settings.gameExecutablePath ? path.basename(settings.gameExecutablePath) : "",
  };
  if (!settings.isLinked) {
    publicSettings.gamePath = "";
    publicSettings.siderPath = "";
    publicSettings.gameExecutablePath = "";
    publicSettings.siderExecutablePath = "";
    publicSettings.exeName = "";
  }
  return publicSettings;
}

function isAllowedOrigin(origin, req) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const sameHost = req?.get("host") && url.host.toLowerCase() === req.get("host").toLowerCase();
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    return ["http:", "https:"].includes(url.protocol) && Boolean(sameHost || localHost);
  } catch {
    return false;
  }
}

function runPicker(scriptPath) {
  if (process.platform !== "win32") throw new Error("Le sélecteur natif est actuellement disponible sous Windows uniquement.");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { windowsHide: false, timeout: 180_000, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && !stdout.trim()) return reject(new Error(stderr.trim() || error.message));
        const result = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "";
        if (!result || result === "CANCELLED") return resolve(null);
        resolve(result);
      }
    );
  });
}

function pickerScript(name) {
  const packaged = process.resourcesPath ? path.join(process.resourcesPath, "scripts", name) : "";
  return packaged && fs.existsSync(packaged) ? packaged : path.join(__dirname, name);
}

function createRateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  const requests = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "local";
    const now = Date.now();
    const record = requests.get(key) || { count: 0, resetAt: now + windowMs };
    if (now >= record.resetAt) {
      record.count = 0;
      record.resetAt = now + windowMs;
    }
    record.count += 1;
    requests.set(key, record);
    if (record.count > max) return res.status(429).json({ success: false, error: "Trop de requêtes locales. Réessayez dans une minute." });
    next();
  };
}

export function createRuntime({
  rootDir = ROOT_DIR,
  dataRoot = resolveDataRoot(rootDir),
  sessionToken = crypto.randomBytes(32).toString("hex"),
  nativeDialogs = null,
  updateManager = null,
  publicHub = process.env.STRYKER_HUB_PUBLIC === "1",
  adminToken = process.env.STRYKER_ADMIN_TOKEN || "",
} = {}) {
  if (publicHub && adminToken.length < 32) {
    throw new Error("STRYKER_ADMIN_TOKEN doit contenir au moins 32 caractères en mode Hub public.");
  }
  const mockDir = path.join(dataRoot, "demo");
  const dataDirectories = ensureDataDirectories(dataRoot);
  const store = new StateStore({
    dataRoot,
    mockDir,
    dataDirectories,
    legacyConfigPath: path.join(rootDir, "fl-hub-config.json"),
  });
  const existingSettings = store.snapshot().settings;
  let siderInstallationChanged = false;
  if (existingSettings.isLinked && existingSettings.gamePath) {
    try {
      const refreshed = detectAtPath(existingSettings.gamePath);
      siderInstallationChanged = !existingSettings.siderPath
        || path.resolve(refreshed.siderPath) !== path.resolve(existingSettings.siderPath);
      store.update((draft) => {
        Object.assign(draft.settings, {
          gamePath: refreshed.gamePath,
          gameExecutablePath: refreshed.gameExecutablePath,
          siderPath: refreshed.siderPath,
          siderExecutablePath: refreshed.siderExecutablePath,
          detectedVersion: refreshed.detectedVersion,
        });
        if (/ start\.exe$/i.test(refreshed.gameExecutablePath)) draft.settings.launchMode = "game";
      });
    } catch {
      // Keep the last known installation when a removable or network drive is temporarily unavailable.
    }
  }
  const siderManager = new SiderManager({ dataDirectories });
  const modEngine = new ModEngine({ store, siderManager, dataDirectories });
  const dlssManager = new DlssManager();
  if (siderInstallationChanged && Object.keys(store.snapshot().mods).length > 0) {
    try {
      modEngine.deployCurrentProfile();
      store.addActivity("migration", "Mods redéployés vers l’installation Sider réellement utilisée par Football Life", {
        previousSiderPath: existingSettings.siderPath,
        siderPath: store.snapshot().settings.siderPath,
      });
    } catch (error) {
      store.addActivity("error", "Le redéploiement automatique vers Sider a échoué", { message: error.message });
    }
  }
  const repositoryManager = new RepositoryManager({ dataDirectories, bundledDirectory: path.join(rootDir, "bundled-mods") });
  const remoteInstaller = new RemoteInstaller({ modEngine, dataDirectories });
  const processManager = new ProcessManager({
    onActivity: (type, message, details) => store.addActivity(type, message, details),
    launcherScriptPath: pickerScript("launchExecutable.ps1"),
  });
  return { rootDir, dataRoot, dataDirectories, store, siderManager, modEngine, dlssManager, repositoryManager, remoteInstaller, processManager, updateManager, sessionToken, nativeDialogs, publicHub, adminToken };
}

export function createApp(runtime = createRuntime()) {
  const { rootDir, store, siderManager, modEngine, dlssManager, repositoryManager, remoteInstaller, processManager, updateManager, sessionToken, nativeDialogs, publicHub, adminToken } = runtime;
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "http://localhost:*", "http://127.0.0.1:*"],
      },
    },
  }));
  app.use(express.json({ limit: "1mb", type: "application/json" }));

  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (!isAllowedOrigin(origin, req)) return res.status(403).json({ success: false, error: "Origine non autorisée." });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-STRYKER-Token, X-STRYKER-File-Name, X-STRYKER-Admin-Token");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use("/api", createRateLimiter({ max: 180 }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/api/session", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ token: sessionToken, version: APP_VERSION });
  });

  function hasValidSession(req) {
    const token = req.get("X-STRYKER-Token");
    const provided = Buffer.from(token || "", "utf-8");
    const expected = Buffer.from(sessionToken, "utf-8");
    return Boolean(token && provided.length === expected.length && crypto.timingSafeEqual(provided, expected));
  }

  function constantTimeToken(value, expectedValue) {
    const provided = Buffer.from(value || "", "utf-8");
    const expected = Buffer.from(expectedValue || "", "utf-8");
    return Boolean(value && provided.length === expected.length && crypto.timingSafeEqual(provided, expected));
  }

  function requireSession(req, res, next) {
    if (!hasValidSession(req)) return res.status(403).json({ success: false, error: "Session STRYKER invalide ou expirée." });
    next();
  }

  function requireAdmin(req, res, next) {
    if (!publicHub) return requireSession(req, res, next);
    if (!constantTimeToken(req.get("X-STRYKER-Admin-Token"), adminToken)) {
      return res.status(403).json({ success: false, error: "Accès modérateur refusé." });
    }
    next();
  }

  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const publicSubmission = (req.method === "POST" && req.path === "/hub/submissions")
      || (req.method === "PUT" && /^\/hub\/submissions\/[^/]+\/archive$/.test(req.path));
    if (publicHub && !publicSubmission) return requireAdmin(req, res, next);
    requireSession(req, res, next);
  });

  function applyDetectedInstallation(detected) {
    const previous = store.snapshot();
    store.update((draft) => {
      draft.settings = {
        ...draft.settings,
        ...detected,
        // Football Life's official "start.exe" is the supported smart launcher
        // and already starts its bundled Sider. Sider one-click remains an
        // explicit alternative for installations configured with start.game.
        launchMode: "game",
        isLinked: true,
        isDemoMode: false,
      };
    });
    try {
      modEngine.deployCurrentProfile();
    } catch (error) {
      store.replace(previous);
      throw error;
    }
    return safePublicSettings(store.snapshot().settings);
  }

  app.get("/api/config", (req, res) => res.json(safePublicSettings(store.snapshot().settings)));

  app.post("/api/config", (req, res) => {
    const allowedKeys = new Set(["autoStartSider", "launchMode"]);
    const receivedKeys = Object.keys(req.body || {});
    if (receivedKeys.some((key) => !allowedKeys.has(key))) {
      return res.status(400).json({ success: false, error: "Seuls le mode de lancement et l’activation automatique de Sider sont modifiables ici." });
    }
    store.update((draft) => {
      if (typeof req.body.autoStartSider === "boolean") draft.settings.autoStartSider = req.body.autoStartSider;
      if (["game", "sider"].includes(req.body.launchMode)) draft.settings.launchMode = req.body.launchMode;
    });
    store.addActivity("settings", "Paramètres de lancement mis à jour");
    res.json({ success: true, config: safePublicSettings(store.snapshot().settings) });
  });

  app.get("/api/dlss", (req, res) => {
    res.json(dlssManager.status(store.snapshot().settings));
  });

  app.post("/api/dlss", (req, res, next) => {
    try {
      if (processManager.status().isRunning) {
        return res.status(409).json({ success: false, error: "Fermez Football Life avant de modifier les réglages DLSS depuis STRYKER." });
      }
      const dlss = dlssManager.save(store.snapshot().settings, req.body || {});
      store.addActivity("dlss", `DLSS Neural Rendering ${dlss.enabled ? "activé" : "désactivé"}`, {
        qualityMode: dlss.qualityMode,
        autoExposure: dlss.autoExposure,
      });
      res.json({ success: true, dlss, requiresRestart: true });
    } catch (error) { next(error); }
  });

  app.post("/api/dlss/legacy/browse", async (req, res, next) => {
    try {
      const selected = nativeDialogs?.pickDlssNrFile
        ? await nativeDialogs.pickDlssNrFile()
        : await runPicker(pickerScript("browseDlssNr.ps1"));
      res.json(selected ? { success: true, path: selected } : { success: false, cancelled: true });
    } catch (error) { next(error); }
  });

  app.post("/api/dlss/legacy/install", (req, res, next) => {
    try {
      if (processManager.status().isRunning) {
        return res.status(409).json({ success: false, error: "Fermez Football Life avant de remplacer la DLL DLSS Neural Rendering." });
      }
      const dlss = dlssManager.installLegacyPatch(store.snapshot().settings, req.body?.sourcePath);
      store.addActivity("dlss", `Compatibilité DLSS installée pour ${dlss.compatibility.gpuName}`, {
        gpuGeneration: dlss.compatibility.gpuGeneration,
        runtimeHash: dlss.compatibility.runtimeHash,
      });
      res.json({ success: true, dlss, requiresRestart: true });
    } catch (error) { next(error); }
  });

  app.post("/api/dlss/legacy/restore", (req, res, next) => {
    try {
      if (processManager.status().isRunning) {
        return res.status(409).json({ success: false, error: "Fermez Football Life avant de restaurer la DLL DLSS Neural Rendering." });
      }
      const dlss = dlssManager.restoreLegacyPatch(store.snapshot().settings);
      store.addActivity("dlss", "DLL DLSS Neural Rendering d’origine restaurée", {
        runtimeHash: dlss.compatibility.runtimeHash,
      });
      res.json({ success: true, dlss, requiresRestart: true });
    } catch (error) { next(error); }
  });

  app.post("/api/detect", (req, res, next) => {
    try {
      const detected = detectCommonInstallation();
      const config = applyDetectedInstallation(detected);
      store.addActivity("game", `Jeu détecté : ${detected.detectedVersion}`);
      res.json({ success: true, config });
    } catch (error) { next(error); }
  });

  app.post("/api/game/link", (req, res, next) => {
    try {
      const detected = detectAtPath(req.body?.gamePath);
      const config = applyDetectedInstallation(detected);
      store.addActivity("game", `Jeu lié : ${detected.detectedVersion}`, { gamePath: detected.gamePath });
      res.json({ success: true, message: `${detected.detectedVersion} lié avec succès.`, config });
    } catch (error) { next(error); }
  });

  app.post("/api/game/unlink", (req, res) => {
    store.update((draft) => {
      draft.settings.isLinked = false;
      draft.settings.isDemoMode = false;
      draft.settings.gamePath = "";
      draft.settings.siderPath = path.join(runtime.dataRoot, "demo", "sider.ini");
      draft.settings.gameExecutablePath = "";
      draft.settings.siderExecutablePath = "";
      draft.settings.detectedVersion = "Aucune installation liée";
    });
    store.addActivity("game", "Installation du jeu déliée");
    res.json({ success: true, config: safePublicSettings(store.snapshot().settings) });
  });

  app.post("/api/game/browse", async (req, res, next) => {
    try {
      const selected = nativeDialogs?.pickGameFolder
        ? await nativeDialogs.pickGameFolder()
        : await runPicker(pickerScript("browseGame.ps1"));
      res.json(selected ? { success: true, path: selected } : { success: false, cancelled: true });
    } catch (error) { next(error); }
  });

  app.post("/api/mods/browse-archive", async (req, res, next) => {
    try {
      const selected = nativeDialogs?.pickArchive
        ? await nativeDialogs.pickArchive()
        : await runPicker(pickerScript("browseArchive.ps1"));
      res.json(selected ? { success: true, path: selected } : { success: false, cancelled: true });
    } catch (error) { next(error); }
  });

  app.get("/api/mods", (req, res) => res.json({ mods: modEngine.list() }));
  app.post("/api/mods/install-archive", async (req, res, next) => {
    try {
      const mod = await modEngine.installArchive(req.body?.archivePath, req.body?.metadata || {});
      const linked = store.snapshot().settings.isLinked;
      const action = mod.installCount > 1 ? "reinstalled" : "installed";
      res.status(201).json({ success: true, mod, action, message: linked
        ? `${mod.name} a été vérifié, ${action === "reinstalled" ? "réinstallé" : "installé"} et déployé dans Sider.`
        : `${mod.name} a été vérifié et ${action === "reinstalled" ? "réinstallé" : "préparé"}. Il sera déployé dès que le jeu sera lié.` });
    } catch (error) { next(error); }
  });
  app.put("/api/mods/install-upload", async (req, res, next) => {
    let uploadPath = "";
    try {
      const encodedName = req.get("X-STRYKER-File-Name") || "mod.zip";
      let originalName = encodedName;
      try { originalName = decodeURIComponent(encodedName); } catch { /* Keep the sanitized raw value. */ }
      const safeName = sanitizeSegment(path.basename(originalName), "mod.zip");
      if (path.extname(safeName).toLowerCase() !== ".zip") throw new Error("Déposez une archive ZIP valide.");
      const declaredLength = Number(req.get("Content-Length") || 0);
      if (declaredLength > MAX_LOCAL_ARCHIVE_BYTES) throw new Error("Archive supérieure à la limite de sécurité de 20 Go.");

      uploadPath = path.join(runtime.dataDirectories.temp, `drop-${crypto.randomUUID()}.zip`);
      assertPathInside(runtime.dataDirectories.temp, uploadPath, "Archive déposée");
      let receivedBytes = 0;
      const limiter = new Transform({
        transform(chunk, encoding, callback) {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_LOCAL_ARCHIVE_BYTES) callback(new Error("Archive supérieure à la limite de sécurité de 20 Go."));
          else callback(null, chunk);
        },
      });
      await pipeline(req, limiter, fs.createWriteStream(uploadPath, { flags: "wx", mode: 0o600 }));
      if (receivedBytes === 0) throw new Error("L’archive ZIP déposée est vide.");

      const mod = await modEngine.installArchive(uploadPath, {
        name: path.basename(safeName, path.extname(safeName)),
        sourceType: "drag-drop",
      });
      const linked = store.snapshot().settings.isLinked;
      const action = mod.installCount > 1 ? "reinstalled" : "installed";
      res.status(201).json({ success: true, mod, action, message: linked
        ? `${mod.name} a été vérifié, ${action === "reinstalled" ? "réinstallé" : "installé"} et déployé dans Sider.`
        : `${mod.name} a été vérifié et ${action === "reinstalled" ? "réinstallé" : "préparé"}. Il sera déployé dès que le jeu sera lié.` });
    } catch (error) {
      next(error);
    } finally {
      if (uploadPath && fs.existsSync(uploadPath)) fs.rmSync(uploadPath, { force: true });
    }
  });
  app.post("/api/mods/:id/toggle", (req, res, next) => {
    try { res.json({ success: true, mod: modEngine.toggle(req.params.id, Boolean(req.body?.enabled)) }); }
    catch (error) { next(error); }
  });
  app.post("/api/mods/reorder", (req, res, next) => {
    try { res.json({ success: true, mods: modEngine.reorder(req.body?.orderedIds) }); }
    catch (error) { next(error); }
  });
  app.delete("/api/mods/:id", (req, res, next) => {
    try { res.json(modEngine.uninstall(req.params.id)); }
    catch (error) { next(error); }
  });
  app.post("/api/mods/deploy", (req, res, next) => {
    try { res.json({ success: true, deployment: modEngine.deployCurrentProfile() }); }
    catch (error) { next(error); }
  });

  app.get("/api/catalog", (req, res) => res.json({ mods: repositoryManager.listPublished() }));
  app.get("/api/catalog/:id/download", (req, res, next) => {
    try {
      const { record, archivePath } = repositoryManager.getArchive(req.params.id);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("ETag", `"sha256-${record.archiveHash}"`);
      res.download(archivePath, record.archiveName, (error) => {
        if (error) return next(error);
        repositoryManager.incrementDownloads(record.id);
      });
    } catch (error) { next(error); }
  });
  app.get("/api/catalog/:id", (req, res) => {
    const mod = repositoryManager.getPublished(req.params.id);
    if (!mod) return res.status(404).json({ success: false, error: "Mod publié introuvable." });
    res.json({ mod });
  });
  app.post("/api/catalog/:id/install", async (req, res, next) => {
    try {
      const { record, archivePath } = repositoryManager.getArchive(req.params.id);
      const mod = await modEngine.installArchive(archivePath, repositoryManager.installMetadata(record));
      repositoryManager.incrementDownloads(record.id);
      const action = mod.installCount > 1 ? "reinstalled" : "installed";
      res.status(201).json({ success: true, mod, action, message: store.snapshot().settings.isLinked
        ? `${mod.name} a été ${action === "reinstalled" ? "réinstallé" : "installé"} automatiquement et déployé dans Sider.`
        : `${mod.name} a été ${action === "reinstalled" ? "réinstallé" : "installé"} dans le staging et attend la liaison du jeu.` });
    } catch (error) { next(error); }
  });
  app.post("/api/catalog/install-remote", async (req, res, next) => {
    try {
      const mod = await remoteInstaller.install(req.body?.repositoryUrl, req.body?.modId);
      res.status(201).json({ success: true, mod, message: store.snapshot().settings.isLinked
        ? `${mod.name} a été téléchargé, vérifié et déployé dans Sider.`
        : `${mod.name} a été téléchargé, vérifié et préparé avant liaison.` });
    } catch (error) { next(error); }
  });

  app.post("/api/hub/submissions", (req, res, next) => {
    try { res.status(201).json({ success: true, submission: repositoryManager.createSubmission(req.body || {}) }); }
    catch (error) { next(error); }
  });
  app.put("/api/hub/submissions/:id/archive", async (req, res, next) => {
    try {
      const encodedName = req.get("X-STRYKER-File-Name") || "mod.zip";
      let fileName = encodedName;
      try { fileName = decodeURIComponent(encodedName); } catch { /* Keep the sanitized raw value. */ }
      const submission = await repositoryManager.receiveArchive(
        req.params.id,
        req,
        fileName,
        Number(req.get("Content-Length") || 0),
      );
      res.json({ success: true, submission, message: "Archive vérifiée et envoyée à la modération." });
    } catch (error) { next(error); }
  });
  app.get("/api/hub/submissions", requireAdmin, (req, res) => {
    res.json({ submissions: repositoryManager.listSubmissions() });
  });
  app.post("/api/hub/submissions/:id/install", async (req, res, next) => {
    try {
      const { record, archivePath } = repositoryManager.getArchive(req.params.id, { allowPending: true });
      const mod = await modEngine.installArchive(archivePath, repositoryManager.installMetadata(record));
      res.status(201).json({ success: true, mod });
    } catch (error) { next(error); }
  });
  app.post("/api/hub/submissions/:id/publish", (req, res, next) => {
    try { res.json({ success: true, mod: repositoryManager.publish(req.params.id) }); }
    catch (error) { next(error); }
  });
  app.post("/api/hub/submissions/:id/reject", (req, res, next) => {
    try { res.json({ success: true, submission: repositoryManager.reject(req.params.id, req.body?.note) }); }
    catch (error) { next(error); }
  });

  app.get("/api/sider/mods", (req, res) => res.json(siderManager.parse(store.snapshot().settings.siderPath)));
  app.post("/api/sider/manual-toggle", (req, res, next) => {
    try {
      const settings = store.snapshot().settings;
      const result = siderManager.toggleManualLine(settings.siderPath, Number(req.body?.lineIndex), Boolean(req.body?.enabled));
      store.addActivity("sider", "Entrée Sider manuelle modifiée", { lineIndex: req.body?.lineIndex });
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  });

  app.get("/api/conflicts", (req, res) => res.json({ ...modEngine.conflicts(), dependencyIssues: modEngine.dependencyIssues() }));
  app.get("/api/profiles", (req, res) => res.json({ profiles: modEngine.profiles() }));
  app.post("/api/profiles", (req, res, next) => {
    try { res.status(201).json({ success: true, profile: modEngine.createProfile(req.body || {}) }); }
    catch (error) { next(error); }
  });
  app.post("/api/profiles/:id/activate", (req, res, next) => {
    try { res.json({ success: true, profile: modEngine.activateProfile(req.params.id) }); }
    catch (error) { next(error); }
  });
  app.delete("/api/profiles/:id", (req, res, next) => {
    try { res.json(modEngine.deleteProfile(req.params.id)); }
    catch (error) { next(error); }
  });

  app.get("/api/backups", (req, res) => {
    const siderPath = store.snapshot().settings.siderPath;
    res.json({ backups: siderManager.listBackups(siderPath) });
  });
  app.post("/api/backups/:name/restore", (req, res, next) => {
    try {
      const siderPath = store.snapshot().settings.siderPath;
      const result = siderManager.restoreBackup(siderPath, req.params.name);
      store.addActivity("restore", "Sauvegarde Sider restaurée", { backup: req.params.name });
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  });

  app.get("/api/health", (req, res) => {
    const state = store.snapshot();
    const settings = state.settings;
    const dependencyIssues = modEngine.dependencyIssues();
    const conflicts = modEngine.conflicts();
    const checks = [
      { id: "linked", label: "Jeu lié", ok: settings.isLinked, detail: settings.isLinked ? settings.detectedVersion : "Sélectionnez le dossier de Football Life" },
      { id: "game-exe", label: "Exécutable du jeu", ok: Boolean(settings.isLinked && settings.gameExecutablePath && fs.existsSync(settings.gameExecutablePath)), detail: settings.gameExecutablePath || "Non configuré" },
      { id: "sider-ini", label: "Configuration Sider", ok: Boolean(settings.isLinked && settings.siderPath && fs.existsSync(settings.siderPath)), detail: settings.isLinked ? settings.siderPath : "En attente de liaison" },
      { id: "sider-exe", label: "Exécutable Sider", ok: Boolean(settings.isLinked && (settings.launchMode !== "sider" || (settings.siderExecutablePath && fs.existsSync(settings.siderExecutablePath)))), detail: settings.siderExecutablePath || "Mode jeu direct" },
      { id: "dependencies", label: "Dépendances des mods", ok: dependencyIssues.length === 0, detail: `${dependencyIssues.length} problème(s)` },
      { id: "conflicts", label: "Conflits LiveCPK", ok: conflicts.total === 0, detail: `${conflicts.total} fichier(s) en conflit`, warning: true },
    ];
    res.json({ healthy: checks.filter((check) => !check.warning).every((check) => check.ok), checks, deployment: state.deployment, currentSiderHash: fileHash(settings.siderPath) });
  });

  app.get("/api/activity", (req, res) => res.json({ activity: store.snapshot().activity }));
  app.get("/api/launcher/status", (req, res) => res.json(processManager.status()));
  app.post("/api/launcher/launch", async (req, res, next) => {
    try { res.json({ success: true, ...await processManager.launch(store.snapshot().settings) }); }
    catch (error) { next(error); }
  });
  app.post("/api/launcher/stop", async (req, res, next) => {
    try { res.json(await processManager.stop()); }
    catch (error) { next(error); }
  });

  const fallbackUpdateStatus = () => ({
    currentVersion: APP_VERSION,
    availableVersion: null,
    state: "disabled",
    progress: 0,
    updateAvailable: false,
    updaterConfigured: false,
    message: "Le serveur de mises à jour n’est pas configuré dans cette version.",
  });
  app.get("/api/app/version", (req, res) => res.json(updateManager?.status?.() || fallbackUpdateStatus()));
  app.post("/api/app/update/check", async (req, res, next) => {
    try {
      if (!updateManager) throw new Error(fallbackUpdateStatus().message);
      res.json(await updateManager.check());
    } catch (error) { next(error); }
  });
  app.post("/api/app/update/download", async (req, res, next) => {
    try {
      if (!updateManager) throw new Error(fallbackUpdateStatus().message);
      res.json(await updateManager.download());
    } catch (error) { next(error); }
  });
  app.post("/api/app/update/install", (req, res, next) => {
    try {
      if (!updateManager) throw new Error(fallbackUpdateStatus().message);
      res.json(updateManager.install());
    } catch (error) { next(error); }
  });

  const distPath = path.join(rootDir, "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, { index: false, maxAge: "1h" }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use((req, res) => res.status(404).json({ success: false, error: "Route introuvable." }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number(error.status || error.statusCode || 400);
    res.status(status >= 400 && status < 600 ? status : 500).json({ success: false, error: error.message || "Erreur interne STRYKER." });
  });

  return app;
}

export async function startServer({ port = Number(process.env.PORT || 3001), host = process.env.STRYKER_HOST || "127.0.0.1", rootDir = ROOT_DIR, dataRoot, nativeDialogs = null, updateManager = null, publicHub, adminToken } = {}) {
  const effectiveDataRoot = dataRoot || resolveDataRoot(rootDir);
  ensureMockSandbox(path.join(effectiveDataRoot, "demo"));
  const runtime = createRuntime({ rootDir, dataRoot: effectiveDataRoot, nativeDialogs, updateManager, publicHub, adminToken });
  const app = createApp(runtime);
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
    instance.requestTimeout = 4 * 60 * 60 * 1_000;
    instance.once("error", reject);
  });
  const address = server.address();
  return {
    app,
    runtime,
    server,
    host,
    port: typeof address === "object" && address ? address.port : port,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  startServer()
    .then(({ host, port }) => {
      console.log(`[STRYKER] Serveur local sécurisé : http://${host}:${port}`);
      console.log(`[STRYKER] Données : ${resolveDataRoot(ROOT_DIR)}`);
    })
    .catch((error) => {
      console.error(`[STRYKER] Échec du démarrage : ${error.message}`);
      process.exitCode = 1;
    });
}

export { APP_VERSION, ROOT_DIR };
