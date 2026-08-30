import fs from "fs";
import path from "path";
import { execFile, spawn } from "child_process";

export class ProcessManager {
  constructor({ onActivity = () => {} } = {}) {
    this.onActivity = onActivity;
    this.current = null;
    this.demoStartedAt = null;
  }

  status() {
    const startTime = this.current?.startTime || this.demoStartedAt;
    return {
      isRunning: Boolean(this.current || this.demoStartedAt),
      pid: this.current?.child?.pid || null,
      startTime: startTime || null,
      playDurationSeconds: startTime ? Math.max(0, Math.floor((Date.now() - startTime) / 1000)) : 0,
      executable: this.current?.executable || null,
      isDemo: Boolean(this.demoStartedAt),
    };
  }

  launch(settings) {
    if (this.current || this.demoStartedAt) {
      throw new Error("Une session de jeu est déjà suivie par STRYKER.");
    }

    if (settings.isDemoMode) {
      this.demoStartedAt = Date.now();
      this.onActivity("launcher", "Simulation de lancement démarrée", { demo: true });
      return { ...this.status(), message: "Simulation démarrée — aucun processus de jeu n’a été lancé." };
    }

    if (!settings.isLinked) {
      throw new Error("Liez une installation valide avant de lancer le jeu.");
    }

    const useSider = settings.launchMode === "sider" && settings.autoStartSider;
    const executable = useSider ? settings.siderExecutablePath : settings.gameExecutablePath;
    if (!executable || !fs.existsSync(executable) || !fs.statSync(executable).isFile()) {
      throw new Error(useSider
        ? "L’exécutable Sider configuré est introuvable. Corrigez le chemin ou utilisez le mode de lancement du jeu."
        : "L’exécutable du jeu configuré est introuvable.");
    }

    const cwd = path.dirname(executable);
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
      this.onActivity("launcher", "Processus lancé par STRYKER terminé", { code, signal, executable });
    });

    this.onActivity("launcher", "Jeu lancé", { executable, pid: child.pid });
    return { ...this.status(), message: `${path.basename(executable)} a été lancé.` };
  }

  async stop() {
    if (this.demoStartedAt) {
      this.demoStartedAt = null;
      this.onActivity("launcher", "Simulation arrêtée", { demo: true });
      return { success: true, message: "Simulation arrêtée." };
    }

    if (!this.current?.child?.pid) {
      throw new Error("Aucun processus suivi n’est en cours d’exécution.");
    }

    const pid = this.current.child.pid;
    if (process.platform === "win32") {
      await new Promise((resolve, reject) => {
        execFile("taskkill.exe", ["/PID", String(pid), "/T"], { windowsHide: true }, (error) => {
          if (error && !String(error.message).includes("not found")) reject(error);
          else resolve();
        });
      });
    } else {
      process.kill(pid, "SIGTERM");
    }

    this.current = null;
    this.onActivity("launcher", "Jeu arrêté depuis STRYKER", { pid });
    return { success: true, message: "Processus arrêté." };
  }
}

