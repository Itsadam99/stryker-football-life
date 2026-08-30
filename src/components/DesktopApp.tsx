import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArchiveRestore, ArrowDown, ArrowUp, CheckCircle2,
  CircleGauge, Download, ExternalLink, FolderSearch, HeartPulse, Layers3,
  Library, PackageOpen, Play, Plus, RefreshCw, Settings, ShieldCheck, Square,
  Trash2, UserRoundCog, Wrench, XCircle,
} from "lucide-react";
import { api } from "../services/api";
import { VERIFIED_CATALOG_MODS } from "../services/catalogData";
import {
  ActivityItem, BackupItem, ConflictReport, GameConfig, GameProcessStatus,
  HealthReport, ManagedMod, ModItem, Profile,
} from "../types";
import { StrykerLogo } from "./StrykerLogo";

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
  isDemoMode: true,
  isLinked: false,
  stagingPath: "",
};

const EMPTY_STATUS: GameProcessStatus = {
  isRunning: false,
  pid: null,
  startTime: null,
  playDurationSeconds: 0,
};

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const NAVIGATION: Array<{ id: DesktopPage; label: string; icon: React.ElementType }> = [
  { id: "dashboard", label: "Tableau de bord", icon: CircleGauge },
  { id: "mods", label: "Mods", icon: Layers3 },
  { id: "catalog", label: "Découvrir", icon: Library },
  { id: "profiles", label: "Profils", icon: UserRoundCog },
  { id: "conflicts", label: "Conflits", icon: Wrench },
  { id: "settings", label: "Paramètres", icon: Settings },
];

export function DesktopApp() {
  const [page, setPage] = useState<DesktopPage>("dashboard");
  const [config, setConfig] = useState<GameConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<GameProcessStatus>(EMPTY_STATUS);
  const [mods, setMods] = useState<ManagedMod[]>([]);
  const [manualMods, setManualMods] = useState<ModItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [conflicts, setConflicts] = useState<ConflictReport | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [version, setVersion] = useState("3.0.0");
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [search, setSearch] = useState("");
  const [profileFormOpen, setProfileFormOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");

  const activeProfile = profiles.find((profile) => profile.active);
  const filteredMods = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? mods.filter((mod) => [mod.name, mod.author, mod.category].some((value) => value.toLowerCase().includes(query))) : mods;
  }, [mods, search]);

  const announce = (message: string, type: "success" | "error" = "success") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4500);
  };

  const refreshAll = async () => {
    const [nextConfig, nextMods, sider, nextProfiles, nextHealth, nextConflicts, nextBackups, nextActivity, nextStatus, nextVersion] = await Promise.all([
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
  };

  useEffect(() => {
    refreshAll()
      .catch((error) => announce(error.message, "error"))
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      api.getLauncherStatus().then(setStatus).catch(() => undefined);
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
      announce(error.message || "Une opération a échoué.", "error");
    } finally {
      setBusy(false);
    }
  };

  const linkGame = () => runAction(async () => {
    const selection = await api.browseGameFolder();
    if (selection.cancelled || !selection.path) return false;
    await api.linkGame(selection.path);
  }, "Installation liée et vérifiée.");

  const importArchive = () => runAction(async () => {
    const selection = await api.browseArchive();
    if (selection.cancelled || !selection.path) return false;
    await api.installArchive(selection.path);
  }, "Archive vérifiée, installée et déployée.");

  const moveMod = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= mods.length) return;
    const ordered = [...mods];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, moved);
    runAction(() => api.reorderMods(ordered.map((mod) => mod.id)), "Priorités déployées.");
  };

  const launchOrStop = () => runAction(
    () => status.isRunning ? api.stopGame() : api.launchGame(),
    status.isRunning ? "Session arrêtée." : config.isDemoMode ? "Simulation démarrée." : "Jeu lancé."
  );

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#070507] text-white flex items-center justify-center font-poppins">
        <div className="text-center space-y-4">
          <StrykerLogo size={72} />
          <RefreshCw className="w-5 h-5 animate-spin text-[#d870c5] mx-auto" />
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">Initialisation du moteur sécurisé</p>
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
                <p className="text-[10px] uppercase tracking-wider text-white/40">Jeu actif</p>
                <p className="text-xs font-bold truncate mt-1">{config.detectedVersion}</p>
              </div>
              <span className={`mt-0.5 w-2.5 h-2.5 rounded-full ${config.isLinked ? "bg-emerald-400" : "bg-amber-400"}`} />
            </div>
            <p className="text-[10px] text-white/35 truncate mt-2">{config.isDemoMode ? "Mode démonstration" : config.gamePath}</p>
          </div>
        </div>

        <nav aria-label="Navigation principale" className="px-3 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
          {NAVIGATION.map((item) => {
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
            <h1 className="text-xl font-black">{NAVIGATION.find((item) => item.id === page)?.label}</h1>
            <p className="text-xs text-white/45 mt-0.5">Profil : <strong className="text-white/75">{activeProfile?.name || "—"}</strong></p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => runAction(() => Promise.resolve(), "Données actualisées.")} disabled={busy} aria-label="Actualiser toutes les données" className="p-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
            </button>
            <button onClick={launchOrStop} disabled={busy || (!config.isDemoMode && !config.isLinked)} className={`rounded-lg px-5 py-2.5 text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 ${status.isRunning ? "bg-rose-700 hover:bg-rose-600" : "bg-white text-[#711361] hover:bg-white/90"}`}>
              {status.isRunning ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {status.isRunning ? `Arrêter · ${formatDuration(status.playDurationSeconds)}` : config.isDemoMode ? "Simuler le lancement" : "Lancer"}
            </button>
          </div>
        </header>

        <main className="p-5 lg:p-8 max-w-[1500px] mx-auto">
          {page === "dashboard" && (
            <div className="space-y-6">
              <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Metric icon={PackageOpen} label="Mods gérés" value={String(mods.length)} detail={`${mods.filter((mod) => mod.enabled).length} actifs`} />
                <Metric icon={UserRoundCog} label="Profil actif" value={activeProfile?.name || "—"} detail={`${activeProfile?.enabledCount || 0} mods activés`} />
                <Metric icon={Wrench} label="Conflits" value={String(conflicts?.total || 0)} detail="Ordre Sider analysé" warning={Boolean(conflicts?.total)} />
                <Metric icon={ArchiveRestore} label="Sauvegardes" value={String(backups.length)} detail={`Dernier déploiement : ${formatDate(health?.deployment.lastDeployedAt)}`} />
              </section>

              {!config.isLinked && !config.isDemoMode ? null : config.isDemoMode ? (
                <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="font-bold text-amber-200">Mode démonstration sécurisé</h2>
                    <p className="text-xs text-amber-100/60 mt-1">Toutes les opérations utilisent le sandbox. Sélectionne une installation valide quand tu es prêt.</p>
                  </div>
                  <button onClick={linkGame} disabled={busy} className="px-4 py-2.5 rounded-lg bg-amber-300 text-black text-xs font-black flex items-center gap-2"><FolderSearch className="w-4 h-4" /> Lier Football Life</button>
                </section>
              ) : null}

              <section className="grid xl:grid-cols-[1.15fr_0.85fr] gap-6">
                <Panel title="État de santé" icon={HeartPulse} action={<button onClick={() => setPage("settings")} className="text-xs text-[#d870c5]">Voir les paramètres</button>}>
                  <div className="divide-y divide-white/5">
                    {health?.checks.map((check) => (
                      <div key={check.id} className="py-3 flex items-start gap-3">
                        {check.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" /> : check.warning ? <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" /> : <XCircle className="w-4 h-4 text-rose-400 mt-0.5" />}
                        <div className="min-w-0"><p className="text-xs font-semibold">{check.label}</p><p className="text-[11px] text-white/40 truncate mt-0.5">{check.detail}</p></div>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel title="Activité récente" icon={Activity}>
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {activity.length === 0 ? <Empty text="Aucune opération enregistrée." /> : activity.slice(0, 12).map((item) => (
                      <div key={item.id} className="border-l-2 border-[#711361] pl-3 py-1"><p className="text-xs text-white/80">{item.message}</p><p className="text-[10px] text-white/35 mt-0.5">{formatDate(item.createdAt)}</p></div>
                    ))}
                  </div>
                </Panel>
              </section>
            </div>
          )}

          {page === "mods" && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom, auteur ou catégorie…" className="w-full md:max-w-lg rounded-lg bg-[#151015] border border-white/10 px-4 py-2.5 text-xs outline-none focus:border-[#711361]" />
                <button onClick={importArchive} disabled={busy} className="rounded-lg bg-[#711361] hover:bg-[#861872] px-4 py-2.5 text-xs font-black flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Installer une archive ZIP</button>
              </div>

              <Panel title={`Mods gérés (${filteredMods.length})`} icon={ShieldCheck}>
                {filteredMods.length === 0 ? <Empty text="Aucun mod géré. Importe un ZIP LiveCPK ou un mod muni d’un manifeste STRYKER." /> : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[850px]">
                      <div className="grid grid-cols-[60px_minmax(240px,1fr)_110px_120px_120px_150px] gap-3 px-3 pb-2 text-[10px] uppercase tracking-wider text-white/35">
                        <span>Ordre</span><span>Mod</span><span>Type</span><span>Version</span><span>État</span><span className="text-right">Actions</span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {filteredMods.map((mod) => {
                          const trueIndex = mods.findIndex((item) => item.id === mod.id);
                          return (
                            <div key={mod.id} className={`grid grid-cols-[60px_minmax(240px,1fr)_110px_120px_120px_150px] gap-3 items-center px-3 py-3 ${mod.enabled ? "" : "opacity-55"}`}>
                              <div className="flex items-center"><span className="w-7 h-7 rounded-md bg-white/5 flex items-center justify-center text-xs font-black">{mod.priority}</span></div>
                              <div className="min-w-0"><p className="text-xs font-bold truncate">{mod.name}</p><p className="text-[10px] text-white/35 truncate mt-1">{mod.author} · SHA-256 {mod.archiveHash.slice(0, 10)}…</p></div>
                              <span className="text-[10px] uppercase text-white/55">{mod.components.map((component) => component.type).join(" + ")}</span>
                              <span className="text-xs text-white/60">{mod.version}</span>
                              <button role="switch" aria-checked={mod.enabled} aria-label={`${mod.enabled ? "Désactiver" : "Activer"} ${mod.name}`} onClick={() => runAction(() => api.toggleManagedMod(mod.id, !mod.enabled), mod.enabled ? "Mod désactivé." : "Mod activé.")} className={`relative w-11 h-6 rounded-full p-1 transition ${mod.enabled ? "bg-emerald-600" : "bg-white/15"}`}><span className={`block w-4 h-4 bg-white rounded-full transition-transform ${mod.enabled ? "translate-x-5" : ""}`} /></button>
                              <div className="flex justify-end gap-1">
                                <IconButton label={`Monter ${mod.name}`} disabled={trueIndex === 0} onClick={() => moveMod(trueIndex, "up")}><ArrowUp className="w-4 h-4" /></IconButton>
                                <IconButton label={`Descendre ${mod.name}`} disabled={trueIndex === mods.length - 1} onClick={() => moveMod(trueIndex, "down")}><ArrowDown className="w-4 h-4" /></IconButton>
                                <IconButton label={`Désinstaller ${mod.name}`} danger onClick={() => { if (window.confirm(`Désinstaller ${mod.name} ? Les fichiers seront déplacés dans la corbeille récupérable STRYKER.`)) runAction(() => api.uninstallMod(mod.id), "Mod désinstallé et conservé dans la corbeille STRYKER."); }}><Trash2 className="w-4 h-4" /></IconButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title={`Entrées Sider manuelles (${manualMods.length})`} icon={Wrench}>
                <p className="text-[11px] text-white/40 mb-4">Ces lignes existaient en dehors du bloc STRYKER. Elles sont préservées et ne seront jamais désinstallées automatiquement.</p>
                <div className="space-y-2">
                  {manualMods.length === 0 ? <Empty text="Aucune entrée manuelle détectée." /> : manualMods.map((mod) => (
                    <div key={`${mod.id}-${mod.lineIndex}`} className="rounded-lg bg-black/20 border border-white/5 px-3 py-2.5 flex items-center gap-3">
                      <span className="text-xs font-semibold flex-1 truncate">{mod.name}</span>
                      <code className="hidden md:block text-[10px] text-white/35 max-w-md truncate">{mod.siderLine}</code>
                      <button role="switch" aria-checked={mod.enabled} aria-label={`${mod.enabled ? "Désactiver" : "Activer"} l’entrée manuelle ${mod.name}`} onClick={() => runAction(() => api.toggleManualMod(mod.lineIndex, !mod.enabled), "Entrée Sider mise à jour.")} className={`relative w-11 h-6 rounded-full p-1 ${mod.enabled ? "bg-[#711361]" : "bg-white/15"}`}><span className={`block w-4 h-4 bg-white rounded-full transition-transform ${mod.enabled ? "translate-x-5" : ""}`} /></button>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {page === "catalog" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 p-4 text-xs text-sky-100/75">
                STRYKER ne contourne jamais la page de l’auteur. Télécharge le mod depuis sa source officielle, puis utilise « Installer le ZIP téléchargé ». Les fiches non vérifiées sont clairement signalées.
              </div>
              <div className="flex justify-end"><button onClick={importArchive} disabled={busy} className="rounded-lg bg-white text-[#711361] px-4 py-2.5 text-xs font-black flex items-center gap-2"><Download className="w-4 h-4" /> Installer le ZIP téléchargé</button></div>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {VERIFIED_CATALOG_MODS.map((mod) => (
                  <article key={mod.id} className="rounded-xl overflow-hidden border border-white/10 bg-[#151015] flex flex-col">
                    <div className="h-36 bg-black relative"><img src={mod.thumbnail || "/stryker-logo.png"} onError={(event) => { event.currentTarget.src = "/stryker-logo.png"; }} alt="" className="w-full h-full object-cover opacity-75" /><span className={`absolute top-3 left-3 rounded-full px-2 py-1 text-[9px] font-black uppercase ${mod.legalStatus === "verified_source" ? "bg-emerald-600" : "bg-amber-500 text-black"}`}>{mod.legalStatus === "verified_source" ? "Source vérifiée" : "Lien communautaire"}</span></div>
                    <div className="p-4 flex-1 flex flex-col"><p className="text-[10px] uppercase text-[#d870c5] font-bold">{mod.author}</p><h2 className="font-bold text-sm mt-1">{mod.title}</h2><p className="text-[11px] text-white/45 mt-2 line-clamp-3 flex-1">{mod.shortDesc}</p><div className="flex gap-2 mt-4"><a href={mod.downloadUrl} target="_blank" rel="noreferrer" className="flex-1 rounded-lg border border-white/15 px-3 py-2 text-[10px] font-bold text-center flex items-center justify-center gap-1.5 hover:bg-white/5">Source de l’auteur <ExternalLink className="w-3 h-3" /></a></div></div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {page === "profiles" && (
            <div className="space-y-5">
              <div className="flex justify-end"><button onClick={() => setProfileFormOpen(true)} className="rounded-lg bg-[#711361] px-4 py-2.5 text-xs font-black flex items-center gap-2"><Plus className="w-4 h-4" /> Nouveau profil</button></div>
              {profileFormOpen && (
                <section className="rounded-xl border border-[#711361]/60 bg-[#151015] p-5 space-y-3" aria-label="Créer un profil">
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Nom du profil" className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-xs" />
                  <textarea value={profileDescription} onChange={(event) => setProfileDescription(event.target.value)} placeholder="Description optionnelle" className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-xs min-h-20" />
                  <div className="flex justify-end gap-2"><button onClick={() => setProfileFormOpen(false)} className="px-3 py-2 text-xs text-white/60">Annuler</button><button disabled={!profileName.trim() || busy} onClick={() => runAction(async () => { await api.createProfile(profileName, profileDescription, true); setProfileName(""); setProfileDescription(""); setProfileFormOpen(false); }, "Profil créé à partir de la configuration active.")} className="rounded-lg bg-white text-[#711361] px-4 py-2 text-xs font-black disabled:opacity-40">Créer et cloner</button></div>
                </section>
              )}
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {profiles.map((profile) => (
                  <article key={profile.id} className={`rounded-xl border p-5 ${profile.active ? "border-[#711361] bg-[#711361]/15" : "border-white/10 bg-[#151015]"}`}>
                    <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-sm">{profile.name}</h2><p className="text-[11px] text-white/40 mt-1">{profile.description || "Sans description"}</p></div>{profile.active && <span className="text-[9px] uppercase font-black text-emerald-400">Actif</span>}</div>
                    <p className="text-xs text-white/60 mt-5">{profile.enabledCount} actifs / {profile.modCount} installés</p>
                    <div className="mt-4 flex gap-2"><button disabled={profile.active || busy} onClick={() => runAction(() => api.activateProfile(profile.id), `Profil « ${profile.name} » activé et déployé.`)} className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-[10px] font-bold disabled:opacity-35">Activer</button>{profile.id !== "default" && <IconButton danger label={`Supprimer ${profile.name}`} onClick={() => { if (window.confirm(`Supprimer le profil ${profile.name} ? Les mods installés seront conservés.`)) runAction(() => api.deleteProfile(profile.id), "Profil supprimé."); }}><Trash2 className="w-4 h-4" /></IconButton>}</div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {page === "conflicts" && (
            <div className="space-y-6">
              <Panel title={`Conflits LiveCPK (${conflicts?.total || 0})`} icon={Wrench}>
                <p className="text-[11px] text-white/40 mb-4">Le mod placé le plus haut gagne, conformément à l’ordre de recherche de Sider. Modifie les priorités depuis la page Mods.</p>
                {!conflicts?.conflicts.length ? <Empty text="Aucun fichier LiveCPK en conflit." /> : <div className="space-y-2 max-h-[55vh] overflow-y-auto">{conflicts.conflicts.slice(0, 1000).map((conflict) => (
                  <div key={`${conflict.file}-${conflict.modIds.join("-")}`} className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3"><code className="text-[10px] text-amber-100 break-all">{conflict.file}</code><p className="text-[10px] text-white/45 mt-2">Gagnant : <strong className="text-white/75">{mods.find((mod) => mod.id === conflict.winnerModId)?.name || conflict.winnerModId}</strong> · Écrase {conflict.loserModIds.map((id) => mods.find((mod) => mod.id === id)?.name || id).join(", ")}</p></div>
                ))}</div>}
              </Panel>
              <Panel title={`Dépendances (${conflicts?.dependencyIssues.length || 0})`} icon={AlertTriangle}>
                {!conflicts?.dependencyIssues.length ? <Empty text="Toutes les dépendances déclarées sont satisfaites." /> : conflicts.dependencyIssues.map((issue) => <div key={`${issue.modId}-${issue.dependency.id}`} className="text-xs py-2 border-b border-white/5">{mods.find((mod) => mod.id === issue.modId)?.name || issue.modId} requiert <strong>{issue.dependency.id}</strong> ({issue.reason === "missing" ? "absent" : "désactivé"}).</div>)}
              </Panel>
            </div>
          )}

          {page === "settings" && (
            <div className="grid xl:grid-cols-2 gap-6">
              <Panel title="Installation du jeu" icon={FolderSearch}>
                <dl className="space-y-4 text-xs"><Setting label="Version" value={config.detectedVersion} /><Setting label="Dossier du jeu" value={config.gamePath || "Non lié"} mono /><Setting label="Exécutable" value={config.gameExecutablePath || "Non configuré"} mono /><Setting label="sider.ini" value={config.siderPath || "Non configuré"} mono /><Setting label="Staging STRYKER" value={config.stagingPath || "Non configuré"} mono /></dl>
                <div className="flex flex-wrap gap-2 mt-5"><button onClick={linkGame} disabled={busy} className="rounded-lg bg-[#711361] px-4 py-2 text-xs font-bold">{config.isLinked ? "Changer d’installation" : "Lier une installation"}</button>{config.isLinked && <button onClick={() => runAction(() => api.unlinkGame(), "Jeu délié. Le mode démonstration est actif.")} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-white/60">Délier</button>}</div>
              </Panel>
              <Panel title="Lancement" icon={Play}>
                <label className="block text-xs font-semibold mb-2" htmlFor="launch-mode">Méthode</label>
                <select id="launch-mode" value={config.launchMode} onChange={(event) => setConfig({ ...config, launchMode: event.target.value as "game" | "sider" })} className="w-full rounded-lg bg-black/35 border border-white/10 px-3 py-2.5 text-xs"><option value="game">Lancer l’exécutable du jeu</option><option value="sider">Lancer Sider en mode one-click</option></select>
                <label className="mt-4 flex items-center justify-between rounded-lg bg-black/25 border border-white/5 p-3 text-xs"><span>Utiliser automatiquement Sider</span><input type="checkbox" checked={config.autoStartSider} onChange={(event) => setConfig({ ...config, autoStartSider: event.target.checked })} className="accent-[#711361]" /></label>
                <button onClick={() => runAction(() => api.saveConfig({ autoStartSider: config.autoStartSider, launchMode: config.launchMode }), "Paramètres de lancement enregistrés.")} className="mt-4 rounded-lg bg-white text-[#711361] px-4 py-2 text-xs font-black">Enregistrer</button>
              </Panel>
              <Panel title={`Sauvegardes Sider (${backups.length})`} icon={ArchiveRestore}>
                <div className="space-y-2 max-h-80 overflow-y-auto">{backups.length === 0 ? <Empty text="Aucune sauvegarde disponible." /> : backups.map((backup) => <div key={backup.name} className="rounded-lg border border-white/5 bg-black/20 p-3 flex items-center gap-3"><div className="flex-1 min-w-0"><p className="text-[10px] font-mono truncate">{backup.name}</p><p className="text-[10px] text-white/35 mt-1">{formatDate(backup.createdAt)} · {(backup.size / 1024).toFixed(1)} Ko</p></div><button onClick={() => { if (window.confirm("Restaurer cette sauvegarde ? Une sauvegarde de sécurité sera créée avant la restauration.")) runAction(() => api.restoreBackup(backup.name), "Sauvegarde restaurée."); }} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[10px]">Restaurer</button></div>)}</div>
              </Panel>
              <Panel title="Principes de sécurité" icon={ShieldCheck}>
                <ul className="space-y-3 text-xs text-white/55"><li>• Aucun exécutable de jeu ou de mod n’est créé ou remplacé.</li><li>• Les mods sont installés dans une zone de staging privée.</li><li>• Chaque modification de Sider crée une sauvegarde récupérable.</li><li>• L’API locale est limitée à la boucle locale et protégée par une session éphémère.</li><li>• Les ZIP ambigus ou contenant du code exécutable sont refusés.</li></ul>
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
