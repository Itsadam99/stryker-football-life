import crypto from "crypto";
import express from "express";
import fs from "fs";
import helmet from "helmet";
import path from "path";
import { execFile } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";
import { detectAtPath, detectCommonInstallation } from "./game-detection.js";
import { ModEngine } from "./mod-engine.js";
import { ensureDataDirectories, resolveDataRoot } from "./paths.js";
import { ProcessManager } from "./process-manager.js";
import { SiderManager, fileHash } from "./sider-manager.js";
import { StateStore } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const APP_VERSION = "3.0.0";

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
  return {
    ...settings,
    exeName: settings.gameExecutablePath ? path.basename(settings.gameExecutablePath) : "",
  };
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol);
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

export function createRuntime({ rootDir = ROOT_DIR, dataRoot = resolveDataRoot(rootDir), sessionToken = crypto.randomBytes(32).toString("hex") } = {}) {
  const mockDir = path.join(dataRoot, "demo");
  const dataDirectories = ensureDataDirectories(dataRoot);
  const store = new StateStore({
    dataRoot,
    mockDir,
    dataDirectories,
    legacyConfigPath: path.join(rootDir, "fl-hub-config.json"),
  });
  const siderManager = new SiderManager({ dataDirectories });
  const modEngine = new ModEngine({ store, siderManager, dataDirectories });
  const processManager = new ProcessManager({
    onActivity: (type, message, details) => store.addActivity(type, message, details),
  });
  return { rootDir, dataRoot, dataDirectories, store, siderManager, modEngine, processManager, sessionToken };
}

export function createApp(runtime = createRuntime()) {
  const { rootDir, store, siderManager, modEngine, processManager, sessionToken } = runtime;
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
    if (!isAllowedOrigin(origin)) return res.status(403).json({ success: false, error: "Origine non autorisée." });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-STRYKER-Token");
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

  app.use("/api", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const token = req.get("X-STRYKER-Token");
    const provided = Buffer.from(token || "", "utf-8");
    const expected = Buffer.from(sessionToken, "utf-8");
    if (!token || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(403).json({ success: false, error: "Session STRYKER invalide ou expirée." });
    }
    next();
  });

  function applyDetectedInstallation(detected) {
    const previous = store.snapshot();
    store.update((draft) => {
      draft.settings = {
        ...draft.settings,
        ...detected,
        launchMode: detected.siderExecutablePath ? "sider" : "game",
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
      draft.settings.isDemoMode = true;
      draft.settings.gamePath = path.join(rootDir, "mock-fl");
      draft.settings.siderPath = path.join(rootDir, "mock-fl", "sider.ini");
      draft.settings.gameExecutablePath = "";
      draft.settings.siderExecutablePath = "";
      draft.settings.detectedVersion = "Environnement de démonstration sécurisé";
    });
    store.addActivity("game", "Jeu délié — retour au mode démonstration");
    res.json({ success: true, config: safePublicSettings(store.snapshot().settings) });
  });

  app.post("/api/game/browse", async (req, res, next) => {
    try {
      const selected = await runPicker(pickerScript("browseGame.ps1"));
      res.json(selected ? { success: true, path: selected } : { success: false, cancelled: true });
    } catch (error) { next(error); }
  });

  app.post("/api/mods/browse-archive", async (req, res, next) => {
    try {
      const selected = await runPicker(pickerScript("browseArchive.ps1"));
      res.json(selected ? { success: true, path: selected } : { success: false, cancelled: true });
    } catch (error) { next(error); }
  });

  app.get("/api/mods", (req, res) => res.json({ mods: modEngine.list() }));
  app.post("/api/mods/install-archive", async (req, res, next) => {
    try {
      const mod = await modEngine.installArchive(req.body?.archivePath, req.body?.metadata || {});
      res.status(201).json({ success: true, mod, message: `${mod.name} a été vérifié, installé dans le staging et déployé.` });
    } catch (error) { next(error); }
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
      { id: "linked", label: "Jeu lié", ok: settings.isDemoMode || settings.isLinked, detail: settings.isDemoMode ? "Mode démonstration" : settings.detectedVersion },
      { id: "game-exe", label: "Exécutable du jeu", ok: settings.isDemoMode || Boolean(settings.gameExecutablePath && fs.existsSync(settings.gameExecutablePath)), detail: settings.gameExecutablePath || "Non configuré" },
      { id: "sider-ini", label: "Configuration Sider", ok: Boolean(settings.siderPath && fs.existsSync(settings.siderPath)), detail: settings.siderPath || "Non configuré" },
      { id: "sider-exe", label: "Exécutable Sider", ok: settings.isDemoMode || settings.launchMode !== "sider" || Boolean(settings.siderExecutablePath && fs.existsSync(settings.siderExecutablePath)), detail: settings.siderExecutablePath || "Mode jeu direct" },
      { id: "dependencies", label: "Dépendances des mods", ok: dependencyIssues.length === 0, detail: `${dependencyIssues.length} problème(s)` },
      { id: "conflicts", label: "Conflits LiveCPK", ok: conflicts.total === 0, detail: `${conflicts.total} fichier(s) en conflit`, warning: true },
    ];
    res.json({ healthy: checks.filter((check) => !check.warning).every((check) => check.ok), checks, deployment: state.deployment, currentSiderHash: fileHash(settings.siderPath) });
  });

  app.get("/api/activity", (req, res) => res.json({ activity: store.snapshot().activity }));
  app.get("/api/launcher/status", (req, res) => res.json(processManager.status()));
  app.post("/api/launcher/launch", (req, res, next) => {
    try { res.json({ success: true, ...processManager.launch(store.snapshot().settings) }); }
    catch (error) { next(error); }
  });
  app.post("/api/launcher/stop", async (req, res, next) => {
    try { res.json(await processManager.stop()); }
    catch (error) { next(error); }
  });

  app.get("/api/app/version", (req, res) => res.json({
    currentVersion: APP_VERSION,
    updateAvailable: false,
    updaterConfigured: false,
    message: "Les mises à jour automatiques seront proposées uniquement lorsqu’un manifeste distant signé sera configuré.",
  }));

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

export async function startServer({ port = Number(process.env.PORT || 3001), host = "127.0.0.1", rootDir = ROOT_DIR, dataRoot } = {}) {
  const effectiveDataRoot = dataRoot || resolveDataRoot(rootDir);
  ensureMockSandbox(path.join(effectiveDataRoot, "demo"));
  const runtime = createRuntime({ rootDir, dataRoot: effectiveDataRoot });
  const app = createApp(runtime);
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, host, () => resolve(instance));
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
