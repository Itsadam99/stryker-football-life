import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Download, ExternalLink, Search, ShieldCheck } from "lucide-react";
import type { CatalogMod } from "../types";
import { useI18n } from "../i18n";
import { SITE_COPY } from "../services/siteCopy";

interface AllModsPageProps {
  mods: CatalogMod[];
  onBackToHome: () => void;
  onSelectMod: (mod: CatalogMod) => void;
  onOpenDownloadModal: (mod: CatalogMod) => void;
  onInstall: (mod: CatalogMod) => void;
}

const CATEGORIES = ["all", "gameplay", "turf", "menu", "audio", "kit", "face", "scoreboard", "other"] as const;

export const AllModsPage: React.FC<AllModsPageProps> = ({ mods, onBackToHome, onSelectMod, onOpenDownloadModal, onInstall }) => {
  const { language, t } = useI18n();
  const copy = SITE_COPY[language];
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");
  const categoryLabels: Record<(typeof CATEGORIES)[number], string> = {
    all: t("catalog.all"), gameplay: "Gameplay", turf: t("catalog.stadiums"), menu: t("catalog.menus"),
    audio: "Audio", kit: t("catalog.kits"), face: t("catalog.faces"), scoreboard: t("catalog.scoreboards"), other: t("catalog.other"),
  };
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mods.filter((mod) => (category === "all" || mod.category === category) && (!query || [mod.title, mod.author, mod.shortDesc, ...mod.tags].some((value) => value.toLowerCase().includes(query))));
  }, [mods, search, category]);

  const triggerAction = (mod: CatalogMod) => {
    if (mod.status === "pending_review") return onSelectMod(mod);
    if (mod.installationType === "automatic") return onInstall(mod);
    onOpenDownloadModal(mod);
  };

  return (
    <main className="min-h-screen bg-[#050405] px-5 pb-28 pt-28 text-white sm:px-8 lg:px-12 lg:pb-40 lg:pt-36">
      <div className="mx-auto max-w-[1380px]">
        <button onClick={onBackToHome} className="motion-button inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/65"><ArrowLeft className="h-4 w-4" /> {t("nav.home")}</button>

        <div className="mt-14 grid gap-10 border-b border-white/12 pb-12 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
          <div><p className="editorial-kicker">{t("catalog.eyebrow")}</p><h1 className="mt-6 text-[clamp(3.5rem,8vw,8.5rem)] font-black uppercase leading-[0.8] tracking-[-0.085em]">{t("catalog.title")}</h1></div>
          <div className="lg:justify-self-end"><p className="max-w-lg text-sm leading-7 text-white/48">{t("catalog.description")}</p><p className="mt-5 text-[10px] font-black uppercase tracking-[0.14em] text-[#c15bae]">{filtered.length} {filtered.length === 1 ? t("catalog.result") : t("catalog.results")}</p></div>
        </div>

        <div className="sticky top-[74px] z-20 -mx-2 mt-7 rounded-[1.4rem] border border-white/10 bg-[#090708]/88 p-3 backdrop-blur-2xl sm:mx-0 sm:flex sm:items-center sm:gap-3">
          <label className="relative block min-w-0 flex-1"><span className="sr-only">{t("catalog.searchLabel")}</span><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("catalog.search")} className="w-full rounded-full border border-white/10 bg-white/[0.035] py-3 pl-11 pr-4 text-xs outline-none transition placeholder:text-white/25 focus:border-[#9c278a]" /></label>
          <div className="mt-3 flex gap-1.5 overflow-x-auto sm:mt-0" aria-label={t("catalog.categories")}>{CATEGORIES.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full px-3.5 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] transition ${category === item ? "bg-white text-black" : "text-white/45 hover:bg-white/5 hover:text-white"}`}>{categoryLabels[item]}</button>)}</div>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((mod, index) => (
            <article key={mod.id} className="brand-mod-card group flex min-h-[27rem] flex-col overflow-hidden rounded-[1.7rem] border border-white/10 transition duration-500 hover:-translate-y-1 hover:border-[#8f277f]/70 hover:shadow-[0_22px_70px_rgba(105,20,88,0.18)]">
              <button type="button" onClick={() => onSelectMod(mod)} className="flex flex-1 flex-col text-left">
                <div className="relative h-40 overflow-hidden border-b border-white/8 bg-[#100a0e]">
                  <img src="/stryker-logo.png" alt="" aria-hidden="true" className="absolute -right-12 -top-16 w-80 max-w-none opacity-[0.09] mix-blend-screen transition duration-700 group-hover:scale-105 group-hover:opacity-[0.14]" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(140,35,119,.24),transparent_45%)]" />
                  <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] backdrop-blur">{mod.status === "pending_review" ? "Preview" : mod.installationType === "automatic" ? t("home.hosted") : mod.legalStatus === "verified_source" ? t("home.verified") : t("catalog.community")}</span>
                  <span className="absolute right-4 top-4 text-3xl font-black tracking-[-0.08em] text-white/28">{String(index + 1).padStart(2, "0")}</span>
                  <span className="absolute bottom-4 left-4 text-[9px] font-black uppercase tracking-[0.18em] text-[#c75ab5]">{categoryLabels[mod.category as keyof typeof categoryLabels] || categoryLabels.other}</span>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#c15bae]">{mod.author} / {mod.version}</p>
                  <h2 className="mt-3 text-2xl font-black uppercase leading-[0.92] tracking-[-0.045em]">{mod.title}</h2>
                  <p className="mt-4 line-clamp-3 text-xs leading-6 text-white/45">{mod.shortDesc}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-6">{mod.compatibility.slice(0, 3).map((value) => <span key={value} className="rounded-full border border-white/10 px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-[0.08em] text-white/38">{value}</span>)}</div>
                </div>
              </button>
              <div className="mx-6 flex items-center justify-between gap-3 border-t border-white/10 py-5">
                <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/35"><ShieldCheck className="h-3.5 w-3.5" /> {mod.status === "pending_review" ? copy.detailPending : mod.installationType === "automatic" ? t("detail.archiveChecked") : t("detail.sourceChecked")}</span>
                <button onClick={() => triggerAction(mod)} className="motion-button group/action inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-black">
                  {mod.status === "pending_review" ? copy.openDrop : mod.installationType === "automatic" ? t("home.install") : t("home.viewSource")}
                  {mod.installationType === "automatic" ? <Download className="h-3.5 w-3.5" /> : mod.status === "pending_review" ? <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/action:translate-x-1" /> : <ExternalLink className="h-3.5 w-3.5" />}
                </button>
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 && <div className="mt-10 rounded-[1.7rem] border border-dashed border-white/15 p-16 text-center text-sm text-white/38">{t("catalog.noResults")}</div>}
      </div>
    </main>
  );
};
