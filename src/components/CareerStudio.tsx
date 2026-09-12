import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { api } from "../services/api";
import type { CareerSave, CareerPreview } from "../services/careerApi";

export function CareerStudio() {
  const [saves, setSaves] = useState<CareerSave[]>([]);
  const [preview, setPreview] = useState<CareerPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const refresh = async () => setSaves((await api.getCareers()).saves);
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, []);
  async function inspect(id: string) {
    setBusy(true); setError(""); setMessage(""); setPreview(null);
    try { setPreview(await api.inspectCareer(id)); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function change(action: "apply" | "remove") {
    if (!preview) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api.changeCareer(preview.id, preview.hash, action);
      setMessage(result.message);
      setPreview(await api.inspectCareer(preview.id));
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function trackCoaches() {
    if (!preview) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api.trackCareerCoaches(preview.id, preview.hash);
      setMessage(result.message); setPreview(await api.inspectCareer(preview.id));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const teams = preview?.teams.filter(t => `${t.name} ${t.coach} ${t.style}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) || [];
  const coaching = preview?.coaching;
  const coaches = coaching?.teams?.filter(t => `${t.name} ${t.coach}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) || [];
  const date = (value?: string) => value?.split("-").reverse().join("/") || "—";
  return <div className="space-y-5">
    <section className="sk-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Coachs et styles</h2>
        <span className="sk-badge">Atelier · Vers une légende</span>
      </div>
      <p className="mt-3 text-sm text-white/70">Applique les consignes tactiques à une carrière existante. Le Barça et l’Atlético disposent de profils dédiés ; les autres équipes conservent leur base de jeu avec une correction des relances longues en possession.</p>
      <p className="mt-2 text-sm text-amber-100/80">Version de travail : le suivi des contrats et la préparation des changements de coach sont disponibles. Leur application automatique dans le jeu reste en cours de développement.</p>
      <p className="mt-2 text-xs text-white/50">Ferme Football Life et Sider avant l’application, puis recharge la carrière. Une copie de sécurité est conservée. Le retrait restaure les consignes du mod en conservant la progression.</p>
    </section>
    {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">{message}</p>}
    <section className="sk-panel p-5">
      <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Tes carrières FL26</h3>
        <button className="sk-btn sk-btn-ghost" disabled={busy} onClick={() => { setPreview(null); void refresh().catch(e => setError(e.message)); }}><RefreshCw className="h-4 w-4" /> Actualiser</button></div>
      {!saves.length && <p className="text-sm text-white/60">Aucune sauvegarde Vers une légende trouvée dans Documents ou OneDrive. Enregistre une carrière dans Football Life 2026 puis actualise.</p>}
      <div className="flex flex-wrap gap-2">{saves.map(save => <button key={save.id} className={`sk-btn ${preview?.id === save.id ? "sk-btn-brand" : "sk-btn-ghost"}`} disabled={busy || Boolean(save.error)} onClick={() => void inspect(save.id)} title={save.error || save.modifiedAt}>Emplacement {save.slot}{save.installed ? " · Styles appliqués" : ""}{save.recoveryPending ? " · Opération interrompue" : ""}</button>)}</div>
      {busy && <p role="status" className="mt-4 flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4 animate-spin" /> Analyse et vérification…</p>}
    </section>
    {preview && <section className="sk-panel p-5">
      <h3 className="text-lg font-bold">{preview.title || `Emplacement ${preview.slot}`}</h3>
      <p className="mt-1 text-sm text-white/60">{preview.date.split("-").reverse().join("/")} · {preview.teamCount} équipes</p>
      <div className="my-4 flex flex-wrap gap-2">
        <button className="sk-btn sk-btn-brand" disabled={busy} onClick={() => void change("apply")}>{preview.installed ? "Mettre à jour les styles" : "Appliquer les styles"}</button>
        {preview.installed && <button className="sk-btn sk-btn-danger" disabled={busy} onClick={() => void change("remove")}>Retirer les styles</button>}
      </div>
      <div className="mb-5 rounded-xl border border-white/10 bg-white/[.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h4 className="font-bold">Vie des entraîneurs</h4><p className="mt-1 text-xs text-white/50">Les contrats commencent à la date de démarrage du suivi. Ce sont des contrats simulés pour ta carrière.</p></div>
          <button className="sk-btn sk-btn-brand" disabled={busy} onClick={() => void trackCoaches()}>{coaching?.tracked ? "Actualiser le suivi" : "Démarrer le suivi des coachs"}</button>
        </div>
        {coaching?.error && <p role="alert" className="mt-3 text-sm text-amber-100">{coaching.error}</p>}
        {coaching?.tracked && coaching.teams && <>
          <p className="mt-3 text-sm text-white/70">{coaching.clubs} clubs · {coaching.leagues} championnats · {coaching.fictionalCoaches} coachs fictifs supplémentaires</p>
          <p className="mt-1 text-xs text-white/50">Dernière progression enregistrée : {date(coaching.observedAt)}. Le suivi s’actualise quand Striker reste ouvert.</p>
          {coaching.seasonPlan?.error && <p role="alert" className="mt-2 text-sm text-amber-100">{coaching.seasonPlan.error} Les bilans déjà enregistrés sont conservés.</p>}
          <p className="mt-2 text-sm text-white/60">{coaching.seasonPlan?.ready ? `${coaching.seasonPlan.changes.length} changements de coach préparés pour l’intersaison. Ils ne sont pas encore appliqués au jeu.` : `Bilans complets : ${coaching.seasonPlan?.completedLeagues || 0} sur ${coaching.leagues}. Les résultats sont conservés à mesure que les championnats se terminent.`}</p>
          {!!coaching.seasonPlan?.changes.length && <ul className="mt-2 space-y-1 text-xs text-white/70">{coaching.seasonPlan.changes.map(change => <li key={change.team}>{change.team} · {change.coach} · {change.formations[0]}</li>)}</ul>}
          <details className="mt-3 text-sm"><summary className="cursor-pointer text-white/70">Découvrir les nouveaux coachs</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{coaching.reserve?.map(coach => <div key={coach.id} className="rounded-lg border border-white/10 p-3"><p className="font-semibold">{coach.name}</p><p className="mt-1 text-xs text-white/50">{coach.age === null ? "Âge non renseigné" : `${coach.age} ans`} · {coach.formations.join(" / ")}</p></div>)}</div></details>
        </>}
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{preview.leagues.filter(l => l.supported !== false).map(league => <div key={league.competitionId} className="rounded-lg border border-white/10 p-3 text-xs"><p className="font-bold">{league.name}</p><p className="mt-1 text-white/50">{league.complete ? "Championnat terminé" : `${league.matchesPlayedMin === league.matchesPlayedMax ? league.matchesPlayedMin : `${league.matchesPlayedMin}–${league.matchesPlayedMax}`} matchs joués sur ${league.matchesPerTeam}`}</p></div>)}</div>
      <label className="relative block"><span className="sr-only">Rechercher une équipe ou un coach</span><Search className="absolute left-3 top-3 h-4 w-4 text-white/40" /><input className="sk-input pl-10" value={query} onChange={e => setQuery(e.target.value)} placeholder="Équipe, entraîneur ou style de jeu…" /></label>
      {!!coaching?.teams && <div className="mt-4 max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="text-white/45"><th className="p-2">Club suivi</th><th className="p-2">Coach</th><th className="p-2">Fin du contrat</th><th className="p-2">Formations préférées</th></tr></thead><tbody>{coaches.map(coach => <tr key={coach.id} className="border-t border-white/5"><td className="p-2">{coach.name}</td><td className="p-2 text-white/60">{coach.coach}{coach.age !== null ? ` · ${coach.age} ans` : ""}</td><td className="whitespace-nowrap p-2 text-white/60">{date(coach.contractEnd)}</td><td className="p-2 text-white/60">{coach.formations.join(" / ")}</td></tr>)}</tbody></table></div>}
      <div className="mt-4 max-h-[28rem] overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="text-white/45"><th className="p-2">Équipe</th><th className="p-2">Entraîneur</th><th className="p-2">Style après application</th></tr></thead><tbody>{teams.map(team => <tr key={team.name} className="border-t border-white/5"><td className="p-2">{team.name}</td><td className="p-2 text-white/60">{team.coach}</td><td className="p-2 text-white/60">{team.style}</td></tr>)}</tbody></table>{!teams.length && <p className="p-4 text-sm text-white/50">Aucune équipe correspondante.</p>}</div>
    </section>}
  </div>;
}
