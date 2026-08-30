import React, { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Search, ShieldCheck } from "lucide-react";
import type { CatalogMod } from "../types";
import { VERIFIED_CATALOG_MODS } from "../services/catalogData";

interface AllModsPageProps {
  onBackToHome: () => void;
  onSelectMod: (mod: CatalogMod) => void;
  onOpenDownloadModal: (mod: CatalogMod) => void;
}

const CATEGORIES: Array<{ id: "all" | CatalogMod["category"]; label: string }> = [
  { id: "all", label: "Toutes" }, { id: "gameplay", label: "Gameplay" },
  { id: "turf", label: "Stades" }, { id: "audio", label: "Audio" },
  { id: "face", label: "Visages" }, { id: "other", label: "Jeu" },
];

export const AllModsPage: React.FC<AllModsPageProps> = ({ onBackToHome, onSelectMod, onOpenDownloadModal }) => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["id"]>("all");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return VERIFIED_CATALOG_MODS.filter((mod) => (category === "all" || mod.category === category) && (!query || [mod.title, mod.author, mod.shortDesc, ...mod.tags].some((value) => value.toLowerCase().includes(query))));
  }, [search, category]);

  return (
    <main className="min-h-screen bg-[#37002E] px-6 md:px-12 py-10 text-white">
      <div className="max-w-7xl mx-auto">
        <button onClick={onBackToHome} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/20 px-4 py-2 text-xs font-bold hover:bg-white/5"><ArrowLeft className="w-4 h-4" /> Accueil</button>
        <div className="mt-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div><p className="text-[11px] uppercase tracking-[0.2em] font-black text-[#d870c5]">Liens suivis, fichiers non hébergés</p><h1 className="mt-2 text-4xl md:text-6xl font-black uppercase">Catalogue des sources</h1><p className="mt-3 max-w-2xl text-sm text-white/55 leading-relaxed">STRYKER redirige vers les auteurs. Vérifie toujours la compatibilité et les instructions de la version téléchargée avant l’import.</p></div>
          <span className="text-xs text-white/45">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
        </div>

        <div className="mt-9 rounded-2xl border border-white/10 bg-[#260C22] p-4 space-y-4">
          <label className="relative block"><span className="sr-only">Rechercher dans le catalogue</span><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, auteur, catégorie…" className="w-full rounded-xl border border-white/10 bg-black/25 py-3 pl-11 pr-4 text-sm outline-none focus:border-[#a8228e]" /></label>
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Catégories">{CATEGORIES.map((item) => <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={`whitespace-nowrap rounded-full px-4 py-2 text-[10px] font-black uppercase ${category === item.id ? "bg-white text-[#711361]" : "border border-white/10 text-white/55 hover:text-white"}`}>{item.label}</button>)}</div>
        </div>

        <div className="mt-7 grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((mod) => (
            <article key={mod.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#260C22] flex flex-col">
              <button type="button" onClick={() => onSelectMod(mod)} className="text-left group flex-1">
                <div className="relative h-48 bg-black overflow-hidden"><img src={mod.thumbnail} onError={(event) => { event.currentTarget.src = "/stryker-logo.png"; }} alt="" className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition duration-500" /><span className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${mod.legalStatus === "verified_source" ? "bg-emerald-600" : "bg-amber-400 text-black"}`}>{mod.legalStatus === "verified_source" ? "Source vérifiée" : "Communautaire"}</span></div>
                <div className="p-5"><p className="text-[10px] font-bold uppercase tracking-wider text-[#d870c5]">{mod.author} · {mod.version}</p><h2 className="mt-2 text-base font-black uppercase">{mod.title}</h2><p className="mt-3 text-xs text-white/55 leading-relaxed line-clamp-3">{mod.shortDesc}</p><div className="mt-4 flex flex-wrap gap-1.5">{mod.compatibility.slice(0, 3).map((value) => <span key={value} className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-white/45">{value}</span>)}</div></div>
              </button>
              <div className="mx-5 mb-5 pt-4 border-t border-white/10 flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-[10px] text-white/40"><ShieldCheck className="w-3.5 h-3.5" /> Vérifié le {mod.verificationDate}</span><button onClick={() => onOpenDownloadModal(mod)} className="rounded-lg bg-[#711361] px-3 py-2 text-[10px] font-black uppercase flex items-center gap-1.5">Source <ExternalLink className="w-3 h-3" /></button></div>
            </article>
          ))}
        </div>
        {filtered.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-white/15 p-14 text-center text-sm text-white/40">Aucune source ne correspond à ces critères.</div>}
      </div>
    </main>
  );
};
