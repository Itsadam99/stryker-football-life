import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { fileURLToPath } from "url";
import { findPreferredFootballLifeLauncher } from "./game-detection.js";

const DEFAULT_LAUNCHER_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "launchExecutable.ps1");

export function resolveLaunchExecutable(settings) {
  const officialLauncher = findPreferredFootballLifeLauncher(settings.gamePath);
  const isFootballLife = /^SP Football Life/i.test(settings.detectedVersion || "")
    || /^FL[ _]\d{4}/i.test(path.basename(settings.gameExecutablePath || ""));
  if (isFootballLife) {
    if (!officialLauncher) {
      throw new Error("Le lanceur officiel « FL 20XX start.exe » est introuvable. Reliez le dossier racine de Football Life.");
    }
    return { executable: officialLauncher, launchType: "football-life" };
  }

  const useSiderOneClick = settings.launchMode === "sider";
  return {
    executable: useSiderOneClick ? settings.siderExecutablePath : settings.gameExecutablePath,
    launchType: useSiderOneClick ? "sider" : "game",
  };
}

function launchWithWindowsShell(executable, cwd, launcherScriptPath) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", launcherScriptPath,
      "-Executable", executable, "-WorkingDirectory", cwd,
    ], {
      windowsHide: true,
      timeout: 30_000,
      encoding: "utf-8",
    }, (error, stdout) => {
      if (error) return reject(new Error(`Windows n’a pas pu ouvrir ${path.basename(executable)} : ${error.message}`));
      const pid = Number(String(stdout || "").trim());
      if (!Number.isInteger(pid) || pid <= 0) return reject(new Error("Windows n’a pas renvoyé le processus lancé."));
      resolve(pid);
    });
  });
}

export class ProcessManager {
  constructor({ onActivity = () => {}, launcherScriptPath = DEFAULT_LAUNCHER_SCRIPT } = {}) {
    this.onActivity = onActivity;
    this.launcherScriptPath = launcherScriptPath;
    this.current = null;
  }

  status() {
    const startTime = this.current?.startTime || null;
    return {
      isRunning: Boolean(this.current),
      pid: this.current?.pid || this.current?.child?.pid || null,
      startTime: startTime || null,
      playDurationSeconds: startTime ? Math.max(0, Math.floor((Date.now() - startTime) / 1000)) : 0,
      executable: this.current?.executable || null,
      isDemo: false,
    };
  }

  async launch(settings) {
    if (this.current) {
      throw new Error("Une session de jeu est déjà suivie par STRYKER.");
    }

    if (!settings.isLinked) {
      throw new Error("Liez une installation valide avant de lancer le jeu.");
    }

    const { executable, launchType } = resolveLaunchExecutable(settings);
    if (!executable || !fs.existsSync(executable) || !fs.statSync(executable).isFile()) {
      throw new Error(launchType === "sider"
        ? "L’exécutable Sider configuré est introuvable. Utilisez le lanceur officiel de Football Life ou corrigez l’installation de Sider."
        : "L’exécutable du jeu configuré est introuvable.");
    }

    const cwd = path.dirname(executable);
    if (process.platform === "win32") {
      const pid = await launchWithWindowsShell(executable, cwd, this.launcherScriptPath);
      const record = { child: null, pid, executable, startTime: Date.now(), pollTimer: null };
      this.current = record;
      record.pollTimer = setInterval(() => {
        execFile("tasklist.exe", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { windowsHide: true }, (error, stdout) => {
          const isRunning = !error && String(stdout || "").includes(`"${pid}"`);
          if (!isRunning && this.current === record) {
            clearInterval(record.pollTimer);
            this.current = null;
            this.onActivity("launcher", "Processus de lancement terminé", { pid, executable });
          }
        });
      }, 2_000);
      record.pollTimer.unref?.();
      this.onActivity("launcher", launchType === "football-life" ? "Lanceur officiel Football Life démarré" : launchType === "sider" ? "Sider one-click lancé" : "Jeu lancé", { executable, pid });
      return { ...this.status(), message: `${path.basename(executable)} a été lancé.` };
    }

    const child = spawn(executable, [], {
      cwd,
      detached: false,
      stdio: "ignore",
      windowsHide: false,
    });

    const record = {
      child,
      executable,
      startTime: Date.now(),
    };
    this.current = record;

    child.once("error", (error) => {
      if (this.current === record) this.current = null;
      this.onActivity("error", "Échec du lancement", { message: error.message, executable });
    });

    child.once("exit", (code, signal) => {
      if (this.current === record) this.current = null;
      this.onActivity("launcher", "Processus de lancement terminé", { code, signal, executable });
    });

    this.onActivity("launcher", launchType === "sider" ? "Sider one-click lancé" : "Football Life lancé", { executable, pid: child.pid });
    return { ...this.status(), message: `${path.basename(executable)} a été lancé.` };
  }

  async stop() {
    const pid = this.current?.pid || this.current?.child?.pid;
    if (!pid) {
      throw new Error("Aucun processus suivi n’est en cours d’exécution.");
    }

    const processIds = [pid];
    if (process.platform === "win32") {
      for (const processId of processIds) {
        await new Promise((resolve, reject) => {
          execFile("taskkill.exe", ["/PID", String(processId), "/T"], { windowsHide: true }, (error) => {
            if (error && !String(error.message).includes("not found")) reject(error);
            else resolve();
          });
        });
      }
    } else {
      for (const processId of processIds) process.kill(processId, "SIGTERM");
    }

    if (this.current?.pollTimer) clearInterval(this.current.pollTimer);
    this.current = null;
    this.onActivity("launcher", "Jeu arrêté depuis STRYKER", { pid });
    return { success: true, message: "Processus arrêté." };
  }
}
