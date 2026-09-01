import React from "react";
import { ArrowUpRight, Download, Monitor } from "lucide-react";
import { StrykerLogo } from "./StrykerLogo";
import { LanguageSwitcher, useI18n } from "../i18n";
import { STRYKER_DOWNLOAD_URL } from "../services/distribution";

interface NavbarProps {
  currentPage: "home" | "all-mods" | "publish";
  setCurrentPage: (page: "home" | "all-mods" | "publish") => void;
  onOpenDesktop: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPage, setCurrentPage, onOpenDesktop }) => {
  const { t } = useI18n();
  return <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-5">
    <div className="pointer-events-auto mx-auto flex max-w-[1380px] items-center justify-between gap-2 rounded-[1.35rem] border border-white/10 bg-black/75 px-3 py-2 shadow-[0_18px_55px_rgba(0,0,0,0.38)] backdrop-blur-2xl sm:rounded-full sm:px-4">
      <button onClick={() => setCurrentPage("home")} className="flex shrink-0 items-center gap-2 text-left" aria-label={`${t("nav.home")} STRYKER`}>
        <StrykerLogo size={31} />
        <div><span className="text-base font-black tracking-[-0.05em] sm:text-lg">STRYKER</span><p className="hidden text-[8px] font-bold uppercase tracking-[0.19em] text-white/40 xl:block">{t("nav.subtitle")}</p></div>
      </button>

      <nav aria-label={t("nav.aria")} className="hidden items-center justify-center gap-1 rounded-full bg-white/[0.045] p-1 md:flex">
        <button onClick={() => setCurrentPage("home")} aria-current={currentPage === "home" ? "page" : undefined} className={`rounded-full px-4 py-2 text-[9px] font-black uppercase tracking-[0.14em] transition ${currentPage === "home" ? "bg-[#7f1d70] text-white" : "text-white/55 hover:text-white"}`}>{t("nav.home")}</button>
        <button onClick={() => setCurrentPage("all-mods")} aria-current={currentPage === "all-mods" ? "page" : undefined} className={`rounded-full px-4 py-2 text-[9px] font-black uppercase tracking-[0.14em] transition ${currentPage === "all-mods" ? "bg-[#7f1d70] text-white" : "text-white/55 hover:text-white"}`}>{t("nav.mods")}</button>
        <button onClick={() => setCurrentPage("publish")} aria-current={currentPage === "publish" ? "page" : undefined} className={`rounded-full px-4 py-2 text-[9px] font-black uppercase tracking-[0.14em] transition ${currentPage === "publish" ? "bg-[#7f1d70] text-white" : "text-white/55 hover:text-white"}`}>{t("nav.publish")}</button>
      </nav>

      <div className="flex items-center gap-2">
        <span className="hidden lg:block"><LanguageSwitcher compact /></span>
        <a href={STRYKER_DOWNLOAD_URL} aria-label={t("home.downloadApp")} className="hidden items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-white transition hover:border-white/35 hover:bg-white/5 sm:flex">
          <Download className="h-3.5 w-3.5" /><span className="hidden xl:inline">{t("home.downloadApp")}</span>
        </a>
        <button onClick={onOpenDesktop} aria-label={t("home.openApp")} className="group flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-black transition hover:bg-[#eec8e8]"><Monitor className="h-3.5 w-3.5 sm:hidden" /><span className="hidden sm:inline">{t("home.openApp")}</span><ArrowUpRight className="hidden h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:block" /></button>
      </div>
    </div>
  </header>;
};
