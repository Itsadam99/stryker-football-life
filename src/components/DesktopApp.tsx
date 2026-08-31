import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArchiveRestore, ArrowDown, ArrowUp, CheckCircle2,
  CircleGauge, Download, ExternalLink, FolderSearch, HeartPulse, Layers3,
  Library, PackageOpen, Play, Plus, RefreshCw, Settings, ShieldCheck, Square,
  Trash2, UploadCloud, UserRoundCog, Wrench, XCircle,
} from "lucide-react";
import { api } from "../services/api";
import { localizeCatalogMod, VERIFIED_CATALOG_MODS } from "../services/catalogData";
import {
  ActivityItem, BackupItem, ConflictReport, GameConfig, GameProcessStatus,
  CatalogMod, HealthCheck, HealthReport, HubSubmission, ManagedMod, ModItem, Profile, UpdateStatus,
} from "../types";
import { StrykerLogo } from "./StrykerLogo";
import { Language, LanguageSwitcher, useI18n } from "../i18n";

type DesktopPage = "dashboard" | "mods" | "catalog" | "profiles" | "conflicts" | "settings";

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

const EMPTY_UPDATE: UpdateStatus = {
  currentVersion: "3.4.0",
  availableVersion: null,
  state: "disabled",
  progress: 0,
  updateAvailable: false,
  updaterConfigured: false,
  message: "",
};

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
  const navigation: Array<{ id: DesktopPage; label: string; icon: React.ElementType }> = [
    { id: "dashboard", label: t("desktop.dashboard"), icon: CircleGauge },
    { id: "mods", label: t("desktop.mods"), icon: Layers3 },
    { id: "catalog", label: t("desktop.discover"), icon: Library },
    { id: "profiles", label: t("desktop.profiles"), icon: UserRoundCog },
    { id: "conflicts", label: t("desktop.conflicts"), icon: Wrench },
    { id: "settings", label: t("desktop.settings"), icon: Settings },
  ];
  const [page, setPage] = useState<DesktopPage>("dashboard");
  const [config, setConfig] = useState<GameConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<GameProcessStatus>(EMPTY_STATUS);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(EMPTY_UPDATE);
  const [mods, setMods] = useState<ManagedMod[]>([]);
  const [manualMods, setManualMods] = useState<ModItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [conflicts, setConflicts] = useState<ConflictReport | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [catalogMods, setCatalogMods] = useState<CatalogMod[]>([]);
  const [submissions, setSubmissions] = useState<HubSubmission[]>([]);
  const [version, setVersion] = useState("3.4.0");
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const deepLinkHandled = useRef(false);

  const activeProfile = profiles.find((profile) => profile.active);
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
  const externalCatalogMods = useMemo(
    () => VERIFIED_CATALOG_MODS.map((mod) => localizeCatalogMod(mod, language)),
    [language],
  );

  const announce = (message: string, type: "success" | "error" = "success") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4500);
  };

  const refreshAll = async () => {
    const [nextConfig, nextMods, sider, nextProfiles, nextHealth, nextConflicts, nextBackups, nextActivity, nextStatus, nextVersion, nextCatalog, nextSubmissions] = await Promise.all([
      api.getConfig(),
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
      api.getSubmissions(),
    ]);
    setConfig(nextConfig);
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
    setSubmissions(nextSubmissions);
  };

  useEffect(() => {
    refreshAll()
      .catch((error) => announce(error.message, "error"))
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      api.getLauncherStatus().then(setStatus).catch(() => undefined);
      api.getVersion().then(setUpdateStatus).catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  const runAction = async (action: () => Promise<unknown>, successMessage?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await action();
      if (result === false) return;
      await refreshAll();
      if (successMessage) announce(successMessage);
    } catch (error: any) {
      announce(error.message || t("desktop.genericError"), "error");
    } finally {
      setBusy(false);
    }
  };

  const linkGame = () => runAction(async () => {
    const selection = await api.browseGameFolder();
    if (selection.cancelled || !selection.path) return false;
    await api.linkGame(selection.path);
  }, t("desktop.linkedSuccess"));

  const importArchive = () => runAction(async () => {
    const selection = await api.browseArchive();
    if (selection.cancelled || !selection.path) return false;
    await api.installArchive(selection.path);
  }, config.isLinked ? t("desktop.archiveDeployed") : t("desktop.archivePrepared"));

  const installDroppedArchive = (file: File) => {
    if (busy) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      announce(t("desktop.dropOnlyZip"), "error");
      return;
    }
    if (file.size > 20 * 1024 * 1024 * 1024) {
      announce(t("desktop.dropTooLarge"), "error");
      return;
    }
    void runAction(
      () => api.installUploadedArchive(file),
      config.isLinked ? t("desktop.archiveDeployed") : t("desktop.archivePrepared"),
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
    runAction(() => api.reorderMods(ordered.map((mod) => mod.id)), t("desktop.prioritiesDeployed"));
  };

  const launchOrStop = () => runAction(
    () => status.isRunning ? api.stopGame() : api.launchGame(),
    status.isRunning ? t("desktop.sessionStopped") : t("desktop.gameLaunched")
  );

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
    if (deepLinkHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const modId = params.get("installMod");
    const repository = params.get("repository");
    if (!modId || !repository) return;
    deepLinkHandled.current = true;
    setPage("catalog");
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("installMod");
    cleanUrl.searchParams.delete("repository");
    window.history.replaceState({}, "", cleanUrl);
    void runAction(() => api.installRemoteCatalogMod(repository, modId), config.isLinked
      ? t("desktop.hubInstalled")
      : t("desktop.hubPrepared"));
  }, [config.isLinked, t]);

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#070507] text-white flex items-center justify-center font-poppins">
        <div className="text-center space-y-4">
          <StrykerLogo size={72} />
          <RefreshCw className="w-5 h-5 animate-spin text-[#d870c5] mx-auto" />
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">{t("desktop.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080608] text-white font-poppins lg:flex">
      {notice && (
        <div role="status" aria-live="polite" className={`fixed right-5 top-5 z-[80] max-w-md rounded-xl border px-4 py-3 text-sm shadow-2xl ${notice.type === "success" ? "bg-emerald-950 border-emerald-500/50 text-emerald-100" : "bg-rose-950 border-rose-500/50 text-rose-100"}`}>
          {notice.message}
        </div>
      )}

      <aside className="border-b lg:border-b-0 lg:border-r border-white/10 bg-[#100b10] lg:w-64 lg:min-h-screen flex-shrink-0">
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <StrykerLogo size={42} />
          <div>
            <div className="font-black text-xl tracking-tight">STRYKER</div>
            <div className="text-[10px] uppercase tracking-widest text-[#d870c5]">Mod Manager v{version}</div>
          </div>
        </div>

        <div className="p-4">
          <div className="rounded-xl bg-black/35 border border-white/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-white/40">{t("desktop.activeGame")}</p>
                <p className="text-xs font-bold truncate mt-1">{config.isLinked ? config.detectedVersion : t("desktop.noGame")}</p>
              </div>
              <span className={`mt-0.5 w-2.5 h-2.5 rounded-full ${config.isLinked ? "bg-emerald-400" : "bg-amber-400"}`} />
            </div>
            <p className="text-[10px] text-white/35 truncate mt-2">{config.isLinked ? config.gamePath : t("desktop.gameUnlinked")}</p>
          </div>
        </div>

        <nav aria-label={t("desktop.navigation")} className="px-3 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const badge = item.id === "conflicts" && conflicts && (conflicts.total + conflicts.dependencyIssues.length) > 0
              ? conflicts.total + conflicts.dependencyIssues.length : null;
            return (
              <button key={item.id} onClick={() => setPage(item.id)} aria-current={page === item.id ? "page" : undefined} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition ${page === item.id ? "bg-[#711361] text-white" : "text-white/60 hover:bg-white/5 hover:text-white"}`}>
                <Icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
                {badge ? <span className="rounded-full bg-amber-400 text-black px-1.5 text-[9px] font-black">{badge}</span> : null}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="min-h-20 border-b border-white/10 bg-black/25 px-5 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-30 backdrop-blur-xl">
          <div>
            <h1 className="text-xl font-black">{navigation.find((item) => item.id === page)?.label}</h1>
            <p className="text-xs text-white/45 mt-0.5">{t("desktop.profile")} : <strong className="text-white/75">{activeProfile?.id === "default" ? t("desktop.mainProfile") : activeProfile?.name || "—"}</strong></p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <button onClick={() => runAction(() => Promise.resolve(), t("desktop.updated"))} disabled={busy} aria-label={t("desktop.refresh")} className="p-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
            </button>
            <button onClick={launchOrStop} disabled={busy || (!status.isRunning && !config.isLinked)} className={`rounded-lg px-5 py-2.5 text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 ${status.isRunning ? "bg-rose-700 hover:bg-rose-600" : "bg-white text-[#711361] hover:bg-white/90"}`}>
              {status.isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {status.isRunning ? `${t("desktop.stop")} · ${formatDuration(status.playDurationSeconds)}` : config.isLinked ? t("desktop.launch") : t("desktop.gameUnlinked")}
            </button>
          </div>
        </header>

        <main className="p-5 lg:p-8 max-w-[1500px] mx-auto">
          {updateStatus.updaterConfigured && ["available", "downloading", "ready"].includes(updateStatus.state) && (
            <section className="mb-6 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4" aria-label={t("desktop.updateTitle")}>
              <div>
                <p className="text-sm font-black text-sky-100">{t("desktop.updateTitle")} {updateStatus.availableVersion ? `· v${updateStatus.availableVersion}` : ""}</p>
                <p className="mt-1 text-[11px] text-sky-100/65">{updateStateLabel}{updateStatus.state === "downloading" ? ` · ${Math.round(updateStatus.progress)} %` : ""}</p>
              </div>
              {updateStatus.state !== "downloading" && <button onClick={updateAction} disabled={busy} className="rounded-lg bg-sky-100 px-4 py-2.5 text-xs font-black text-sky-950 disabled:opacity-50">{updateStatus.state === "ready" ? t("desktop.updateInstall") : t("desktop.updateDownload")}</button>}
            </section>
          )}
          {page === "dashboard" && (
            <div className="space-y-6">
              <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Metric icon={PackageOpen} label={t("desktop.managedMods")} value={String(mods.length)} detail={`${mods.filter((mod) => mod.enabled).length} ${t("desktop.active")}`} />
                <Metric icon={UserRoundCog} label={t("desktop.activeProfile")} value={activeProfile?.id === "default" ? t("desktop.mainProfile") : activeProfile?.name || "—"} detail={`${activeProfile?.enabledCount || 0} mods ${t("desktop.active")}`} />
                <Metric icon={Wrench} label={t("desktop.conflicts")} value={String(conflicts?.total || 0)} detail={t("desktop.siderOrder")} warning={Boolean(conflicts?.total)} />
                <Metric icon={ArchiveRestore} label={t("desktop.backups")} value={String(backups.length)} detail={`${t("desktop.lastDeployment")} : ${formatDate(health?.deployment.lastDeployedAt, language, t("desktop.never"))}`} />
              </section>

              {!config.isLinked ? (
                <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-bold text-amber-200">{t("desktop.linkTitle")}</h2>
                    <p className="text-xs text-amber-100/60 mt-1">{t("desktop.linkDescription")}</p>
                  </div>
                  <button onClick={linkGame} disabled={busy} className="px-4 py-2.5 rounded-lg bg-amber-300 text-black text-xs font-black flex items-center gap-2"><FolderSearch className="w-4 h-4" /> {t("desktop.linkGame")}</button>
                </section>
              ) : null}

              <section className="grid xl:grid-cols-[1.15fr_0.85fr] gap-6">
                <Panel title={t("desktop.health")} icon={HeartPulse} action={<button onClick={() => setPage("settings")} className="text-xs text-[#d870c5]">{t("desktop.settings")}</button>}>
                  <div className="divide-y divide-white/5">
                    {health?.checks.map((check) => {
                      const text = localizeHealthCheck(check);
                      return <div key={check.id} className="py-3 flex items-start gap-3">
                        {check.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" /> : check.warning ? <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-400 mt-0.5" />}
                        <div className="min-w-0"><p className="text-xs font-semibold">{text.label}</p><p className="text-[11px] text-white/40 truncate mt-0.5">{text.detail}</p></div>
                      </div>;
                    })}
                  </div>
                </Panel>
                <Panel title={t("desktop.activity")} icon={Activity}>
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {activity.length === 0 ? <Empty text={t("desktop.noActivity")} /> : activity.slice(0, 12).map((item) => (
                      <div key={item.id} className="border-l-2 border-[#711361] pl-3 py-1"><p className="text-xs text-white/80">{item.message}</p><p className="text-[10px] text-white/35 mt-0.5">{formatDate(item.createdAt, language, t("desktop.never"))}</p></div>
                    ))}
                  </div>
                </Panel>
              </section>
            </div>
          )}

          {page === "mods" && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("desktop.searchMods")} className="w-full md:max-w-lg rounded-lg bg-[#151015] border border-white/10 px-4 py-2.5 text-xs outline-none focus:border-[#711361]" />
                <button onClick={importArchive} disabled={busy} className="rounded-lg bg-[#711361] hover:bg-[#861872] px-4 py-2.5 text-xs font-black flex items-center justify-center gap-2"><Download className="w-4 h-4" /> {t("desktop.installZip")}</button>
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
                className={`rounded-2xl border-2 border-dashed p-7 transition-colors ${busy ? "border-white/10 bg-white/[0.02] opacity-60" : dropActive ? "border-[#d870c5] bg-[#711361]/25" : "border-white/15 bg-[#151015] hover:border-[#711361]/70"}`}
              >
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left pointer-events-none">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${dropActive ? "bg-[#d870c5] text-[#37002E]" : "bg-[#711361]/25 text-[#d870c5]"}`}><UploadCloud className="h-6 w-6" /></span>
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wide">{busy ? t("desktop.dropBusy") : dropActive ? t("desktop.dropActive") : t("desktop.dropTitle")}</h2>
                    <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-white/50">{t("desktop.dropDescription")}</p>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#d870c5]">{t("desktop.dropLimit")}</p>
                  </div>
                </div>
              </section>

              <Panel title={`${t("desktop.managedMods")} (${filteredMods.length})`} icon={ShieldCheck}>
                {filteredMods.length === 0 ? <Empty text={t("desktop.noManagedMods")} /> : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[850px]">
                      <div className="grid grid-cols-[60px_minmax(240px,1fr)_110px_120px_120px_150px] gap-3 px-3 pb-2 text-[10px] uppercase tracking-wider text-white/35">
                        <span>{t("desktop.order")}</span><span>{t("desktop.mod")}</span><span>{t("desktop.type")}</span><span>{t("desktop.version")}</span><span>{t("desktop.state")}</span><span className="text-right">{t("desktop.actions")}</span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {filteredMods.map((mod) => {
                          const trueIndex = mods.findIndex((item) => item.id === mod.id);
                          return (
                            <div key={mod.id} className={`grid grid-cols-[60px_minmax(240px,1fr)_110px_120px_120px_150px] gap-3 items-center px-3 py-3 ${mod.enabled ? "" : "opacity-55"}`}>
                              <div className="flex items-center"><span className="w-7 h-7 rounded-md bg-white/5 flex items-center justify-center text-xs font-black">{mod.priority}</span></div>
                              <div className="min-w-0"><p className="text-xs font-bold truncate">{mod.name}</p><p className="text-[10px] text-white/35 truncate mt-1">{mod.author} · {mod.installCount && mod.installCount > 1 ? t("desktop.reinstalledState") : t("desktop.installedState")} · SHA-256 {mod.archiveHash.slice(0, 10)}…</p></div>
                              <span className="text-[10px] uppercase text-white/55">{mod.components.map((component) => component.type).join(" + ")}</span>
                              <span className="text-xs text-white/60">{mod.version}</span>
                              <button role="switch" aria-checked={mod.enabled} aria-label={`${mod.enabled ? t("desktop.disable") : t("desktop.enable")} ${mod.name}`} onClick={() => runAction(() => api.toggleManagedMod(mod.id, !mod.enabled), mod.enabled ? t("desktop.disabled") : t("desktop.enabled"))} className="flex items-center gap-2 text-[10px] font-bold"><span className={`relative block w-11 h-6 rounded-full p-1 transition ${mod.enabled ? "bg-emerald-600" : "bg-white/15"}`}><span className={`block w-4 h-4 bg-white rounded-full transition-transform ${mod.enabled ? "translate-x-5" : ""}`} /></span><span>{mod.enabled ? t("desktop.activeStatus") : t("desktop.disabledState")}</span></button>
                              <div className="flex justify-end gap-1">
                                <IconButton label={`${t("desktop.moveUp")} ${mod.name}`} disabled={trueIndex === 0} onClick={() => moveMod(trueIndex, "up")}><ArrowUp className="w-4 h-4" /></IconButton>
                                <IconButton label={`${t("desktop.moveDown")} ${mod.name}`} disabled={trueIndex === mods.length - 1} onClick={() => moveMod(trueIndex, "down")}><ArrowDown className="w-4 h-4" /></IconButton>
                                <IconButton label={`${t("desktop.uninstall")} ${mod.name}`} danger onClick={() => { if (window.confirm(`${t("desktop.uninstall")} ${mod.name} ? ${t("desktop.uninstallConfirm")}`)) runAction(() => api.uninstallMod(mod.id), t("desktop.uninstalled")); }}><Trash2 className="w-4 h-4" /></IconButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title={`${t("desktop.manualEntries")} (${manualMods.length})`} icon={Wrench}>
                <p className="text-[11px] text-white/40 mb-4">{t("desktop.manualDescription")}</p>
                <div className="space-y-2">
                  {manualMods.length === 0 ? <Empty text={t("desktop.noManual")} /> : manualMods.map((mod) => (
                    <div key={`${mod.id}-${mod.lineIndex}`} className="rounded-lg bg-black/20 border border-white/5 px-3 py-2.5 flex items-center gap-3">
                      <span className="text-xs font-semibold flex-1 truncate">{mod.name}</span>
                      <code className="hidden md:block text-[10px] text-white/35 max-w-md truncate">{mod.siderLine}</code>
                      <button role="switch" aria-checked={mod.enabled} aria-label={`${mod.enabled ? t("desktop.disable") : t("desktop.enable")} ${t("desktop.manualEntry")} ${mod.name}`} onClick={() => runAction(() => api.toggleManualMod(mod.lineIndex, !mod.enabled), t("desktop.manualUpdated"))} className={`relative w-11 h-6 rounded-full p-1 ${mod.enabled ? "bg-[#711361]" : "bg-white/15"}`}><span className={`block w-4 h-4 bg-white rounded-full transition-transform ${mod.enabled ? "translate-x-5" : ""}`} /></button>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {page === "catalog" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-xs text-emerald-100/75">
                {t("desktop.catalogIntro")}
              </div>
              <div className="flex justify-end"><button onClick={importArchive} disabled={busy} className="rounded-lg bg-white text-[#711361] px-4 py-2.5 text-xs font-black flex items-center gap-2"><Download className="w-4 h-4" /> {t("desktop.installDownloaded")}</button></div>

              <Panel title={`${t("desktop.catalog")} (${catalogMods.length})`} icon={Library}>
                {catalogMods.length === 0 ? <Empty text={t("desktop.noPublished")} /> : (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {catalogMods.map((mod) => {
                      const installedMod = mods.find((item) => item.packageId === mod.id || item.archiveHash === mod.archiveHash || item.id.startsWith(`${mod.id}-`));
                      return (
                        <article key={mod.id} className={`rounded-xl overflow-hidden border bg-black/20 flex flex-col ${installedMod ? "border-emerald-500/35" : "border-white/10"}`}>
                          <div className="h-36 bg-black relative"><img src={mod.thumbnail || "/stryker-logo.png"} onError={(event) => { event.currentTarget.src = "/stryker-logo.png"; }} alt="" className="w-full h-full object-cover opacity-75" /><span className="absolute top-3 left-3 rounded-full bg-[#711361] px-2 py-1 text-[9px] font-black uppercase">{t("desktop.hosted")}</span>{installedMod && <span className="absolute top-3 right-3 rounded-full bg-emerald-500 px-2 py-1 text-[9px] font-black uppercase text-black">{installedMod.installCount && installedMod.installCount > 1 ? t("desktop.reinstalledState") : t("desktop.installedState")}</span>}</div>
                          <div className="p-4 flex-1 flex flex-col"><p className="text-[10px] uppercase text-[#d870c5] font-bold">{mod.author} · {mod.version}</p><h2 className="font-bold text-sm mt-1">{mod.title}</h2><p className="text-[11px] text-white/45 mt-2 line-clamp-3 flex-1">{mod.shortDesc}</p><p className="mt-3 text-[9px] text-white/30">SHA-256 {mod.archiveHash?.slice(0, 12)}… · {mod.downloadsCount} {t("desktop.installations")}</p><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => runAction(() => api.installCatalogMod(mod.id), config.isLinked ? `${mod.title} ${installedMod ? t("desktop.reinstalledDeployed") : t("desktop.installedDeployed")}` : `${mod.title} ${t("desktop.preparedLink")}`)} disabled={busy} className="rounded-lg bg-white px-3 py-2 text-[10px] font-black uppercase text-[#711361] flex items-center justify-center gap-1.5"><Download className="w-3.5 h-3.5" /> {installedMod ? t("desktop.reinstall") : t("desktop.install")}</button>{installedMod ? <button onClick={() => runAction(() => api.toggleManagedMod(installedMod.id, !installedMod.enabled), installedMod.enabled ? t("desktop.disabled") : t("desktop.enabled"))} disabled={busy} className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase">{installedMod.enabled ? t("desktop.disable") : t("desktop.enable")}</button> : <span />}</div></div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel title={`${t("desktop.moderation")} (${submissions.length})`} icon={ShieldCheck}>
                <p className="mb-4 text-[11px] text-white/40">{t("desktop.moderationDescription")}</p>
                {submissions.length === 0 ? <Empty text={t("desktop.noSubmissions")} /> : <div className="space-y-3">{submissions.map((submission) => (
                  <article key={submission.id} className="rounded-xl border border-white/10 bg-black/20 p-4 md:flex md:items-center gap-4">
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{submission.title}</h3><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${submission.status === "pending_review" ? "bg-amber-400 text-black" : submission.status === "rejected" ? "bg-rose-700" : "bg-white/10"}`}>{submission.status === "pending_review" ? t("desktop.pendingReview") : submission.status === "awaiting_archive" ? t("desktop.archiveMissing") : t("desktop.rejected")}</span></div><p className="mt-1 text-[10px] text-white/40">{submission.author} · {submission.version} · {submission.fileCount || 0} {t("desktop.files")} · {submission.archiveSize ? `${(submission.archiveSize / 1024 / 1024).toFixed(1)} MB` : "—"}</p><p className="mt-2 text-[11px] text-white/55">{submission.shortDesc}</p></div>
                    {submission.status === "pending_review" && <div className="mt-3 flex flex-wrap gap-2 md:mt-0"><button onClick={() => runAction(() => api.installSubmission(submission.id), t("desktop.testInstalled"))} className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-bold">{t("desktop.test")}</button><button onClick={() => runAction(() => api.publishSubmission(submission.id), t("desktop.published"))} className="rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black">{t("desktop.publish")}</button><button onClick={() => { const note = window.prompt(t("desktop.rejectReason"), t("desktop.rejectDefault")); if (note !== null) runAction(() => api.rejectSubmission(submission.id, note), t("desktop.submissionRejected")); }} className="rounded-lg bg-rose-800 px-3 py-2 text-[10px] font-bold">{t("desktop.reject")}</button></div>}
                  </article>
                ))}</div>}
              </Panel>

              <Panel title={t("desktop.externalResources")} icon={ExternalLink}>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {externalCatalogMods.map((mod) => (
                  <article key={mod.id} className="rounded-xl overflow-hidden border border-white/10 bg-[#151015] flex flex-col">
                    <div className="h-36 bg-black relative"><img src={mod.thumbnail || "/stryker-logo.png"} onError={(event) => { event.currentTarget.src = "/stryker-logo.png"; }} alt="" className="w-full h-full object-cover opacity-75" /><span className={`absolute top-3 left-3 rounded-full px-2 py-1 text-[9px] font-black uppercase ${mod.legalStatus === "verified_source" ? "bg-emerald-600" : "bg-amber-500 text-black"}`}>{mod.legalStatus === "verified_source" ? t("desktop.verifiedSource") : t("desktop.communityLink")}</span></div>
                    <div className="p-4 flex-1 flex flex-col"><p className="text-[10px] uppercase text-[#d870c5] font-bold">{mod.author}</p><h2 className="font-bold text-sm mt-1">{mod.title}</h2><p className="text-[11px] text-white/45 mt-2 line-clamp-3 flex-1">{mod.shortDesc}</p><div className="flex gap-2 mt-4"><a href={mod.downloadUrl} target="_blank" rel="noreferrer" className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-[10px] font-bold text-center flex items-center justify-center gap-1.5 hover:bg-white/5">{t("desktop.authorSource")} <ExternalLink className="w-3 h-3" /></a></div></div>
                  </article>
                ))}
              </div>
              </Panel>
            </div>
          )}

          {page === "profiles" && (
            <div className="space-y-5">
              <div className="flex justify-end"><button onClick={() => setProfileFormOpen(true)} className="rounded-lg bg-[#711361] px-4 py-2.5 text-xs font-black flex items-center gap-2"><Plus className="w-4 h-4" /> {t("desktop.newProfile")}</button></div>
              {profileFormOpen && (
                <section className="rounded-xl border border-[#711361]/60 bg-[#151015] p-5 space-y-3" aria-label={t("desktop.createProfile")}>
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={t("desktop.profileName")} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-xs" />
                  <textarea value={profileDescription} onChange={(event) => setProfileDescription(event.target.value)} placeholder={t("desktop.optionalDescription")} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-xs min-h-20" />
                  <div className="flex justify-end gap-2"><button onClick={() => setProfileFormOpen(false)} className="px-3 py-2 text-xs text-white/60">{t("desktop.cancel")}</button><button disabled={!profileName.trim() || busy} onClick={() => runAction(async () => { await api.createProfile(profileName, profileDescription, true); setProfileName(""); setProfileDescription(""); setProfileFormOpen(false); }, t("desktop.profileCreated"))} className="rounded-lg bg-white text-[#711361] px-4 py-2 text-xs font-black disabled:opacity-40">{t("desktop.createClone")}</button></div>
                </section>
              )}
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {profiles.map((profile) => (
                  <article key={profile.id} className={`rounded-xl border p-5 ${profile.active ? "border-[#711361] bg-[#711361]/15" : "border-white/10 bg-[#151015]"}`}>
                    <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-sm">{profile.id === "default" ? t("desktop.mainProfile") : profile.name}</h2><p className="text-[11px] text-white/40 mt-1">{profile.description || t("desktop.noDescription")}</p></div>{profile.active && <span className="text-[9px] uppercase font-black text-emerald-400">{t("desktop.activeStatus")}</span>}</div>
                    <p className="text-xs text-white/60 mt-5">{profile.enabledCount} {t("desktop.active")} / {profile.modCount} {t("desktop.installed")}</p>
                    <div className="mt-4 flex gap-2"><button disabled={profile.active || busy} onClick={() => runAction(() => api.activateProfile(profile.id), `${t("desktop.profile")} « ${profile.id === "default" ? t("desktop.mainProfile") : profile.name} » ${t("desktop.profileActivated")}`)} className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-[10px] font-bold disabled:opacity-35">{t("desktop.activate")}</button>{profile.id !== "default" && <IconButton danger label={`${t("desktop.delete")} ${profile.name}`} onClick={() => { if (window.confirm(`${t("desktop.delete")} ${t("desktop.profile").toLowerCase()} ${profile.name} ? ${t("desktop.deleteProfileConfirm")}`)) runAction(() => api.deleteProfile(profile.id), t("desktop.profileDeleted")); }}><Trash2 className="w-4 h-4" /></IconButton>}</div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {page === "conflicts" && (
            <div className="space-y-6">
              <Panel title={`${t("desktop.liveCpkConflicts")} (${conflicts?.total || 0})`} icon={Wrench}>
                <p className="text-[11px] text-white/40 mb-4">{t("desktop.conflictDescription")}</p>
                {!conflicts?.conflicts.length ? <Empty text={t("desktop.noConflict")} /> : <div className="space-y-2 max-h-[55vh] overflow-y-auto">{conflicts.conflicts.slice(0, 1000).map((conflict) => (
                  <div key={`${conflict.file}-${conflict.modIds.join("-")}`} className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3"><code className="text-[10px] text-amber-100 break-all">{conflict.file}</code><p className="text-[10px] text-white/45 mt-2">{t("desktop.winner")} : <strong className="text-white/75">{mods.find((mod) => mod.id === conflict.winnerModId)?.name || conflict.winnerModId}</strong> · {t("desktop.overwrites")} {conflict.loserModIds.map((id) => mods.find((mod) => mod.id === id)?.name || id).join(", ")}</p></div>
                ))}</div>}
              </Panel>
              <Panel title={`${t("desktop.dependencies")} (${conflicts?.dependencyIssues.length || 0})`} icon={AlertTriangle}>
                {!conflicts?.dependencyIssues.length ? <Empty text={t("desktop.dependenciesOk")} /> : conflicts.dependencyIssues.map((issue) => <div key={`${issue.modId}-${issue.dependency.id}`} className="text-xs py-2 border-b border-white/5">{mods.find((mod) => mod.id === issue.modId)?.name || issue.modId} {t("desktop.requires")} <strong>{issue.dependency.id}</strong> ({issue.reason === "missing" ? t("desktop.missing") : t("desktop.dependencyDisabled")}).</div>)}
              </Panel>
            </div>
          )}

          {page === "settings" && (
            <div className="grid xl:grid-cols-2 gap-6">
              <Panel title={t("desktop.installation")} icon={FolderSearch}>
                <dl className="space-y-4 text-xs"><Setting label={t("desktop.gameVersion")} value={config.detectedVersion} /><Setting label={t("desktop.gameFolder")} value={config.gamePath || t("desktop.notLinked")} mono /><Setting label={t("desktop.executable")} value={config.gameExecutablePath || t("desktop.notConfigured")} mono /><Setting label={t("desktop.siderConfig")} value={config.siderPath || t("desktop.notConfigured")} mono /><Setting label={t("desktop.staging")} value={config.stagingPath || t("desktop.notConfigured")} mono /></dl>
                <div className="flex flex-wrap gap-2 mt-5"><button onClick={linkGame} disabled={busy} className="rounded-lg bg-[#711361] px-4 py-2 text-xs font-bold">{config.isLinked ? t("desktop.changeInstallation") : t("desktop.linkInstallation")}</button>{config.isLinked && <button onClick={() => runAction(() => api.unlinkGame(), t("desktop.gameUnlinkedSuccess"))} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-white/60">{t("desktop.unlink")}</button>}</div>
              </Panel>
              <Panel title={t("desktop.launchSettings")} icon={Play}>
                <label className="block text-xs font-semibold mb-2" htmlFor="launch-mode">{t("desktop.method")}</label>
                <select id="launch-mode" value={config.launchMode} onChange={(event) => setConfig({ ...config, launchMode: event.target.value as "game" | "sider", autoStartSider: true })} className="w-full rounded-lg bg-black/35 border border-white/10 px-3 py-2.5 text-xs"><option value="game">{t("desktop.officialLauncher")}</option>{!/ start\.exe$/i.test(config.gameExecutablePath) && <option value="sider">{t("desktop.siderOneClick")}</option>}</select>
                <p className="mt-3 text-[11px] leading-relaxed text-white/40">{t("desktop.launchHelp")}</p>
                <button onClick={() => runAction(() => api.saveConfig({ autoStartSider: config.autoStartSider, launchMode: config.launchMode }), t("desktop.launchSaved"))} className="mt-4 rounded-lg bg-white text-[#711361] px-4 py-2 text-xs font-black">{t("desktop.save")}</button>
              </Panel>
              <Panel title={t("desktop.updateTitle")} icon={RefreshCw}>
                <div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${updateStatus.state === "error" ? "bg-rose-400" : updateStatus.state === "disabled" ? "bg-white/25" : updateStatus.state === "ready" || updateStatus.state === "available" ? "bg-sky-400" : "bg-emerald-400"}`} /><div><p className="text-xs font-bold">STRYKER v{updateStatus.currentVersion}</p><p className="mt-1 text-[11px] text-white/45">{updateStateLabel}{updateStatus.availableVersion ? ` · v${updateStatus.availableVersion}` : ""}</p>{updateStatus.state === "downloading" && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-sky-400" style={{ width: `${updateStatus.progress}%` }} /></div>}</div></div>
                <button onClick={updateAction} disabled={busy || updateStatus.state === "checking" || updateStatus.state === "downloading" || !updateStatus.updaterConfigured} className="mt-4 rounded-lg bg-white text-[#711361] px-4 py-2 text-xs font-black disabled:opacity-35">{updateStatus.state === "ready" ? t("desktop.updateInstall") : updateStatus.state === "available" ? t("desktop.updateDownload") : t("desktop.updateCheck")}</button>
              </Panel>
              <Panel title={`${t("desktop.siderBackups")} (${backups.length})`} icon={ArchiveRestore}>
                <div className="space-y-2 max-h-80 overflow-y-auto">{backups.length === 0 ? <Empty text={t("desktop.noBackup")} /> : backups.map((backup) => <div key={backup.name} className="rounded-lg border border-white/5 bg-black/20 p-3 flex items-center gap-3"><div className="flex-1 min-w-0"><p className="text-[10px] font-mono truncate">{backup.name}</p><p className="text-[10px] text-white/35 mt-1">{formatDate(backup.createdAt, language, t("desktop.never"))} · {(backup.size / 1024).toFixed(1)} KB</p></div><button onClick={() => { if (window.confirm(t("desktop.restoreConfirm"))) runAction(() => api.restoreBackup(backup.name), t("desktop.restored")); }} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[10px]">{t("desktop.restore")}</button></div>)}</div>
              </Panel>
              <Panel title={t("desktop.security")} icon={ShieldCheck}>
                <ul className="space-y-3 text-xs text-white/55"><li>• {t("desktop.security1")}</li><li>• {t("desktop.security2")}</li><li>• {t("desktop.security3")}</li><li>• {t("desktop.security4")}</li><li>• {t("desktop.security5")}</li></ul>
              </Panel>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-xl border border-white/10 bg-[#151015] p-5"><div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-sm font-bold flex items-center gap-2"><Icon className="w-4 h-4 text-[#d870c5]" />{title}</h2>{action}</div>{children}</section>;
}

function Metric({ icon: Icon, label, value, detail, warning }: { icon: React.ElementType; label: string; value: string; detail: string; warning?: boolean }) {
  return <div className={`rounded-xl border p-4 bg-[#151015] ${warning ? "border-amber-500/35" : "border-white/10"}`}><div className="flex items-center justify-between"><span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span><Icon className={`w-4 h-4 ${warning ? "text-amber-400" : "text-[#d870c5]"}`} /></div><p className="text-xl font-black mt-3 truncate">{value}</p><p className="text-[10px] text-white/35 mt-1">{detail}</p></div>;
}

function IconButton({ label, danger, disabled, onClick, children }: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`p-2 rounded-md border border-white/5 disabled:opacity-20 ${danger ? "text-rose-400 hover:bg-rose-500/10" : "text-white/45 hover:bg-white/5 hover:text-white"}`}>{children}</button>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-white/10 p-8 text-center text-xs text-white/35">{text}</div>;
}

function Setting({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-[10px] uppercase tracking-wider text-white/35">{label}</dt><dd className={`mt-1 text-white/75 break-all ${mono ? "font-mono text-[11px]" : "font-semibold"}`}>{value}</dd></div>;
}
