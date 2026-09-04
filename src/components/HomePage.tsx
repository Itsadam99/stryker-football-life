import React, { useEffect, useMemo } from "react";
import { ArrowDown, ArrowRight, Check, Download, ExternalLink, Monitor, Plus } from "lucide-react";
import type { CatalogMod } from "../types";
import { useI18n } from "../i18n";
import { STRYKER_DOWNLOAD_URL } from "../services/distribution";
import { SITE_COPY } from "../services/siteCopy";

interface HomePageProps {
  mods: CatalogMod[];
  onNavigateToAllMods: () => void;
  onSelectMod: (mod: CatalogMod) => void;
  onOpenDownloadModal: (mod: CatalogMod) => void;
  onInstall: (mod: CatalogMod) => void;
  onDownloadExe: () => void;
}

const FEATURED_IDS = [
  "premier-league-facepack-vol-1",
  "ficabre-goalnets-module-v1",
  "fl26-pyro-supporters-v0-9a",
];

function statusLabel(mod: CatalogMod, labels: { hosted: string; verified: string; community: string }) {
  if (mod.status === "pending_review") return "Preview";
  if (mod.installationType === "automatic") return labels.hosted;
  if (mod.legalStatus === "verified_source") return labels.verified;
  return labels.community;
}

export const HomePage: React.FC<HomePageProps> = ({
  mods,
  onNavigateToAllMods,
  onSelectMod,
  onOpenDownloadModal,
  onInstall,
  onDownloadExe,
}) => {
  const { language, t } = useI18n();
  const copy = SITE_COPY[language];
  const featured = useMemo(() => {
    const chosen = FEATURED_IDS.map((id) => mods.find((mod) => mod.id === id)).filter(Boolean) as CatalogMod[];
    return chosen.length === FEATURED_IDS.length ? chosen : mods.slice(0, 3);
  }, [mods]);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.visible = "true";
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [featured.length]);

  const triggerModAction = (mod: CatalogMod) => {
    if (mod.status === "pending_review") return onSelectMod(mod);
    if (mod.installationType === "automatic") return onInstall(mod);
    onOpenDownloadModal(mod);
  };

  return (
    <main className="bg-[#050405]">
      <section className="relative min-h-[100svh] overflow-hidden bg-[#050405] p-2 sm:p-3">
        <div className="stryker-hero relative flex min-h-[calc(100svh-16px)] overflow-hidden rounded-[1.65rem] border border-white/10 sm:min-h-[calc(100svh-24px)] sm:rounded-[2.2rem]">
          <div className="absolute inset-0 stryker-hero-mesh" />
          <div className="absolute inset-0 stryker-noise opacity-35" />
          <div className="absolute -left-[12%] top-[18%] h-[55vw] w-[55vw] rounded-full bg-[#90127b]/35 blur-[110px]" />
          <div className="absolute -right-[9%] bottom-[-32%] h-[52vw] w-[52vw] rounded-full bg-[#4c083f]/70 blur-[120px]" />

          <div className="absolute left-5 top-28 z-10 rotate-[-7deg] rounded-full border border-white/20 bg-black/35 px-4 py-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/75 backdrop-blur sm:left-10 sm:top-32">
            {t("home.badge")}
          </div>

          <div className="relative z-[2] m-auto w-full px-4 pb-28 pt-32 text-center sm:px-8 sm:pb-32">
            <p className="mb-4 text-[10px] font-black uppercase tracking-[0.42em] text-[#e6a6d9] sm:mb-6 sm:text-xs">{copy.heroKicker}</p>
            <h1 className="sr-only">STRYKER</h1>
            {/* Le logo est plafonné en hauteur : sans cela il mange 680 px et
                repousse les boutons sous la ligne de flottaison en 720 px. */}
            <img src="/stryker-logo.png" alt="STRYKER" width={1536} height={1024} decoding="async" className="stryker-hero-logo mx-auto max-h-[46svh] w-full max-w-5xl object-contain" />
            <p className="mx-auto mt-9 max-w-2xl text-sm font-medium leading-relaxed text-white/66 sm:mt-12 sm:text-base">
              {t("home.description")}
            </p>
            <div className="mx-auto mt-7 flex max-w-3xl flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <button onClick={onNavigateToAllMods} className="motion-button group inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.13em] text-black">{t("home.viewMods")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></button>
              <a href={STRYKER_DOWNLOAD_URL} className="motion-button inline-flex items-center justify-center gap-2 rounded-full bg-[#7f1d70] px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.13em] text-white"><Download className="h-4 w-4" /> {t("home.downloadApp")}</a>
              <button onClick={onDownloadExe} className="motion-button inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-black/20 px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.13em] text-white backdrop-blur"><Monitor className="h-4 w-4" /> {t("home.openApp")}</button>
            </div>
          </div>

          <div className="absolute inset-x-5 bottom-5 z-10 flex items-end justify-between gap-5 sm:inset-x-10 sm:bottom-8">
            <p className="max-w-[16rem] text-left text-[9px] font-black uppercase leading-relaxed tracking-[0.18em] text-white/55 sm:text-[10px]">
              Find. Install. Play.<br />{t("home.windows")}
            </p>
            <a href="#featured-drops" aria-label={t("home.catalogTitle")} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/20 text-white/70 backdrop-blur transition hover:border-white/60 hover:text-white">
              <ArrowDown className="h-4 w-4 animate-bounce" />
            </a>
          </div>
        </div>
      </section>

      <section id="featured-drops" className="px-5 pb-20 pt-28 sm:px-8 lg:px-12 lg:pb-32 lg:pt-40">
        <div className="mx-auto max-w-[1380px]" data-reveal>
          <p className="editorial-kicker">{copy.dropsEyebrow}</p>
          <div className="mt-5 grid gap-7 border-t border-white/12 pt-7 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
            <h2 className="max-w-5xl text-[clamp(2.8rem,7vw,7.5rem)] font-black uppercase leading-[0.83] tracking-[-0.075em]">{copy.dropsTitle}</h2>
            <p className="max-w-xl text-sm leading-7 text-white/50 lg:justify-self-end">{copy.dropsDescription}</p>
          </div>
        </div>
      </section>

      <section className="px-5 pb-28 sm:px-8 lg:px-12 lg:pb-40">
        <div className="mx-auto grid max-w-[1380px] gap-5 lg:grid-cols-3">
          {featured.map((mod, index) => (
            <article key={mod.id} data-reveal className="brand-mod-card group relative flex min-h-[31rem] flex-col overflow-hidden rounded-[1.8rem] border border-white/10 p-6 sm:p-8">
              <img src="/stryker-logo.png" alt="" aria-hidden="true" width={1536} height={1024} loading="lazy" decoding="async" className="pointer-events-none absolute -right-20 -top-12 w-[25rem] max-w-none opacity-[0.075] mix-blend-screen transition duration-700 group-hover:scale-105 group-hover:opacity-[0.12]" />
              <div className="relative z-10 flex items-start justify-between gap-4">
                <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.16em]">{statusLabel(mod, { hosted: t("home.hosted"), verified: t("home.verified"), community: t("home.community") })}</span>
                <span className="text-4xl font-black tracking-[-0.08em] text-white/16">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="relative z-10 mt-auto pt-28">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#d76bc5]">{mod.author} / {mod.version}</p>
                <h3 className="mt-4 text-3xl font-black uppercase leading-[0.9] tracking-[-0.055em] sm:text-4xl">{mod.title}</h3>
                <p className="mt-5 text-sm leading-7 text-white/52">{mod.shortDesc}</p>
                <div className="mt-7 flex flex-wrap gap-2">{mod.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full border border-white/12 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.1em] text-white/42">{tag}</span>)}</div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button onClick={() => onSelectMod(mod)} className="motion-button group/button inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[9px] font-black uppercase tracking-[0.13em] text-black">{copy.openDrop}<ArrowRight className="h-4 w-4 transition-transform group-hover/button:translate-x-1" /></button>
                  <button onClick={() => triggerModAction(mod)} className="motion-button inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-5 py-3 text-[9px] font-black uppercase tracking-[0.13em] text-white">
                    {mod.status === "pending_review" ? copy.detailPending : mod.installationType === "automatic" ? t("home.install") : t("home.viewSource")}
                    {mod.installationType === "automatic" ? <Download className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="mx-auto mt-5 max-w-[1380px]" data-reveal>
          <button onClick={onNavigateToAllMods} className="motion-button group flex w-full items-center justify-between rounded-[1.5rem] border border-white/12 bg-[#100b0e] px-6 py-6 text-left sm:px-8">
            <span><span className="block text-lg font-black uppercase tracking-[-0.03em]">{t("home.allCatalog")}</span><span className="mt-1 block text-xs text-white/42">{t("home.catalogDescription")}</span></span>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/18 transition group-hover:rotate-90 group-hover:border-[#d774c7]"><Plus className="h-5 w-5" /></span>
          </button>
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-white/8 bg-[#0a0809] px-5 py-28 sm:px-8 lg:px-12 lg:py-44">
        <div className="absolute inset-0 stryker-noise opacity-20" />
        <div className="relative mx-auto max-w-[1380px]" data-reveal>
          <p className="editorial-kicker">{copy.manifestoEyebrow}</p>
          <h2 className="mt-7 max-w-[1240px] text-[clamp(3.4rem,9vw,9.7rem)] font-black uppercase leading-[0.8] tracking-[-0.08em] text-white/22">
            <span className="text-white">{copy.manifestoTitle.split(". ")[0]}.</span>{" "}{copy.manifestoTitle.split(". ").slice(1).join(". ")}
          </h2>
          <p className="ml-auto mt-12 max-w-2xl border-l border-[#9c278a] pl-6 text-base leading-8 text-white/58 sm:text-lg">{copy.manifestoBody}</p>
        </div>
      </section>

      <section className="px-5 py-28 sm:px-8 lg:px-12 lg:py-40">
        <div className="mx-auto max-w-[1380px]">
          <div data-reveal>
            <p className="editorial-kicker">{copy.methodEyebrow}</p>
            <h2 className="mt-5 max-w-5xl text-[clamp(2.8rem,6.5vw,6.8rem)] font-black uppercase leading-[0.84] tracking-[-0.07em]">{copy.methodTitle}</h2>
          </div>
          <div className="mt-16 grid border-t border-white/12 lg:grid-cols-3">
            {copy.methodSteps.map((step) => (
              <article key={step.number} data-reveal className="group border-b border-white/12 py-8 lg:border-b-0 lg:border-r lg:px-8 lg:py-10 first:lg:pl-0 last:lg:border-r-0">
                <div className="flex items-center justify-between"><span className="text-5xl font-black tracking-[-0.07em] text-white/18">{step.number}</span><ArrowRight className="h-5 w-5 text-[#ba55a8] transition-transform group-hover:translate-x-2" /></div>
                <h3 className="mt-16 text-2xl font-black uppercase tracking-[-0.04em]">{step.title}</h3>
                <p className="mt-4 max-w-sm text-sm leading-7 text-white/48">{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-3 pb-28 lg:pb-40">
        <div className="relative mx-auto max-w-[1380px] overflow-hidden rounded-[2rem] border border-white/10 bg-[#7f1d70] px-6 py-16 sm:px-12 lg:min-h-[680px] lg:rounded-[2.7rem] lg:px-20 lg:py-20" data-reveal>
          <div className="absolute inset-0 stryker-noise opacity-25" />
          <div className="absolute -right-24 -top-28 h-[520px] w-[520px] rounded-full bg-[#d067bf]/30 blur-[100px]" />
          <div className="relative grid gap-14 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/65">{copy.appEyebrow}</p>
              <h2 className="mt-7 text-[clamp(3.3rem,7vw,7.4rem)] font-black uppercase leading-[0.82] tracking-[-0.075em]">{copy.appTitle}</h2>
            </div>
            <div className="lg:pb-2">
              <p className="text-sm leading-7 text-white/68 sm:text-base">{copy.appBody}</p>
              <ul className="mt-8 space-y-3 text-xs font-bold uppercase tracking-[0.11em] text-white/75">
                {[copy.appPoint1, copy.appPoint2, copy.appPoint3].map((point) => <li key={point} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#7f1d70]"><Check className="h-3.5 w-3.5" /></span>{point}</li>)}
              </ul>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a href={STRYKER_DOWNLOAD_URL} className="motion-button inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.13em] text-black"><Download className="h-4 w-4" />{t("home.downloadApp")}</a>
                <button onClick={onDownloadExe} className="motion-button inline-flex items-center justify-center gap-2 rounded-full border border-white/30 px-6 py-3.5 text-[10px] font-black uppercase tracking-[0.13em]"><Monitor className="h-4 w-4" />{t("home.openApp")}</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 pb-32 sm:px-8 lg:px-12 lg:pb-44">
        <div className="mx-auto max-w-[1380px]">
          <div data-reveal><p className="editorial-kicker">{copy.faqEyebrow}</p><h2 className="mt-5 text-[clamp(2.8rem,6vw,6.4rem)] font-black uppercase leading-[0.85] tracking-[-0.07em]">{copy.faqTitle}</h2></div>
          <div className="mt-14 border-t border-white/12">
            {copy.faqs.map((item) => (
              <details key={item.question} className="faq-row group border-b border-white/12" data-reveal>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-7 text-left text-base font-black uppercase tracking-[-0.02em] sm:text-xl"><span>{item.question}</span><Plus className="h-5 w-5 shrink-0 text-white/45 transition-transform group-open:rotate-45" /></summary>
                <p className="max-w-3xl pb-8 text-sm leading-7 text-white/48">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};
