import React from "react";
import { ArrowRight, Download, ExternalLink, Monitor, ShieldCheck } from "lucide-react";
import type { CatalogMod } from "../types";
import { useI18n } from "../i18n";

interface HomePageProps {
  mods: CatalogMod[];
  onNavigateToAllMods: () => void;
  onSelectMod: (mod: CatalogMod) => void;
  onOpenDownloadModal: (mod: CatalogMod) => void;
  onInstall: (mod: CatalogMod) => void;
  onDownloadExe: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  mods,
  onNavigateToAllMods,
  onSelectMod,
  onOpenDownloadModal,
  onInstall,
  onDownloadExe,
}) => {
  const { t } = useI18n();
  const featured = mods.slice(0, 6);

  return (
    <main>
      <section className="relative min-h-[650px] flex items-center justify-center overflow-hidden px-6">
        <div className="absolute inset-0 bg-cover bg-center opacity-35 scale-105" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1575361204480-aadea25e6e68?auto=format&fit=crop&w=2000&q=85')" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/75 to-[#37002E]" />
        <div className="relative z-10 max-w-5xl text-center py-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#711361] bg-black/60 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#e69bd8]">
            <ShieldCheck className="w-4 h-4" /> {t("home.badge")}
          </div>
          <h1 className="mt-7 text-5xl md:text-8xl lg:text-[105px] font-black uppercase leading-[0.85] tracking-tight">
            {t("home.title1")}<br /><span className="text-[#b82ca0]">{t("home.title2")}</span>
          </h1>
          <p className="mx-auto mt-8 max-w-3xl text-sm md:text-base leading-relaxed text-white/75">
            {t("home.description")}
          </p>
          <div className="mx-auto mt-9 flex max-w-xl flex-col sm:flex-row gap-4">
            <button onClick={onNavigateToAllMods} className="flex-1 rounded-full bg-white px-6 py-3.5 font-black uppercase text-[#711361] hover:scale-[1.02] transition">{t("home.viewMods")}</button>
            <button onClick={onDownloadExe} className="flex-1 rounded-full bg-[#711361] px-6 py-3.5 font-black uppercase text-white flex items-center justify-center gap-2 hover:bg-[#861872] transition"><Monitor className="w-5 h-5" /> {t("home.openApp")}</button>
          </div>
          <p className="mt-5 text-[11px] text-white/40">{t("home.disclaimer")}</p>
        </div>
      </section>

      <section className="bg-[#37002E] px-6 md:px-12 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 border-b border-white/10 pb-6">
            <div><p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d870c5]">{t("home.catalogEyebrow")}</p><h2 className="mt-2 text-3xl md:text-5xl font-black uppercase">{t("home.catalogTitle")}</h2></div>
            <p className="max-w-lg text-xs leading-relaxed text-white/55">{t("home.catalogDescription")}</p>
          </div>

          <div className="mt-9 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.map((mod) => (
              <article key={mod.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#260C22] flex flex-col">
                <button type="button" onClick={() => onSelectMod(mod)} className="text-left group">
                  <div className="relative h-44 bg-black overflow-hidden">
                    <img src={mod.thumbnail} onError={(event) => { event.currentTarget.src = "/stryker-logo.png"; }} alt="" className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition duration-500" />
                    <span className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${mod.installationType === "automatic" ? "bg-[#711361] text-white" : mod.legalStatus === "verified_source" ? "bg-emerald-600 text-white" : "bg-amber-400 text-black"}`}>{mod.installationType === "automatic" ? t("home.hosted") : mod.legalStatus === "verified_source" ? t("home.verified") : t("home.community")}</span>
                  </div>
                  <div className="p-5"><p className="text-[10px] uppercase tracking-wider text-[#d870c5] font-bold">{mod.author} · {mod.version}</p><h3 className="mt-2 font-black uppercase text-sm">{mod.title}</h3><p className="mt-3 text-xs leading-relaxed text-white/55 line-clamp-3">{mod.shortDesc}</p></div>
                </button>
                <div className="mt-auto px-5 pb-5 flex gap-2"><button type="button" onClick={() => mod.installationType === "automatic" ? onInstall(mod) : onOpenDownloadModal(mod)} className={`flex-1 rounded-lg px-3 py-2.5 text-[10px] font-black uppercase flex items-center justify-center gap-2 ${mod.installationType === "automatic" ? "bg-white text-[#711361]" : "border border-white/15 hover:bg-white/5"}`}>{mod.installationType === "automatic" ? <>{t("home.install")} <Download className="w-3.5 h-3.5" /></> : <>{t("home.viewSource")} <ExternalLink className="w-3.5 h-3.5" /></>}</button></div>
              </article>
            ))}
          </div>

          <div className="mt-10 text-center"><button onClick={onNavigateToAllMods} className="inline-flex items-center gap-3 rounded-full bg-white px-9 py-3.5 text-sm font-black uppercase text-[#711361] hover:scale-[1.02] transition">{t("home.allCatalog")} <ArrowRight className="w-4 h-4" /></button></div>
        </div>
      </section>
    </main>
  );
};
