import fs from "node:fs";
import path from "node:path";
import electronUpdater from "electron-updater";

function readConfiguredFeed(resourcesPath) {
  const configPath = path.join(resourcesPath || "", "app-update.yml");
  if (!configPath || !fs.existsSync(configPath)) return { configured: false, url: "" };
  try {
    const text = fs.readFileSync(configPath, "utf-8");
    const match = text.match(/^\s*url:\s*["']?([^"'\r\n]+)["']?\s*$/mi);
    if (!match) return { configured: false, url: "" };
    const url = new URL(match[1].trim());
    const configured = url.protocol === "https:" && !url.hostname.endsWith(".invalid");
    return { configured, url: configured ? url.href.replace(/\/$/, "") : "" };
  } catch {
    return { configured: false, url: "" };
  }
}

export class UpdateManager {
  constructor({ currentVersion, isPackaged, resourcesPath, platform = process.platform, updater, onReady } = {}) {
    const feed = readConfiguredFeed(resourcesPath);
    this.updater = updater;
    this.onReady = typeof onReady === "function" ? onReady : null;
    this.configured = Boolean(isPackaged && platform === "win32" && feed.configured);
    this.feedUrl = feed.url;
    this.started = false;
    this.snapshot = {
      currentVersion: currentVersion || "0.0.0",
      availableVersion: null,
      state: this.configured ? "idle" : "disabled",
      progress: 0,
      updateAvailable: false,
      updaterConfigured: this.configured,
      message: this.configured
        ? "Les mises à jour seront vérifiées automatiquement au démarrage."
        : "Aucun serveur HTTPS de mises à jour n’est configuré dans cette version.",
    };
  }

  status() {
    return { ...this.snapshot };
  }

  setStatus(values) {
    Object.assign(this.snapshot, values);
  }

  start() {
    if (this.started || !this.configured) return this.status();
    this.started = true;
    // La mise à jour se télécharge en tâche de fond dès qu'elle est trouvée,
    // puis s'installe à la fermeture : au prochain démarrage, STRYKER est à
    // jour sans que personne ait eu à cliquer sur « Télécharger ».
    this.updater.autoDownload = true;
    this.updater.autoInstallOnAppQuit = true;
    this.updater.allowPrerelease = false;

    this.updater.on("checking-for-update", () => this.setStatus({ state: "checking", message: "Recherche d’une mise à jour…" }));
    this.updater.on("update-available", (info) => this.setStatus({
      state: "available",
      availableVersion: info.version,
      updateAvailable: true,
      progress: 0,
      message: `La version ${info.version} est disponible.`,
    }));
    this.updater.on("update-not-available", () => this.setStatus({
      state: "upToDate",
      availableVersion: null,
      updateAvailable: false,
      progress: 0,
      message: "STRYKER est à jour.",
    }));
    this.updater.on("download-progress", (progress) => this.setStatus({
      state: "downloading",
      progress: Math.max(0, Math.min(100, Number(progress.percent || 0))),
      message: `Téléchargement de la mise à jour : ${Math.round(Number(progress.percent || 0))} %`,
    }));
    this.updater.on("update-downloaded", (info) => {
      this.setStatus({
        state: "ready",
        availableVersion: info.version,
        updateAvailable: true,
        progress: 100,
        message: `La version ${info.version} est prête. Redémarrez STRYKER pour l’installer.`,
      });
      // Le processus principal propose le redémarrage ; un échec de la boîte de
      // dialogue ne doit pas casser le suivi de mise à jour.
      try { this.onReady?.(info.version); } catch { /* ignoré */ }
    });
    this.updater.on("error", (error) => this.setStatus({
      state: "error",
      progress: 0,
      message: `Mise à jour impossible : ${String(error?.message || error).slice(0, 300)}`,
    }));

    const timer = setTimeout(() => { void this.check(); }, 2_500);
    timer.unref?.();
    return this.status();
  }

  async check() {
    if (!this.configured) return this.status();
    this.setStatus({ state: "checking", message: "Recherche d’une mise à jour…" });
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.setStatus({ state: "error", message: `Mise à jour impossible : ${String(error?.message || error).slice(0, 300)}` });
    }
    return this.status();
  }

  async download() {
    if (!this.configured) return this.status();
    if (!this.snapshot.updateAvailable) throw new Error("Aucune mise à jour n’est disponible.");
    this.setStatus({ state: "downloading", progress: 0, message: "Téléchargement de la mise à jour…" });
    await this.updater.downloadUpdate();
    return this.status();
  }

  install() {
    if (this.snapshot.state !== "ready") throw new Error("La mise à jour n’est pas encore prête à être installée.");
    setImmediate(() => this.updater.quitAndInstall(false, true));
    return { success: true, message: "STRYKER va redémarrer pour terminer la mise à jour." };
  }
}

export function createUpdateManager(options) {
  return new UpdateManager({ ...options, updater: options?.updater || electronUpdater.autoUpdater });
}

export { readConfiguredFeed };
