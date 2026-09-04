import React from "react";
import { ArrowLeft, ArrowUpRight, Check, Download, ExternalLink, FileArchive, HardDrive, ShieldCheck } from "lucide-react";
import type { CatalogMod } from "../types";
import { useI18n } from "../i18n";
import { SITE_COPY } from "../services/siteCopy";

interface ModDetailPageProps {
  mod: CatalogMod;
  onBack: () => void;
  onInstall: (mod: CatalogMod) => void;
  onOpenSource: (mod: CatalogMod) => void;
}

function verificationLabel(mod: CatalogMod, copy: (typeof SITE_COPY)[keyof typeof SITE_COPY]) {
  if (mod.legalStatus === "verified_package") return copy.detailVerifiedPackage;
  if (mod.legalStatus === "verified_source") return copy.detailVerifiedSource;
  return copy.detailCommunity;
}

export const ModDetailPage: React.FC<ModDetailPageProps> = ({ mod, onBack, onInstall, onOpenSource }) => {
  const { language, t } = useI18n();
  const copy = SITE_COPY[language];
  const pending = mod.status === "pending_review";
  const automatic = mod.installationType === "automatic" && !pending;
  const sourceAvailable = Boolean(mod.sourceUrl || mod.downloadUrl);

  return (
    <main className="min-h-screen bg-[#050405] pb-24 pt-24 sm:pt-28">
      <section className="px-3 sm:px-5">
        <div className="relative mx-auto min-h-[72vh] max-w-[1380px] overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#130b11] sm:rounded-[2.5rem]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_28%,rgba(143,28,121,.3),transparent_38%),linear-gradient(130deg,#050405_0%,#160b13_58%,#080607_100%)]" />
          <img src="/stryker-logo.png" alt="" aria-hidden="true" width={1536} height={1024} loading="lazy" decoding="async" className="absolute -right-[12%] top-[-18%] w-[74rem] max-w-none opacity-[0.1] mix-blend-screen" />
          <div className="absolute inset-0 stryker-noise opacity-20" />
          <div className="relative z-10 flex min-h-[72vh] flex-col justify-between p-6 sm:p-10 lg:p-16">
            <div className="flex items-center justify-between gap-4">
              <button onClick={onBack} className="motion-button inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.14em] backdrop-blur"><ArrowLeft className="h-4 w-4" />{copy.detailBack}</button>
              <span className="rounded-full border border-white/20 bg-black/30 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/65 backdrop-blur">{copy.detailRelease}</span>
            </div>
            <div className="max-w-5xl pt-28">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e7a6dc]">{mod.author} / {mod.category} / {mod.version}</p>
              <h1 className="mt-5 max-w-[1100px] text-[clamp(3rem,8vw,8.5rem)] font-black uppercase leading-[0.8] tracking-[-0.08em]">{mod.title}</h1>
              <p className="mt-7 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">{mod.shortDesc}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto grid max-w-[1380px] gap-12 lg:grid-cols-[1fr_380px] lg:gap-20">
          <div>
            <p className="editorial-kicker">{copy.detailAbout}</p>
            <p className="mt-7 max-w-4xl text-2xl font-semibold leading-[1.35] tracking-[-0.025em] text-white/82 sm:text-3xl">{mod.fullDesc}</p>

            <div className="mt-16 border-t border-white/12 pt-8">
              <p className="editorial-kicker">{copy.detailIncludes}</p>
              <div className="mt-7 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
                <div className="bg-[#0c090b] p-6"><FileArchive className="h-5 w-5 text-[#c05aaa]" /><p className="mt-8 text-[9px] font-black uppercase tracking-[0.18em] text-white/38">{t("detail.verification")}</p><p className="mt-2 text-sm font-bold">{verificationLabel(mod, copy)}</p></div>
                <div className="bg-[#0c090b] p-6"><HardDrive className="h-5 w-5 text-[#c05aaa]" /><p className="mt-8 text-[9px] font-black uppercase tracking-[0.18em] text-white/38">{t("detail.sizeSource")}</p><p className="mt-2 text-sm font-bold">{mod.size}</p></div>
              </div>
            </div>

            <div className="mt-16 border-t border-white/12 pt-8">
              <p className="editorial-kicker">{t("detail.compatibility")}</p>
              <div className="mt-7 flex flex-wrap gap-2">{mod.compatibility.map((item) => <span key={item} className="rounded-full border border-white/14 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">{item}</span>)}</div>
            </div>

            {(mod.license || mod.archiveHash) && (
              <div className="mt-16 rounded-2xl border border-white/10 bg-[#0c090b] p-6 text-xs leading-6 text-white/45">
                {mod.license && <p>{mod.license}</p>}
                {mod.archiveHash && <p className="mt-3 break-all font-mono text-[10px] text-white/30">SHA-256 {mod.archiveHash}</p>}
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className={`overflow-hidden rounded-[1.7rem] border p-6 ${pending ? "border-amber-300/25 bg-amber-300/[0.055]" : "border-[#8e227d]/55 bg-[#160c14]"}`}>
              <div className={`flex h-11 w-11 items-center justify-center rounded-full ${pending ? "bg-amber-300 text-black" : "bg-[#7f1d70]"}`}><ShieldCheck className="h-5 w-5" /></div>
              <h2 className="mt-8 text-2xl font-black uppercase tracking-[-0.045em]">{pending ? copy.detailPending : copy.detailInstallTitle}</h2>
              <p className="mt-4 text-sm leading-7 text-white/50">{pending ? copy.detailPendingBody : automatic ? copy.detailInstallAutomatic : copy.detailInstallManual}</p>
              <div className="mt-7 space-y-3 border-t border-white/10 pt-6 text-[10px] font-bold uppercase tracking-[0.11em] text-white/55">
                {mod.tags.slice(0, 4).map((tag) => <p key={tag} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#c05aaa]" />{tag}</p>)}
              </div>
              <div className="mt-8 space-y-3">
                {automatic && <button onClick={() => onInstall(mod)} className="motion-button flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 text-[10px] font-black uppercase tracking-[0.13em] text-black"><Download className="h-4 w-4" />{t("detail.installStryker")}</button>}
                {!automatic && sourceAvailable && <button onClick={() => onOpenSource(mod)} className="motion-button flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 text-[10px] font-black uppercase tracking-[0.13em] text-black"><ExternalLink className="h-4 w-4" />{copy.detailOpenSource}</button>}
                {sourceAvailable && <a href={mod.sourceUrl || mod.downloadUrl} target="_blank" rel="noreferrer" className="motion-button flex w-full items-center justify-center gap-2 rounded-full border border-white/18 px-5 py-3.5 text-[10px] font-black uppercase tracking-[0.13em] text-white">{t("detail.modPage")}<ArrowUpRight className="h-4 w-4" /></a>}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
};
