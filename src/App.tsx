import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { AllModsPage } from "./components/AllModsPage";
import { DesktopApp } from "./components/DesktopApp";
import { DlssStudio } from "./components/DlssStudio";
import { HomePage } from "./components/HomePage";
import { ModDetailPage } from "./components/ModDetailPage";
import { Navbar } from "./components/Navbar";
import { PublishModPage } from "./components/PublishModPage";
import { StrykerLogo } from "./components/StrykerLogo";
import { StrykerUnavailableModal } from "./components/StrykerUnavailableModal";
import { VortexDownloadModal } from "./components/VortexDownloadModal";
import { CatalogMod } from "./types";
import { api } from "./services/api";
import { BUNDLED_CATALOG_MODS, localizeCatalogMod, VERIFIED_CATALOG_MODS } from "./services/catalogData";
import { createStrykerInstallLink } from "./services/distribution";
import { LanguageSwitcher, useI18n } from "./i18n";

export function App() {
  const { language, t } = useI18n();
  const mode = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("mode") : null;
  const isDesktopMode = mode === "desktop";
  const isDlssMode = mode === "dlss";
  const [currentPage, setCurrentPage] = useState<"home" | "all-mods" | "publish">("home");
  const [selectedMod, setSelectedMod] = useState<CatalogMod | null>(null);
  const [sourceMod, setSourceMod] = useState<CatalogMod | null>(null);
  const [hostedMods, setHostedMods] = useState<CatalogMod[]>([]);
  const [missingApp, setMissingApp] = useState<{ deepLink: string; modTitle?: string } | null>(null);
  const cancelProtocolAttempt = useRef<() => void>(() => undefined);

  useEffect(() => {
    api.getCatalog().then(setHostedMods).catch(() => setHostedMods([]));
  }, []);

  const catalogMods = useMemo(() => {
    const uniqueMods = new Map<string, CatalogMod>();
    [...BUNDLED_CATALOG_MODS, ...hostedMods, ...VERIFIED_CATALOG_MODS].forEach((mod) => uniqueMods.set(mod.id, mod));
    return [...uniqueMods.values()].map((mod) => localizeCatalogMod(mod, language));
  }, [hostedMods, language]);

  useEffect(() => () => cancelProtocolAttempt.current(), []);

  const launchStryker = useCallback((deepLink: string, modTitle?: string) => {
    cancelProtocolAttempt.current();
    setMissingApp(null);
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      window.removeEventListener("blur", onOpened);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    const onOpened = () => cleanup();
    const onVisibilityChange = () => { if (document.hidden) cleanup(); };
    const timer = window.setTimeout(() => {
      cleanup();
      setMissingApp({ deepLink, modTitle });
    }, 2200);
    cancelProtocolAttempt.current = cleanup;
    window.addEventListener("blur", onOpened, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    try { window.location.href = deepLink; }
    catch {
      cleanup();
      setMissingApp({ deepLink, modTitle });
    }
  }, []);

  const openDesktop = () => launchStryker("stryker://open");
  const installWithStryker = (mod: CatalogMod) => {
    if (mod.installationType !== "automatic") {
      setSourceMod(mod);
      return;
    }
    launchStryker(createStrykerInstallLink(mod.id, mod.repositoryUrl), mod.title);
  };

  const navigateTo = (page: "home" | "all-mods" | "publish") => {
    setSelectedMod(null);
    setCurrentPage(page);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectMod = (mod: CatalogMod) => {
    setSelectedMod(mod);
    window.history.replaceState(null, "", `#mod/${encodeURIComponent(mod.id)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeMod = () => {
    setSelectedMod(null);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (selectedMod || catalogMods.length === 0) return;
    const match = window.location.hash.match(/^#mod\/(.+)$/);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    const mod = catalogMods.find((item) => item.id === id);
    if (mod) setSelectedMod(mod);
  }, [catalogMods, selectedMod]);

  // Fenêtre dédiée : ouverte par window.open depuis l'application desktop.
  if (isDlssMode) return <DlssStudio />;
  if (isDesktopMode) return <DesktopApp />;

  return (
    <div className="min-h-screen bg-[#050405] text-white flex flex-col font-poppins selection:bg-[#711361] selection:text-white">
      <Navbar currentPage={currentPage} setCurrentPage={navigateTo} onOpenDesktop={openDesktop} />

      <div key={selectedMod ? `mod-${selectedMod.id}` : currentPage} className="site-page-transition flex-1">
        {selectedMod ? (
          <ModDetailPage mod={selectedMod} onBack={closeMod} onInstall={installWithStryker} onOpenSource={setSourceMod} />
        ) : currentPage === "home" ? (
          <HomePage
            mods={catalogMods}
            onNavigateToAllMods={() => navigateTo("all-mods")}
            onSelectMod={selectMod}
            onOpenDownloadModal={setSourceMod}
            onInstall={installWithStryker}
            onDownloadExe={openDesktop}
          />
        ) : currentPage === "all-mods" ? (
          <AllModsPage
            mods={catalogMods}
            onBackToHome={() => navigateTo("home")}
            onSelectMod={selectMod}
            onOpenDownloadModal={setSourceMod}
            onInstall={installWithStryker}
          />
        ) : <PublishModPage onBackToHome={() => navigateTo("home")} />}
      </div>

      <VortexDownloadModal isOpen={Boolean(sourceMod)} onClose={() => setSourceMod(null)} mod={sourceMod} onDownloadExe={openDesktop} />
      <StrykerUnavailableModal
        isOpen={Boolean(missingApp)}
        modTitle={missingApp?.modTitle}
        onClose={() => setMissingApp(null)}
        onRetry={() => missingApp && launchStryker(missingApp.deepLink, missingApp.modTitle)}
      />

      <footer className="border-t border-white/10 bg-[#080607] px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-[1380px]">
          <div className="flex flex-col gap-9 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="motion-logo inline-flex"><StrykerLogo size={64} /></div>
              <p className="mt-5 max-w-lg text-xs leading-6 text-white/45">{t("footer.community")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <LanguageSwitcher />
              <a href="https://github.com/Itsadam99/stryker-football-life" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:border-white/40 hover:text-white">GitHub <ArrowUpRight className="h-3.5 w-3.5" /></a>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-[9px] uppercase tracking-[0.12em] text-white/30 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} STRYKER</p>
            <p>{t("footer.independent")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
