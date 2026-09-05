import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArchiveRestore, ArrowDown, ArrowUp, CheckCircle2,
  CircleGauge, Download, ExternalLink, FolderSearch, HeartPulse, Layers3,
  Library, PackageOpen, Play, Plus, RefreshCw, ScrollText, Search, Settings, ShieldCheck, Sparkles, Square,
  Trash2, UploadCloud, UserRoundCog, Wrench, XCircle,
} from "lucide-react";
import { api } from "../services/api";
import { localizeCatalogMod, VERIFIED_CATALOG_MODS } from "../services/catalogData";
import {
  ActivityItem, BackupItem, ConflictReport, DlssSettings, GameConfig, GameProcessStatus,
  CatalogMod, HealthCheck, HealthReport, LogContent, LogSource, ManagedMod, ModItem, Profile, UpdateStatus,
} from "../types";
import { StrykerLogo } from "./StrykerLogo";
import { Language, LanguageSwitcher, useI18n } from "../i18n";
import { DLSS_COPY } from "../services/dlssCopy";
import { LOG_COPY, logLineLevel } from "../services/logCopy";
import { installableCatalog, installedCatalogMod, searchCatalog, catalogInstallPlan } from "../services/installableCatalog";

type DesktopPage = "dashboard" | "mods" | "catalog" | "profiles" | "conflicts" | "logs" | "settings";

const EMPTY_CONFIG: GameConfig = {
  gamePath: "",
  siderPath: "",
  siderExecutablePath: "",
  gameExecutablePath: "",
  exeName: "",
  detectedVersion: "Chargement…",
  autoStartSider: true,
  launchMode: "game",
  isDemoMode: false,
  isLinked: false,
  stagingPath: "",
};

const EMPTY_STATUS: GameProcessStatus = {
  isRunning: false,
  pid: null,
  startTime: null,
  playDurationSeconds: 0,
};

const EMPTY_DLSS: DlssSettings = {
  linked: false,
  installed: false,
  configurable: false,
  enabled: false,
  qualityMode: 0,
  qualityId: "default",
  autoExposure: false,
  intensity: 1,
  autoMask: true,
  diffuseWhiteNits: 500,
  uiCorrectionMode: 2,
  globalToneStrength: 1,
  localToneStrength: 1,
  localStructureStrength: 1,
  skinStructureStrength: 1,
  overlay: { configured: false, shortcut: "F10", hotReload: true, nativePanelDetected: false },
  missingFiles: [],
  configPath: "",
  backupPath: "",
  compatibility: {
    gpuName: "",
    gpuGeneration: "unknown",
    supported: false,
    needsLegacyPatch: false,
    patchInstalled: false,
    runtimeState: "missing",
    runtimeHash: "",
    runtimePath: "",
    pinnedVersion: "",
    pinnedHash: "",
    pinnedSourceUrl: "",
    backupPath: "",
    canRestore: false,
  },
};

const APP_VERSION = "3.9.2";

const EMPTY_UPDATE: UpdateStatus = {
  currentVersion: APP_VERSION,
  availableVersion: null,
  state: "disabled",
  progress: 0,
  updateAvailable: false,
  updaterConfigured: false,
  message: "",
};

/** Cadence normale du suivi de session, et plafond quand le moteur local ne répond plus. */
const POLL_INTERVAL_MS = 1_500;
const POLL_BACKOFF_MAX_MS = 30_000;

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatDate(value: string | null | undefined, language: Language, never: string) {
  if (!value) return never;
  const locale: Record<Language, string> = { fr: "fr-FR", en: "en-GB", pt: "pt-PT", es: "es-ES" };
  return new Intl.DateTimeFormat(locale[language], { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function DesktopApp() {
  const { language, t } = useI18n();
  const logCopy = LOG_COPY[language];
  const navigation: Array<{ id: DesktopPage; label: string; icon: React.ElementType }> = [
    { id: "dashboard", label: t("desktop.dashboard"), icon: CircleGauge },
    { id: "mods", label: t("desktop.mods"), icon: Layers3 },
    { id: "catalog", label: t("desktop.discover"), icon: Library },
    { id: "profiles", label: t("desktop.profiles"), icon: UserRoundCog },
    { id: "conflicts", label: t("desktop.conflicts"), icon: Wrench },
    { id: "logs", label: logCopy.nav, icon: ScrollText },
    { id: "settings", label: t("desktop.settings"), icon: Settings },
  ];
  const [page, setPage] = useState<DesktopPage>("dashboard");
  const [config, setConfig] = useState<GameConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<GameProcessStatus>(EMPTY_STATUS);
  const [dlss, setDlss] = useState<DlssSettings>(EMPTY_DLSS);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(EMPTY_UPDATE);
  const [mods, setMods] = useState<ManagedMod[]>([]);
  const [manualMods, setManualMods] = useState<ModItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [conflicts, setConflicts] = useState<ConflictReport | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [catalogMods, setCatalogMods] = useState<CatalogMod[]>([]);
  const [version, setVersion] = useState(APP_VERSION);
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const deepLinkHandled = useRef(false);

  // Tâche en cours : alimente la barre de progression sous l'en-tête. `progress`
  // reste null quand l'opération ne sait pas où elle en est.
  const [task, setTask] = useState<{ label: string; progress: number | null } | null>(null);
  // Identifiant de l'élément en cours de bascule, pour n'animer que sa ligne.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [logSources, setLogSources] = useState<LogSource[]>([]);
  const [logSourceId, setLogSourceId] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<LogContent | null>(null);
  const [logSearch, setLogSearch] = useState("");
  const [logFollow, setLogFollow] = useState(true);
  const logViewRef = useRef<HTMLDivElement | null>(null);

  const activeProfile = profiles.find((profile) => profile.active);
  const activeProfileLabel = activeProfile?.id === "default" ? t("desktop.mainProfile") : activeProfile?.name || "—";
  const conflictBadge = conflicts ? conflicts.total + conflicts.dependencyIssues.length : 0;
  const dlssCopy = DLSS_COPY[language];
  const dlssQualityLabel = [
    t("desktop.dlssDefault"), t("desktop.dlssPerformance"), t("desktop.dlssBalanced"), t("desktop.dlssQualityMode"),
    t("desktop.dlssUltraPerformance"), t("desktop.dlssUltraQuality"), "DLAA",
  ][dlss.qualityMode] || t("desktop.dlssDefault");

  /** Ouvre le centre DLSS dans sa propre fenêtre (BrowserWindow sous Electron). */
  const openDlssStudio = () => {
    const target = new URL(window.location.href);
    target.searchParams.set("mode", "dlss");
    target.searchParams.delete("installMod");
    target.searchParams.delete("repository");
    target.hash = "";
    window.open(target.href, "stryker-dlss", "width=1060,height=880");
  };
  const localizeHealthCheck = (check: HealthCheck) => {
    const labels: Record<string, string> = {
      linked: t("desktop.gameLinked"),
      "game-exe": t("desktop.gameExecutable"),
      "sider-ini": t("desktop.siderConfiguration"),
      "sider-exe": t("desktop.siderExecutable"),
      dependencies: t("desktop.modDependencies"),
      conflicts: t("desktop.liveCpkConflicts"),
    };
    const details: Record<string, string> = {
      linked: config.isLinked ? config.detectedVersion : t("desktop.selectGameFolder"),
      "game-exe": config.gameExecutablePath || t("desktop.notConfigured"),
      "sider-ini": config.isLinked ? config.siderPath : t("desktop.awaitingLink"),
      "sider-exe": config.siderExecutablePath || t("desktop.directGameMode"),
      dependencies: `${conflicts?.dependencyIssues.length || 0} ${t("desktop.problems")}`,
      conflicts: `${conflicts?.total || 0} ${t("desktop.conflictingFiles")}`,
    };
    return { label: labels[check.id] || check.label, detail: details[check.id] || check.detail };
  };
  const filteredMods = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? mods.filter((mod) => [mod.name, mod.author, mod.category].some((value) => value.toLowerCase().includes(query))) : mods;
  }, [mods, search]);
  const visibleLogLines = useMemo(() => {
    const lines = logContent?.lines ?? [];
    const query = logSearch.trim().toLowerCase();
    return query ? lines.filter((line) => line.toLowerCase().includes(query)) : lines;
  }, [logContent, logSearch]);
  const availableCatalog = useMemo(
    () => installableCatalog(catalogMods, VERIFIED_CATALOG_MODS).map((mod) => localizeCatalogMod(mod, language)),
    [catalogMods, language],
  );
  const filteredCatalog = useMemo(() => searchCatalog(availableCatalog, catalogSearch), [availableCatalog, catalogSearch]);

  const announce = (message: string, type: "success" | "error" = "success") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4500);
  };

  const refreshAll = async () => {
    const [nextConfig, nextDlss, nextMods, sider, nextProfiles, nextHealth, nextConflicts, nextBackups, nextActivity, nextStatus, nextVersion, nextCatalog] = await Promise.all([
      api.getConfig(),
      api.getDlssSettings(),
      api.getManagedMods(),
      api.getSiderMods(),
      api.getProfiles(),
      api.getHealth(),
      api.getConflicts(),
      api.getBackups(),
      api.getActivity(),
      api.getLauncherStatus(),
      api.getVersion(),
      api.getCatalog(),
    ]);
    setConfig(nextConfig);
    setDlss(nextDlss);
    setMods(nextMods);
    setManualMods((sider.mods || []).filter((mod) => !mod.managed));
    setProfiles(nextProfiles);
    setHealth(nextHealth);
    setConflicts(nextConflicts);
    setBackups(nextBackups);
    setActivity(nextActivity);
    setStatus(nextStatus);
    setVersion(nextVersion.currentVersion);
    setUpdateStatus(nextVersion);
    setCatalogMods(nextCatalog);
  };

  useEffect(() => {
    refreshAll()
      .catch((error) => announce(error.message, "error"))
      .finally(() => setInitialLoading(false));
  }, []);

  // Suivi de session : boucle auto-planifiée qui ralentit quand le moteur local
  // est injoignable, au lieu de marteler l'API toutes les 1,5 s.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let failures = 0;

    const tick = async () => {
      try {
        const [nextStatus, nextVersion] = await Promise.all([api.getLauncherStatus(), api.getVersion()]);
        if (cancelled) return;
        setStatus(nextStatus);
        setUpdateStatus(nextVersion);
        failures = 0;
      } catch {
        failures += 1;
      }
      if (cancelled) return;
      const delay = failures === 0
        ? POLL_INTERVAL_MS
        : Math.min(POLL_INTERVAL_MS * 2 ** failures, POLL_BACKOFF_MAX_MS);
      timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  // Liste des journaux disponibles, reconstruite à chaque passage sur la page :
  // un module peut créer son fichier au premier lancement du jeu.
  useEffect(() => {
    if (page !== "logs") return;
    let cancelled = false;
    api.getLogs()
      .then((sources) => {
        if (cancelled) return;
        setLogSources(sources);
        setLogSourceId((current) => (current && sources.some((item) => item.id === current) ? current : sources[0]?.id ?? null));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [page, config.isLinked, status.isRunning]);

  // Lecture du journal sélectionné. On ne replanifie que si le suivi est actif,
  // et plus vite quand le jeu tourne : c'est là que les lignes arrivent.
  useEffect(() => {
    if (page !== "logs" || !logSourceId) return;
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      try {
        const next = await api.readLog(logSourceId, 600);
        if (!cancelled) setLogContent(next);
      } catch {
        // Fichier supprimé ou jeu délié : la liste sera reconstruite ensuite.
      }
      if (!cancelled && logFollow) timer = window.setTimeout(tick, status.isRunning ? 1_500 : 5_000);
    };
    void tick();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [page, logSourceId, logFollow, status.isRunning]);

  // Colle la vue au bas du fichier tant que le suivi est actif.
  useEffect(() => {
    if (!logFollow || page !== "logs") return;
    const view = logViewRef.current;
    if (view) view.scrollTop = view.scrollHeight;
  }, [logContent, logFollow, page]);

  /**
   * `label` alimente la barre de progression sous l'en-tête ; `itemId` marque la
   * ligne concernée pour que l'utilisateur voie *quel* mod travaille.
   */
  const runAction = async (
    action: () => Promise<unknown>,
    successMessage?: string,
    { label, itemId }: { label?: string; itemId?: string } = {},
  ) => {
    if (busy) return;
    setBusy(true);
    setTask({ label: label || t("desktop.refresh"), progress: null });
    if (itemId) setPendingId(itemId);
    try {
      const result = await action();
      if (result === false) return;
      setTask({ label: t("desktop.refresh"), progress: null });
      await refreshAll();
      if (successMessage) announce(successMessage);
    } catch (error: any) {
      announce(error.message || t("desktop.genericError"), "error");
    } finally {
      setBusy(false);
      setTask(null);
      setPendingId(null);
    }
  };

  const linkGame = () => runAction(async () => {
    const selection = await api.browseGameFolder();
    if (selection.cancelled || !selection.path) return false;
    await api.linkGame(selection.path);
  }, t("desktop.linkedSuccess"), { label: t("desktop.linkGame") });

  const installCatalogEntry = async (target: CatalogMod) => {
    for (const mod of catalogInstallPlan(target, availableCatalog, mods)) {
      const installed = installedCatalogMod(mod, mods);
      if (installed) {
        if (!installed.enabled) await api.toggleManagedMod(installed.id, true);
        continue;
      }
      setTask({ label: t("desktop.install") + " · " + mod.title, progress: null });
      if (catalogMods.some((item) => item.id === mod.id)) await api.installCatalogMod(mod.id);
      else await api.installRemoteCatalogMod(mod.repositoryUrl || "", mod.id);
    }
  };

  const importArchive = () => runAction(async () => {
    const selection = await api.browseArchive();
    if (selection.cancelled || !selection.path) return false;
    await api.installArchive(selection.path);
  }, config.isLinked ? t("desktop.archiveDeployed") : t("desktop.archivePrepared"), { label: t("desktop.installZip") });

  const installLegacyDlss = () => runAction(async () => {
    const selection = await api.browseLegacyDlssFile();
    if (selection.cancelled || !selection.path) return false;
    await api.installLegacyDlssPatch(selection.path);
  }, t("desktop.dlssLegacyInstalled"));

  const installDroppedArchive = (file: File) => {
    if (busy) return;
    if (!/\.(zip|rar)$/i.test(file.name)) {
      announce(t("desktop.dropOnlyZip"), "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024 * 1024) {
      announce(t("desktop.dropTooLarge"), "error");
      return;
    }
    void runAction(
      // L'envoi rapporte sa progression : c'est l'opération la plus longue.
      () => api.installUploadedArchive(file, (percent) => setTask({ label: file.name, progress: percent })),
      config.isLinked ? t("desktop.archiveDeployed") : t("desktop.archivePrepared"),
      { label: file.name },
    );
  };

  const handleArchiveDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDropActive(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length !== 1) {
      announce(t("desktop.dropOneFile"), "error");
      return;
    }
    installDroppedArchive(files[0]);
  };

  const moveMod = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= mods.length) return;
    const ordered = [...mods];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, moved);
    runAction(() => api.reorderMods(ordered.map((item) => item.id)), t("desktop.prioritiesDeployed"), { label: t("desktop.prioritiesDeployed"), itemId: moved.id });
  };

  const launchOrStop = () => {
    const starting = !status.isRunning;
    // Au démarrage on bascule tout de suite sur le journal : c'est là que se
    // voit ce que Sider charge, et l'attente devient lisible.
    if (starting) {
      setPage("logs");
      setLogFollow(true);
    }
    return runAction(
      () => (starting ? api.launchGame() : api.stopGame()),
      starting ? t("desktop.gameLaunched") : t("desktop.sessionStopped"),
      { label: starting ? t("desktop.launch") : t("desktop.stop") },
    );
  };

  const updateStateLabel = {
    disabled: t("desktop.updateDisabled"),
    idle: t("desktop.updateConfigured"),
    checking: t("desktop.updateChecking"),
    available: t("desktop.updateAvailable"),
    downloading: t("desktop.updateDownloading"),
    ready: t("desktop.updateReady"),
    upToDate: t("desktop.updateUpToDate"),
    error: t("desktop.updateError"),
  }[updateStatus.state];

  const updateAction = () => {
    if (updateStatus.state === "available") return runAction(() => api.downloadUpdate());
    if (updateStatus.state === "ready") return runAction(() => api.installUpdate());
    return runAction(() => api.checkForUpdate());
  };

  useEffect(() => {
    if (deepLinkHandled.current || initialLoading) return;
    const params = new URLSearchParams(window.location.search);
    const modId = params.get("installMod");
    const repository = params.get("repository");
    if (!modId) return;
    deepLinkHandled.current = true;
    setPage("catalog");
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("installMod");
    cleanUrl.searchParams.delete("repository");
    window.history.replaceState({}, "", cleanUrl);
    void runAction(() => { const entry = availableCatalog.find((mod) => mod.id === modId); return entry ? installCatalogEntry(entry) : repository ? api.installRemoteCatalogMod(repository, modId) : api.installCatalogMod(modId); }, config.isLinked
      ? t("desktop.hubInstalled")
      : t("desktop.hubPrepared"));
  }, [initialLoading, config.isLinked, availableCatalog, t]);

  if (initialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--sk-void)] font-poppins text-white">
        <div className="relative flex flex-col items-center gap-6">
          <div className="absolute -inset-24 rounded-full bg-[#711361]/25 blur-[90px]" aria-hidden="true" />
          <div className="relative motion-logo"><StrykerLogo size={96} /></div>
          <div className="relative h-px w-40 overflow-hidden bg-white/10">
            <span className="absolute inset-y-0 left-0 w-1/3 animate-[sk-scan_1.4s_ease-in-out_infinite] bg-[color:var(--sk-brand-glow)]" />
          </div>
          <p className="sk-label relative">{t("desktop.loading")}</p>
        </div>
        <style>{"@keyframes sk-scan{0%{transform:translateX(-120%)}100%{transform:translateX(400%)}}"}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--sk-void)] font-poppins text-white lg:flex">
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={`sk-toast fixed bottom-5 right-5 z-[80] max-w-md px-4 py-3.5 text-xs font-semibold ${
            notice.type === "success"
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
              : "border-rose-400/40 bg-rose-500/15 text-rose-100"
          }`}
        >
          <span className="flex items-start gap-2.5">
            {notice.type === "success"
              ? <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-300" />
              : <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-rose-300" />}
            {notice.message}
          </span>
        </div>
      )}

      {/* ---------------------------------------------------------------- RAIL */}
      <aside className="z-30 shrink-0 border-b border-white/10 bg-[color:var(--sk-surface)] lg:sticky lg:top-0 lg:h-screen lg:w-[var(--sk-rail)] lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
            <div className="motion-logo"><StrykerLogo size={40} /></div>
            <div className="min-w-0">
              <p className="sk-display text-[1.35rem] leading-none">STRYKER</p>
              <p className="mt-1 text-[8px] font-black uppercase tracking-[0.18em] text-[color:var(--sk-brand-glow)]">
                Mod Manager · v{version}
              </p>
            </div>
          </div>

          <div className="px-4 pt-4">
            <div className="sk-panel overflow-hidden">
              <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
                <p className="sk-label">{t("desktop.activeGame")}</p>
                <span className={`relative mt-0.5 flex h-2 w-2 shrink-0 rounded-full ${config.isLinked ? "bg-[color:var(--sk-ok)]" : "bg-[color:var(--sk-warn)]"}`}>
                  {config.isLinked && <span className="absolute inset-0 animate-ping rounded-full bg-[color:var(--sk-ok)] opacity-60" />}
                </span>
              </div>
              <p className="truncate px-3.5 pt-1.5 text-[13px] font-black tracking-tight">
                {config.isLinked ? config.detectedVersion : t("desktop.noGame")}
              </p>
              <p className="truncate px-3.5 pb-3 pt-1 font-mono text-[9px] text-[color:var(--sk-ghost)]">
                {config.isLinked ? config.gamePath : t("desktop.gameUnlinked")}
              </p>
              {status.isRunning && (
                <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-emerald-500/10 px-3.5 py-2">
                  <span className="sk-label text-emerald-200/80">{t("desktop.launch")}</span>
                  <span className="font-mono text-[10px] font-bold text-emerald-200">{formatDuration(status.playDurationSeconds)}</span>
                </div>
              )}
            </div>
          </div>

          <nav aria-label={t("desktop.navigation")} className="grid grid-cols-2 gap-1 overflow-y-auto px-4 py-4 sm:grid-cols-3 lg:flex lg:flex-1 lg:flex-col">
            {navigation.map((item, index) => {
              const Icon = item.icon;
              const badge = item.id === "conflicts" && conflictBadge > 0 ? conflictBadge : null;
              const active = page === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setPage(item.id)}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className="sk-rail-item"
                >
                  {/* Le numéro est masqué sur les écrans étroits : il vole la
                      place nécessaire aux libellés longs du menu à deux colonnes. */}
                  <span className="sk-rail-index hidden sm:inline">{String(index + 1).padStart(2, "0")}</span>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-left">{item.label}</span>
                  {badge ? (
                    <span className="rounded-full bg-[color:var(--sk-warn)] px-1.5 text-[9px] font-black text-black">{badge}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="hidden border-t border-white/10 px-5 py-3.5 lg:block">
            <p className="text-[8px] font-black uppercase tracking-[0.16em] text-[color:var(--sk-ghost)]">
              Find. Install. Play.
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* ------------------------------------------------------------ TOPBAR */}
        <header className="sticky top-0 z-30 flex min-h-[var(--sk-topbar)] flex-col justify-between gap-3 border-b border-white/10 bg-[color:var(--sk-ink)]/85 px-5 py-4 backdrop-blur-xl sm:flex-row sm:items-center lg:px-8">
          <div className="min-w-0">
            <p className="sk-eyebrow">
              {t("desktop.profile")} · {activeProfileLabel}
            </p>
            <h1 className="sk-display mt-1.5 text-[clamp(1.5rem,2.6vw,2rem)]">
              {navigation.find((item) => item.id === page)?.label}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher compact />
            <button
              onClick={() => runAction(() => Promise.resolve(), t("desktop.updated"), { label: t("desktop.refresh") })}
              disabled={busy}
              aria-label={t("desktop.refresh")}
              className="sk-icon-btn"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={launchOrStop}
              disabled={busy || (!status.isRunning && !config.isLinked)}
              className={`sk-btn ${status.isRunning ? "sk-btn-danger" : "sk-btn-primary"}`}
            >
              {status.isRunning ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
              {status.isRunning
                ? `${t("desktop.stop")} · ${formatDuration(status.playDurationSeconds)}`
                : config.isLinked ? t("desktop.launch") : t("desktop.gameUnlinked")}
            </button>
          </div>
        </header>

        {/* Barre de tâche : visible pour toute opération, avec un pourcentage
            réel quand l'opération sait où elle en est. */}
        {(task || (updateStatus.state === "downloading" && updateStatus.updaterConfigured)) && (
          <div className="sk-taskbar sticky top-[var(--sk-topbar)] z-20 px-5 py-2.5 lg:px-8" role="status" aria-live="polite">
            <div className="mx-auto flex max-w-[1500px] items-center gap-3">
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-[color:var(--sk-accent)]" />
              <span className="sk-label shrink-0 text-[color:var(--sk-muted)]">
                {updateStatus.state === "downloading" && !task ? t("desktop.updateDownloading") : task?.label}
              </span>
              <div className="min-w-0 flex-1">
                <ProgressBar value={updateStatus.state === "downloading" && !task ? updateStatus.progress : task?.progress ?? null} />
              </div>
              {(() => {
                const shown = updateStatus.state === "downloading" && !task ? updateStatus.progress : task?.progress;
                return typeof shown === "number"
                  ? <span className="shrink-0 font-mono text-[11px] font-bold text-[color:var(--sk-accent-soft)]">{Math.round(shown)} %</span>
                  : null;
              })()}
            </div>
          </div>
        )}

        <main className="mx-auto max-w-[1500px] p-5 lg:p-8">
          {updateStatus.updaterConfigured && ["available", "downloading", "ready"].includes(updateStatus.state) && (
            <section className="sk-statusband mb-6 flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center" aria-label={t("desktop.updateTitle")}>
              <div>
                <p className="sk-eyebrow text-sky-300">{t("desktop.updateTitle")}</p>
                <p className="mt-2 text-sm font-black">
                  {updateStatus.availableVersion ? `v${updateStatus.availableVersion}` : t("desktop.updateTitle")}
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--sk-muted)]">
                  {updateStateLabel}{updateStatus.state === "downloading" ? ` · ${Math.round(updateStatus.progress)} %` : ""}
                </p>
              </div>
              {updateStatus.state !== "downloading" && (
                <button onClick={updateAction} disabled={busy} className="sk-btn sk-btn-primary">
                  {updateStatus.state === "ready" ? t("desktop.updateInstall") : t("desktop.updateDownload")}
                </button>
              )}
            </section>
          )}

          {/* --------------------------------------------------------- DASHBOARD */}
          {page === "dashboard" && (
            <div className="space-y-6">
              <section className="sk-statusband flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
                <img src="/stryker-logo.png" alt="" aria-hidden="true" width={1536} height={1024} decoding="async" className="sk-watermark -right-16 -top-20 w-[26rem] max-w-none" />
                <div className="relative min-w-0">
                  <p className="sk-eyebrow">{t("desktop.activeGame")}</p>
                  <h2 className="sk-display mt-3 text-[clamp(1.9rem,4.4vw,3.2rem)]">
                    {config.isLinked ? config.detectedVersion : t("desktop.noGame")}
                  </h2>
                  <p className="mt-3 truncate font-mono text-[10px] text-[color:var(--sk-faint)]">
                    {config.isLinked ? config.gamePath : t("desktop.gameUnlinked")}
                  </p>
                </div>
                <div className="relative flex shrink-0 flex-wrap items-center gap-2.5">
                  <span className="sk-chip" data-tone={status.isRunning ? "ok" : config.isLinked ? "brand" : "warn"}>
                    {status.isRunning
                      ? `${t("desktop.activeStatus")} · ${formatDuration(status.playDurationSeconds)}`
                      : config.isLinked ? t("desktop.gameLinked") : t("desktop.gameUnlinked")}
                  </span>
                  {config.isLinked ? (
                    <button onClick={launchOrStop} disabled={busy} className={`sk-btn ${status.isRunning ? "sk-btn-danger" : "sk-btn-brand"}`}>
                      {status.isRunning ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                      {status.isRunning ? t("desktop.stop") : t("desktop.launch")}
                    </button>
                  ) : (
                    <button onClick={linkGame} disabled={busy} className="sk-btn sk-btn-brand">
                      <FolderSearch className="h-3.5 w-3.5" /> {t("desktop.linkGame")}
                    </button>
                  )}
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric index="01" icon={PackageOpen} label={t("desktop.managedMods")} value={String(mods.length)} detail={`${mods.filter((mod) => mod.enabled).length} ${t("desktop.active")}`} />
                <Metric index="02" icon={UserRoundCog} label={t("desktop.activeProfile")} value={activeProfileLabel} detail={`${activeProfile?.enabledCount || 0} mods ${t("desktop.active")}`} />
                <Metric index="03" icon={Wrench} label={t("desktop.conflicts")} value={String(conflicts?.total || 0)} detail={t("desktop.siderOrder")} warning={Boolean(conflicts?.total)} />
                <Metric index="04" icon={ArchiveRestore} label={t("desktop.backups")} value={String(backups.length)} detail={`${t("desktop.lastDeployment")} : ${formatDate(health?.deployment.lastDeployedAt, language, t("desktop.never"))}`} />
              </section>

              {!config.isLinked ? (
                <section className="flex flex-col justify-between gap-4 rounded-[var(--sk-r-lg)] border border-amber-400/30 bg-amber-400/[0.07] p-5 md:flex-row md:items-center">
                  <div className="flex gap-3.5">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                    <div>
                      <h2 className="sk-display text-base text-amber-100">{t("desktop.linkTitle")}</h2>
                      <p className="mt-1.5 text-xs leading-relaxed text-amber-100/60">{t("desktop.linkDescription")}</p>
                    </div>
                  </div>
                  <button onClick={linkGame} disabled={busy} className="sk-btn shrink-0 bg-amber-300 text-black hover:bg-amber-200">
                    <FolderSearch className="h-3.5 w-3.5" /> {t("desktop.linkGame")}
                  </button>
                </section>
              ) : null}

              <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <Panel
                  title={t("desktop.health")}
                  icon={HeartPulse}
                  action={<button onClick={() => setPage("settings")} className="sk-cta text-xs">{t("desktop.settings")}</button>}
                >
                  <div className="divide-y divide-white/[0.06]">
                    {health?.checks.map((check) => {
                      const text = localizeHealthCheck(check);
                      return (
                        <div key={check.id} className="sk-row flex items-start gap-3 px-2 py-3">
                          {check.ok
                            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--sk-ok)]" />
                            : check.warning
                              ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--sk-warn)]" />
                              : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--sk-danger)]" />}
                          <div className="min-w-0">
                            <p className="text-xs font-bold">{text.label}</p>
                            <p className="mt-0.5 truncate font-mono text-[10px] text-[color:var(--sk-faint)]">{text.detail}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                <Panel title={t("desktop.activity")} icon={Activity}>
                  <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                    {activity.length === 0 ? <Empty text={t("desktop.noActivity")} /> : activity.slice(0, 12).map((item) => (
                      <div key={item.id} className="sk-row border-l-2 border-[color:var(--sk-brand)] py-2 pl-3 pr-2">
                        <p className="text-xs leading-relaxed text-white/80">{item.message}</p>
                        <p className="mt-1 font-mono text-[9px] text-[color:var(--sk-ghost)]">{formatDate(item.createdAt, language, t("desktop.never"))}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </section>
            </div>
          )}

          {/* -------------------------------------------------------------- MODS */}
          {page === "mods" && (
            <div className="space-y-6">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("desktop.searchMods")}
                  className="sk-input md:max-w-lg"
                />
                <button onClick={importArchive} disabled={busy} className="sk-btn sk-btn-brand">
                  <Download className="h-3.5 w-3.5" /> {t("desktop.installZip")}
                </button>
              </div>

              <section
                data-testid="mod-drop-zone"
                aria-label={t("desktop.dropTitle")}
                aria-busy={busy}
                onDragEnter={(event) => { event.preventDefault(); if (!busy) setDropActive(true); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; if (!busy) setDropActive(true); }}
                onDragLeave={(event) => {
                  const relatedTarget = event.relatedTarget;
                  if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) setDropActive(false);
                }}
                onDrop={handleArchiveDrop}
                className={`rounded-[var(--sk-r-xl)] border-2 border-dashed p-8 transition-colors duration-300 ${
                  busy
                    ? "border-white/10 bg-white/[0.02] opacity-60"
                    : dropActive
                      ? "border-[color:var(--sk-brand-glow)] bg-[#711361]/25"
                      : "border-white/15 bg-[color:var(--sk-surface)] hover:border-[color:var(--sk-line-brand)]"
                }`}
              >
                <div className="pointer-events-none flex flex-col items-center justify-center gap-4 text-center sm:flex-row sm:text-left">
                  <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-[var(--sk-r-md)] transition-colors ${dropActive ? "bg-[color:var(--sk-brand-glow)] text-[#37002E]" : "bg-[#711361]/25 text-[color:var(--sk-brand-glow)]"}`}>
                    <UploadCloud className="h-7 w-7" />
                  </span>
                  <div>
                    <h2 className="sk-display text-lg">
                      {busy ? t("desktop.dropBusy") : dropActive ? t("desktop.dropActive") : t("desktop.dropTitle")}
                    </h2>
                    <p className="mt-1.5 max-w-2xl text-[11px] leading-relaxed text-[color:var(--sk-muted)]">{t("desktop.dropDescription")}</p>
                    <p className="mt-2 text-[9px] font-black uppercase tracking-[0.16em] text-[color:var(--sk-brand-glow)]">{t("desktop.dropLimit")}</p>
                  </div>
                </div>
              </section>

              <Panel title={t("desktop.managedMods")} icon={ShieldCheck} count={filteredMods.length}>
                {filteredMods.length === 0 ? <Empty text={t("desktop.noManagedMods")} /> : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[880px]">
                      <div className="grid grid-cols-[56px_minmax(240px,1fr)_120px_100px_128px_140px] gap-3 border-b border-white/10 px-3 pb-2.5">
                        <span className="sk-label">{t("desktop.order")}</span>
                        <span className="sk-label">{t("desktop.mod")}</span>
                        <span className="sk-label">{t("desktop.type")}</span>
                        <span className="sk-label">{t("desktop.version")}</span>
                        <span className="sk-label">{t("desktop.state")}</span>
                        <span className="sk-label text-right">{t("desktop.actions")}</span>
                      </div>
                      <div className="divide-y divide-white/[0.05]">
                        {filteredMods.map((mod) => {
                          const trueIndex = mods.findIndex((item) => item.id === mod.id);
                          return (
                            <div
                              key={mod.id}
                              className={`sk-row grid grid-cols-[56px_minmax(240px,1fr)_120px_100px_128px_140px] items-center gap-3 px-3 py-3 ${mod.enabled ? "" : "opacity-50"}`}
                            >
                              <span className="grid h-8 w-8 place-items-center rounded-[var(--sk-r-xs)] border border-white/10 bg-white/[0.04] text-[11px] font-black">
                                {mod.priority}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-xs font-black tracking-tight">{mod.name}</p>
                                <p className="mt-1 truncate font-mono text-[9px] text-[color:var(--sk-ghost)]">
                                  {mod.author} · {mod.installCount && mod.installCount > 1 ? t("desktop.reinstalledState") : t("desktop.installedState")} · SHA-256 {mod.archiveHash.slice(0, 10)}…
                                </p>
                              </div>
                              <span className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-[color:var(--sk-muted)]">
                                {mod.components.map((component) => component.type).join(" + ")}
                              </span>
                              <span className="text-[11px] font-semibold text-[color:var(--sk-muted)]">{mod.version}</span>
                              <button
                                role="switch"
                                aria-checked={mod.enabled}
                                aria-label={`${mod.enabled ? t("desktop.disable") : t("desktop.enable")} ${mod.name}`}
                                onClick={() => runAction(
                                  () => api.toggleManagedMod(mod.id, !mod.enabled),
                                  mod.enabled ? t("desktop.disabled") : t("desktop.enabled"),
                                  { label: `${mod.enabled ? t("desktop.disable") : t("desktop.enable")} · ${mod.name}`, itemId: mod.id },
                                )}
                                className="flex items-center gap-2.5 text-[9px] font-black uppercase tracking-[0.08em]"
                              >
                                <span className="sk-switch" data-on={mod.enabled ? "on" : "off"}><span /></span>
                                {pendingId === mod.id ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-[color:var(--sk-accent)]" />
                                ) : (
                                  <span className={mod.enabled ? "text-[color:var(--sk-ok)]" : "text-[color:var(--sk-ghost)]"}>
                                    {mod.enabled ? t("desktop.activeStatus") : t("desktop.disabledState")}
                                  </span>
                                )}
                              </button>
                              <div className="flex justify-end gap-1.5">
                                <IconButton label={`${t("desktop.moveUp")} ${mod.name}`} disabled={trueIndex === 0} onClick={() => moveMod(trueIndex, "up")}><ArrowUp className="h-4 w-4" /></IconButton>
                                <IconButton label={`${t("desktop.moveDown")} ${mod.name}`} disabled={trueIndex === mods.length - 1} onClick={() => moveMod(trueIndex, "down")}><ArrowDown className="h-4 w-4" /></IconButton>
                                <IconButton
                                  label={`${t("desktop.uninstall")} ${mod.name}`}
                                  danger
                                  onClick={() => { if (window.confirm(`${t("desktop.uninstall")} ${mod.name} ? ${t("desktop.uninstallConfirm")}`)) runAction(() => api.uninstallMod(mod.id), t("desktop.uninstalled"), { label: `${t("desktop.uninstall")} · ${mod.name}`, itemId: mod.id }); }}
                                ><Trash2 className="h-4 w-4" /></IconButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title={t("desktop.manualEntries")} icon={Wrench} count={manualMods.length}>
                <p className="mb-4 text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{t("desktop.manualDescription")}</p>
                <div className="space-y-1.5">
                  {manualMods.length === 0 ? <Empty text={t("desktop.noManual")} /> : manualMods.map((mod) => (
                    <div key={`${mod.id}-${mod.lineIndex}`} className="sk-row flex items-center gap-3 border border-white/[0.06] bg-black/20 px-3.5 py-2.5">
                      <span className="flex-1 truncate text-xs font-bold">{mod.name}</span>
                      <code className="hidden max-w-md truncate font-mono text-[9px] text-[color:var(--sk-ghost)] md:block">{mod.siderLine}</code>
                      <button
                        role="switch"
                        aria-checked={mod.enabled}
                        aria-label={`${mod.enabled ? t("desktop.disable") : t("desktop.enable")} ${t("desktop.manualEntry")} ${mod.name}`}
                        onClick={() => runAction(() => api.toggleManualMod(mod.lineIndex, !mod.enabled), t("desktop.manualUpdated"), { label: mod.name })}
                        className="sk-switch"
                        data-on={mod.enabled ? "brand" : "off"}
                      ><span /></button>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {/* ----------------------------------------------------------- CATALOG */}
          {page === "catalog" && (
            <div className="space-y-5">
              <div className="flex flex-col justify-between gap-3 rounded-[var(--sk-r-lg)] border border-emerald-400/25 bg-emerald-500/[0.08] p-4 sm:flex-row sm:items-center">
                <p className="flex gap-3 text-[11px] leading-relaxed text-emerald-100/75">
                  <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-emerald-300" />
                  {t("desktop.catalogIntro")}
                </p>
                <button onClick={importArchive} disabled={busy} className="sk-btn sk-btn-primary shrink-0">
                  <Download className="h-3.5 w-3.5" /> {t("desktop.installDownloaded")}
                </button>
              </div>

              <label className="relative block">
                <span className="sr-only">{t("catalog.searchLabel")}</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input type="search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder={t("catalog.search")} className="sk-input pl-10" />
              </label>
              <Panel title={t("desktop.catalog")} icon={Library} count={filteredCatalog.length}>
                {filteredCatalog.length === 0 ? <Empty text={catalogSearch.trim() ? t("catalog.noResults") : t("desktop.noPublished")} /> : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredCatalog.map((mod) => {
                      const installedMod = installedCatalogMod(mod, mods);
                      return (
                        <ModCard key={mod.id} mod={mod} installed={Boolean(installedMod)} pending={pendingId === mod.id}
                          badge={t("desktop.hosted")} badgeTone="brand" installedLabel={t("desktop.installedState")} meta={mod.size}>
                          {installedMod ? <>
                            <button onClick={() => runAction(() => api.toggleManagedMod(installedMod.id, !installedMod.enabled), installedMod.enabled ? t("desktop.disabled") : t("desktop.enabled"), { label: mod.title, itemId: mod.id })} disabled={busy} className="sk-btn sk-btn-ghost flex-1">
                              {installedMod.enabled ? t("desktop.disable") : t("desktop.enable")}
                            </button>
                            <button aria-label={t("desktop.uninstall") + " " + mod.title} onClick={() => runAction(() => api.uninstallMod(installedMod.id), t("desktop.uninstalled"), { label: t("desktop.uninstall") + " · " + mod.title, itemId: mod.id })} disabled={busy} className="sk-btn sk-btn-danger flex-1">
                              <Trash2 className="h-3.5 w-3.5" />{t("desktop.uninstall")}
                            </button>
                          </> : (
                            <button onClick={() => runAction(() => installCatalogEntry(mod), config.isLinked ? t("desktop.hubInstalled") : t("desktop.hubPrepared"), { label: t("desktop.install") + " · " + mod.title, itemId: mod.id })} disabled={busy} className="sk-btn sk-btn-primary flex-1">
                              <Download className="h-3.5 w-3.5" />{t("desktop.install")}
                            </button>
                          )}
                        </ModCard>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>
          )}

          {/* ---------------------------------------------------------- PROFILES */}
          {page === "profiles" && (
            <div className="space-y-5">
              <div className="flex justify-end">
                <button onClick={() => setProfileFormOpen(true)} className="sk-btn sk-btn-brand">
                  <Plus className="h-3.5 w-3.5" /> {t("desktop.newProfile")}
                </button>
              </div>

              {profileFormOpen && (
                <section className="sk-panel space-y-3 border-[color:var(--sk-line-brand)] p-5" aria-label={t("desktop.createProfile")}>
                  <p className="sk-eyebrow">{t("desktop.createProfile")}</p>
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={t("desktop.profileName")} className="sk-input" />
                  <textarea value={profileDescription} onChange={(event) => setProfileDescription(event.target.value)} placeholder={t("desktop.optionalDescription")} className="sk-input min-h-20 resize-y" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setProfileFormOpen(false)} className="sk-btn sk-btn-ghost border-transparent">{t("desktop.cancel")}</button>
                    <button
                      disabled={!profileName.trim() || busy}
                      onClick={() => runAction(async () => { await api.createProfile(profileName, profileDescription, true); setProfileName(""); setProfileDescription(""); setProfileFormOpen(false); }, t("desktop.profileCreated"))}
                      className="sk-btn sk-btn-primary"
                    >{t("desktop.createClone")}</button>
                  </div>
                </section>
              )}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {profiles.map((profile, index) => (
                  <article
                    key={profile.id}
                    className={`sk-panel relative overflow-hidden p-5 ${profile.active ? "border-[color:var(--sk-line-brand)]" : ""}`}
                  >
                    {profile.active && <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--sk-brand-glow)] to-transparent" />}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="sk-rail-index">{String(index + 1).padStart(2, "0")}</p>
                        <h2 className="sk-display mt-1.5 text-lg">{profile.id === "default" ? t("desktop.mainProfile") : profile.name}</h2>
                        <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{profile.description || t("desktop.noDescription")}</p>
                      </div>
                      {profile.active && <span className="sk-chip" data-tone="ok">{t("desktop.activeStatus")}</span>}
                    </div>
                    <p className="mt-5 text-xs font-bold text-[color:var(--sk-muted)]">
                      <span className="text-lg font-black text-white">{profile.enabledCount}</span> {t("desktop.active")}
                      <span className="text-[color:var(--sk-ghost)]"> / {profile.modCount} {t("desktop.installed")}</span>
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        disabled={profile.active || busy}
                        onClick={() => runAction(() => api.activateProfile(profile.id), `${t("desktop.profile")} « ${profile.id === "default" ? t("desktop.mainProfile") : profile.name} » ${t("desktop.profileActivated")}`)}
                        className="sk-btn sk-btn-ghost flex-1"
                      >{t("desktop.activate")}</button>
                      {profile.id !== "default" && (
                        <IconButton
                          danger
                          label={`${t("desktop.delete")} ${profile.name}`}
                          onClick={() => { if (window.confirm(`${t("desktop.delete")} ${t("desktop.profile").toLowerCase()} ${profile.name} ? ${t("desktop.deleteProfileConfirm")}`)) runAction(() => api.deleteProfile(profile.id), t("desktop.profileDeleted")); }}
                        ><Trash2 className="h-4 w-4" /></IconButton>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* --------------------------------------------------------- CONFLICTS */}
          {page === "conflicts" && (
            <div className="space-y-6">
              <Panel title={t("desktop.liveCpkConflicts")} icon={Wrench} count={conflicts?.total || 0}>
                <p className="mb-4 text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{t("desktop.conflictDescription")}</p>
                {!conflicts?.conflicts.length ? <Empty text={t("desktop.noConflict")} /> : (
                  <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                    {conflicts.conflicts.slice(0, 1000).map((conflict) => (
                      <div key={`${conflict.file}-${conflict.modIds.join("-")}`} className="rounded-[var(--sk-r-sm)] border border-amber-400/20 bg-amber-400/[0.05] p-3">
                        <code className="break-all font-mono text-[10px] text-amber-100">{conflict.file}</code>
                        <p className="mt-2 text-[10px] text-[color:var(--sk-faint)]">
                          {t("desktop.winner")} : <strong className="text-white/80">{mods.find((mod) => mod.id === conflict.winnerModId)?.name || conflict.winnerModId}</strong>
                          {" · "}{t("desktop.overwrites")} {conflict.loserModIds.map((id) => mods.find((mod) => mod.id === id)?.name || id).join(", ")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title={t("desktop.dependencies")} icon={AlertTriangle} count={conflicts?.dependencyIssues.length || 0}>
                {!conflicts?.dependencyIssues.length ? <Empty text={t("desktop.dependenciesOk")} /> : conflicts.dependencyIssues.map((issue) => (
                  <div key={`${issue.modId}-${issue.dependency.id}`} className="border-b border-white/[0.06] py-2.5 text-xs text-[color:var(--sk-muted)]">
                    {mods.find((mod) => mod.id === issue.modId)?.name || issue.modId} {t("desktop.requires")} <strong className="text-white">{issue.dependency.id}</strong> ({issue.reason === "missing" ? t("desktop.missing") : t("desktop.dependencyDisabled")}).
                  </div>
                ))}
              </Panel>
            </div>
          )}

          {/* -------------------------------------------------------------- LOGS */}
          {page === "logs" && (
            <div className="space-y-5">
              {!config.isLinked ? (
                <section className="flex gap-3.5 border border-amber-400/30 bg-amber-400/[0.07] p-5">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <div>
                    <h2 className="sk-display text-base text-amber-100">{logCopy.notLinked}</h2>
                    <p className="mt-1.5 text-xs leading-relaxed text-amber-100/65">{logCopy.notLinkedHint}</p>
                  </div>
                </section>
              ) : logSources.length === 0 ? (
                <Empty text={`${logCopy.empty} · ${logCopy.emptyHint}`} />
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="sk-segment" role="group" aria-label={logCopy.sources}>
                      {logSources.map((source) => (
                        <button
                          key={source.id}
                          type="button"
                          className="sk-segment-item"
                          data-active={source.id === logSourceId}
                          aria-pressed={source.id === logSourceId}
                          onClick={() => { setLogSourceId(source.id); setLogContent(null); }}
                        >
                          {source.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="relative block">
                        <span className="sr-only">{logCopy.searchLabel}</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--sk-ghost)]" />
                        <input
                          value={logSearch}
                          onChange={(event) => setLogSearch(event.target.value)}
                          placeholder={logCopy.search}
                          className="sk-input w-56 pl-9"
                        />
                      </label>
                      <button
                        type="button"
                        aria-pressed={logFollow}
                        onClick={() => setLogFollow((value) => !value)}
                        className={`sk-btn ${logFollow ? "sk-btn-brand" : "sk-btn-ghost"}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${logFollow ? "animate-pulse bg-white" : "bg-[color:var(--sk-ghost)]"}`} />
                        {logFollow ? logCopy.live : logCopy.paused}
                      </button>
                    </div>
                  </div>

                  <section className="sk-panel overflow-hidden">
                    <div className="sk-panel-head">
                      <h2 className="sk-display flex items-center gap-2.5 text-base">
                        <ScrollText className="h-4 w-4 text-[color:var(--sk-brand-glow)]" />
                        {logSources.find((item) => item.id === logSourceId)?.label || logCopy.nav}
                        <span className="border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-black not-italic text-[color:var(--sk-faint)]">
                          {visibleLogLines.length} {logCopy.lines}
                        </span>
                      </h2>
                      <span className="sk-label">
                        {logContent ? `${logCopy.updatedAt} ${formatDate(logContent.updatedAt, language, t("desktop.never"))}` : logCopy.loading}
                      </span>
                    </div>
                    <div ref={logViewRef} className="sk-log h-[58vh] border-0">
                      {visibleLogLines.length === 0 ? (
                        <p className="p-6 text-center text-xs text-[color:var(--sk-ghost)]">
                          {logSearch.trim() ? logCopy.noMatch : logCopy.loading}
                        </p>
                      ) : visibleLogLines.map((line, index) => (
                        <span key={`${index}-${line.slice(0, 24)}`} className="sk-log-line" data-level={logLineLevel(line)}>
                          <LogLine line={line} query={logSearch.trim()} />
                        </span>
                      ))}
                    </div>
                    {logContent?.truncated && (
                      <p className="border-t border-white/10 px-4 py-2 text-[10px] text-[color:var(--sk-ghost)]">{logCopy.truncated}</p>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------- SETTINGS */}
          {page === "settings" && (
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title={t("desktop.installation")} icon={FolderSearch}>
                <dl className="space-y-4 text-xs">
                  <Setting label={t("desktop.gameVersion")} value={config.detectedVersion} />
                  <Setting label={t("desktop.gameFolder")} value={config.gamePath || t("desktop.notLinked")} mono />
                  <Setting label={t("desktop.executable")} value={config.gameExecutablePath || t("desktop.notConfigured")} mono />
                  <Setting label={t("desktop.siderConfig")} value={config.siderPath || t("desktop.notConfigured")} mono />
                  <Setting label={t("desktop.staging")} value={config.stagingPath || t("desktop.notConfigured")} mono />
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button onClick={linkGame} disabled={busy} className="sk-btn sk-btn-brand">
                    {config.isLinked ? t("desktop.changeInstallation") : t("desktop.linkInstallation")}
                  </button>
                  {config.isLinked && (
                    <button onClick={() => runAction(() => api.unlinkGame(), t("desktop.gameUnlinkedSuccess"))} className="sk-btn sk-btn-ghost">
                      {t("desktop.unlink")}
                    </button>
                  )}
                </div>
              </Panel>

              <Panel title={t("desktop.launchSettings")} icon={Play}>
                <label className="sk-label mb-2 block" htmlFor="launch-mode">{t("desktop.method")}</label>
                <select
                  id="launch-mode"
                  value={config.launchMode}
                  onChange={(event) => setConfig({ ...config, launchMode: event.target.value as "game" | "sider", autoStartSider: true })}
                  className="sk-input"
                >
                  <option value="game">{t("desktop.officialLauncher")}</option>
                  {!/ start\.exe$/i.test(config.gameExecutablePath) && <option value="sider">{t("desktop.siderOneClick")}</option>}
                </select>
                <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{t("desktop.launchHelp")}</p>
                <button
                  onClick={() => runAction(() => api.saveConfig({ autoStartSider: config.autoStartSider, launchMode: config.launchMode }), t("desktop.launchSaved"))}
                  className="sk-btn sk-btn-primary mt-4"
                >{t("desktop.save")}</button>
              </Panel>

              <Panel title={t("desktop.dlssTitle")} icon={Sparkles}>
                <div className="flex items-center justify-between gap-4 rounded-[var(--sk-r-md)] border border-white/10 bg-black/25 p-4">
                  <div>
                    <p className="sk-display text-sm">{t("desktop.dlssNeuralRendering")}</p>
                    <p className={`mt-1 text-[11px] ${dlss.installed ? "text-emerald-300" : "text-amber-300"}`}>
                      {dlss.installed ? t("desktop.dlssDetected") : t("desktop.dlssIncomplete")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || status.isRunning || !dlss.configurable}
                    aria-pressed={dlss.enabled}
                    onClick={() => runAction(
                      () => api.saveDlssSettings({ enabled: !dlss.enabled }),
                      !dlss.enabled ? t("desktop.dlssEnabled") : t("desktop.dlssDisabled"),
                    )}
                    className={`sk-btn min-w-24 ${dlss.enabled ? "bg-emerald-400 text-emerald-950" : "sk-btn-ghost"}`}
                  >
                    {dlss.enabled ? t("desktop.activeStatus") : t("desktop.disabled")}
                  </button>
                </div>

                {/* Le réglage fin vit dans sa propre fenêtre : curseurs, préréglages
                    et panneau F10. On ne garde ici que l'état et l'accès. */}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--sk-r-md)] border border-white/10 bg-black/25 p-3.5">
                    <p className="sk-label">{t("desktop.dlssQuality")}</p>
                    <p className="mt-1.5 text-xs font-black">{dlssQualityLabel}</p>
                  </div>
                  <div className="rounded-[var(--sk-r-md)] border border-white/10 bg-black/25 p-3.5">
                    <p className="sk-label">{dlssCopy.panel}</p>
                    <p className={`mt-1.5 text-xs font-black ${dlss.overlay.configured ? "text-emerald-300" : "text-amber-300"}`}>
                      {dlss.overlay.configured ? dlssCopy.panelOn : dlssCopy.panelOff}
                    </p>
                  </div>
                </div>

                {dlss.missingFiles.length > 0 && <p className="mt-3 break-words text-[10px] leading-relaxed text-amber-200/70">{t("desktop.dlssMissing")} {dlss.missingFiles.join(", ")}</p>}
                <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{status.isRunning ? t("desktop.dlssCloseGame") : t("desktop.dlssRestart")}</p>

                <button
                  onClick={openDlssStudio}
                  disabled={!dlss.configurable}
                  className="sk-btn sk-btn-primary mt-4"
                ><Sparkles className="h-3.5 w-3.5" />{dlssCopy.open}</button>

                <div className="mt-5 rounded-[var(--sk-r-md)] border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="sk-display text-sm">{t("desktop.dlssCompatibility")}</p>
                      <p className="mt-1 text-[11px] text-[color:var(--sk-muted)]">{dlss.compatibility.gpuName || t("desktop.dlssGpuUnknown")}</p>
                    </div>
                    <span
                      className="sk-chip"
                      data-tone={
                        dlss.compatibility.gpuGeneration === "rtx50" || dlss.compatibility.patchInstalled
                          ? "ok"
                          : dlss.compatibility.needsLegacyPatch ? "warn" : undefined
                      }
                    >
                      {dlss.compatibility.gpuGeneration === "rtx50"
                        ? t("desktop.dlssNativeBranch")
                        : dlss.compatibility.patchInstalled ? t("desktop.dlssLegacyReady")
                          : dlss.compatibility.needsLegacyPatch ? t("desktop.dlssLegacyRequired") : t("desktop.dlssUnsupported")}
                    </span>
                  </div>
                  {dlss.compatibility.needsLegacyPatch && (
                    <>
                      <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{t("desktop.dlssLegacyHelp")}</p>
                      <p className="mt-2 break-all font-mono text-[9px] text-[color:var(--sk-ghost)]">DLSSNR {dlss.compatibility.pinnedVersion} · SHA-256 {dlss.compatibility.pinnedHash}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={installLegacyDlss} disabled={busy || status.isRunning} className="sk-btn sk-btn-brand">
                          {dlss.compatibility.patchInstalled ? t("desktop.dlssLegacyVerifyAgain") : t("desktop.dlssLegacyInstall")}
                        </button>
                        {dlss.compatibility.canRestore && (
                          <button onClick={() => runAction(() => api.restoreLegacyDlssPatch(), t("desktop.dlssLegacyRestored"))} disabled={busy || status.isRunning} className="sk-btn sk-btn-ghost">
                            {t("desktop.dlssLegacyRestore")}
                          </button>
                        )}
                        {dlss.compatibility.pinnedSourceUrl && (
                          <a href={dlss.compatibility.pinnedSourceUrl} target="_blank" rel="noreferrer" className="sk-btn sk-btn-ghost">{t("desktop.dlssOpenPin")}</a>
                        )}
                      </div>
                    </>
                  )}
                  {dlss.compatibility.gpuGeneration === "rtx50" && <p className="mt-3 text-[11px] leading-relaxed text-emerald-200/60">{t("desktop.dlssRtx50NoPatch")}</p>}
                </div>
              </Panel>

              <Panel title={t("desktop.updateTitle")} icon={RefreshCw}>
                <div className="flex items-start gap-3">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    updateStatus.state === "error" ? "bg-[color:var(--sk-danger)]"
                      : updateStatus.state === "disabled" ? "bg-white/25"
                        : updateStatus.state === "ready" || updateStatus.state === "available" ? "bg-[color:var(--sk-info)]"
                          : "bg-[color:var(--sk-ok)]"
                  }`} />
                  <div>
                    <p className="sk-display text-sm">STRYKER v{updateStatus.currentVersion}</p>
                    <p className="mt-1 text-[11px] text-[color:var(--sk-faint)]">
                      {updateStateLabel}{updateStatus.availableVersion ? ` · v${updateStatus.availableVersion}` : ""}
                    </p>
                    {updateStatus.state === "downloading" && (
                      <div className="mt-3 h-1.5 w-52 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-[color:var(--sk-info)] transition-[width] duration-500" style={{ width: `${updateStatus.progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={updateAction}
                  disabled={busy || updateStatus.state === "checking" || updateStatus.state === "downloading" || !updateStatus.updaterConfigured}
                  className="sk-btn sk-btn-primary mt-4"
                >
                  {updateStatus.state === "ready" ? t("desktop.updateInstall") : updateStatus.state === "available" ? t("desktop.updateDownload") : t("desktop.updateCheck")}
                </button>
              </Panel>

              <Panel title={t("desktop.siderBackups")} icon={ArchiveRestore} count={backups.length}>
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {backups.length === 0 ? <Empty text={t("desktop.noBackup")} /> : backups.map((backup) => (
                    <div key={backup.name} className="sk-row flex items-center gap-3 border border-white/[0.06] bg-black/20 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[10px]">{backup.name}</p>
                        <p className="mt-1 text-[10px] text-[color:var(--sk-ghost)]">{formatDate(backup.createdAt, language, t("desktop.never"))} · {(backup.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button
                        onClick={() => { if (window.confirm(t("desktop.restoreConfirm"))) runAction(() => api.restoreBackup(backup.name), t("desktop.restored")); }}
                        className="sk-btn sk-btn-ghost shrink-0 px-3 py-1.5"
                      >{t("desktop.restore")}</button>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title={t("desktop.security")} icon={ShieldCheck}>
                <ul className="space-y-3 text-xs leading-relaxed text-[color:var(--sk-muted)]">
                  {[t("desktop.security1"), t("desktop.security2"), t("desktop.security3"), t("desktop.security4"), t("desktop.security5")].map((line) => (
                    <li key={line} className="flex gap-2.5">
                      <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-[color:var(--sk-brand-glow)]" />
                      {line}
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, action, count, children }: { title: string; icon: React.ElementType; action?: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <section className="sk-panel">
      <div className="sk-panel-head">
        <h2 className="sk-display flex items-center gap-2.5 text-base">
          <Icon className="h-4 w-4 text-[color:var(--sk-brand-glow)]" />
          {title}
          {count !== undefined && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-black text-[color:var(--sk-faint)]">{count}</span>
          )}
        </h2>
        {action}
      </div>
      <div className="sk-panel-body">{children}</div>
    </section>
  );
}

function Metric({ index, icon: Icon, label, value, detail, warning }: { index: string; icon: React.ElementType; label: string; value: string; detail: string; warning?: boolean }) {
  return (
    <div className="sk-metric" data-tone={warning ? "warn" : undefined}>
      <div className="flex items-start justify-between gap-2">
        <span className="sk-label">{label}</span>
        <Icon className={`h-4 w-4 shrink-0 ${warning ? "text-[color:var(--sk-warn)]" : "text-[color:var(--sk-brand-glow)]"}`} />
      </div>
      <p className="sk-metric-value mt-4" data-size={value.length > 6 ? "sm" : undefined} title={value}>{value}</p>
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <p className="truncate text-[10px] text-[color:var(--sk-ghost)]">{detail}</p>
        <span className="sk-rail-index shrink-0">{index}</span>
      </div>
    </div>
  );
}

function ModCard({ mod, installed, pending, badge, badgeTone, installedLabel, meta, children }: {
  mod: CatalogMod;
  installed: boolean;
  pending?: boolean;
  badge: string;
  badgeTone?: "ok" | "warn" | "brand";
  installedLabel: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`sk-panel group flex flex-col overflow-hidden ${installed ? "border-emerald-500/35" : ""}`}>
      {pending && <ProgressBar value={null} />}
      <div className="relative h-32 shrink-0 overflow-hidden border-b border-white/[0.07] bg-[radial-gradient(circle_at_75%_20%,rgba(130,27,110,.34),transparent_46%),var(--sk-ink)]">
        <img
          src="/stryker-logo.png"
          alt=""
          aria-hidden="true"
          width={1536}
          height={1024}
          loading="lazy"
          decoding="async"
          className="sk-watermark -right-8 -top-10 w-56 max-w-none opacity-[0.13] transition-transform duration-700 group-hover:scale-105"
        />
        <span className="sk-chip absolute left-3 top-3" data-tone={badgeTone}>{badge}</span>
        {installed && <span className="sk-chip absolute right-3 top-3" data-tone="ok">{installedLabel}</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[color:var(--sk-brand-glow)]">{mod.author}{mod.version ? ` · ${mod.version}` : ""}</p>
        <h2 className="sk-display mt-2 text-base">{mod.title}</h2>
        <p className="mt-2.5 line-clamp-3 flex-1 text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{mod.shortDesc}</p>
        {meta && <p className="mt-3 truncate font-mono text-[9px] text-[color:var(--sk-ghost)]">{meta}</p>}
        <div className="mt-4 flex gap-2">{children}</div>
      </div>
    </article>
  );
}

function IconButton({ label, danger, disabled, onClick, children }: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="sk-icon-btn" data-danger={danger ? "true" : undefined}>
      {children}
    </button>
  );
}

/** Déterminée si `value` est un nombre, indéterminée sinon. */
function ProgressBar({ value, tone }: { value: number | null; tone?: "ok" | "info" }) {
  const indeterminate = value === null || Number.isNaN(value);
  const clamped = indeterminate ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div
      className="sk-progress"
      data-indeterminate={indeterminate ? "true" : undefined}
      data-tone={tone}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
    >
      <div className="sk-progress-value" style={indeterminate ? undefined : { width: `${clamped}%` }} />
    </div>
  );
}

/** Surligne les occurrences du filtre dans une ligne de journal. */
function LogLine({ line, query }: { line: string; query: string }) {
  if (!query) return <>{line}</>;
  const haystack = line.toLowerCase();
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let found = haystack.indexOf(needle);
  let key = 0;
  while (found !== -1) {
    if (found > cursor) parts.push(line.slice(cursor, found));
    parts.push(<mark key={key += 1} className="sk-log-match">{line.slice(found, found + query.length)}</mark>);
    cursor = found + query.length;
    found = haystack.indexOf(needle, cursor);
  }
  if (cursor < line.length) parts.push(line.slice(cursor));
  return <>{parts}</>;
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--sk-r-md)] border border-dashed border-white/10 p-10 text-center text-xs text-[color:var(--sk-ghost)]">
      {text}
    </div>
  );
}

function Setting({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="sk-label">{label}</dt>
      <dd className={`mt-1 break-all text-white/80 ${mono ? "font-mono text-[11px]" : "text-xs font-bold"}`}>{value}</dd>
    </div>
  );
}
