import React, { useState } from "react";
import { Download, ExternalLink, Star } from "lucide-react";
import { AllModsPage } from "./components/AllModsPage";
import { DesktopApp } from "./components/DesktopApp";
import { HomePage } from "./components/HomePage";
import { Navbar } from "./components/Navbar";
import { StrykerLogo } from "./components/StrykerLogo";
import { VortexDownloadModal } from "./components/VortexDownloadModal";
import { CatalogMod } from "./types";

export function App() {
  const isDesktopMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "desktop";
  const [currentPage, setCurrentPage] = useState<"home" | "all-mods">("home");
  const [selectedMod, setSelectedMod] = useState<CatalogMod | null>(null);
  const [sourceMod, setSourceMod] = useState<CatalogMod | null>(null);

  if (isDesktopMode) return <DesktopApp />;

  const openDesktop = () => window.location.assign("/?mode=desktop");

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-poppins selection:bg-[#711361] selection:text-white">
      <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} onOpenDesktop={openDesktop} />

      <main className="flex-1">
        {currentPage === "home" ? (
          <HomePage
            onNavigateToAllMods={() => setCurrentPage("all-mods")}
            onSelectMod={setSelectedMod}
            onOpenDownloadModal={setSourceMod}
            onDownloadExe={openDesktop}
          />
        ) : (
          <AllModsPage
            onBackToHome={() => setCurrentPage("home")}
            onSelectMod={setSelectedMod}
            onOpenDownloadModal={setSourceMod}
          />
        )}
      </main>

      <VortexDownloadModal isOpen={Boolean(sourceMod)} onClose={() => setSourceMod(null)} mod={sourceMod} onDownloadExe={openDesktop} />

      {selectedMod && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setSelectedMod(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="mod-detail-title" className="bg-[#1a0717] border border-[#711361] rounded-3xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="relative h-56 rounded-2xl overflow-hidden mb-6 bg-black">
              <img src={selectedMod.thumbnail || "/stryker-logo.png"} onError={(event) => { event.currentTarget.src = "/stryker-logo.png"; }} alt="" className="w-full h-full object-cover opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1a0717] via-transparent to-transparent" />
              <button onClick={() => setSelectedMod(null)} aria-label="Fermer" className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/80 border border-white/20">✕</button>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div><h2 id="mod-detail-title" className="text-2xl font-black uppercase">{selectedMod.title}</h2><p className="text-xs text-white/50 mt-1">{selectedMod.author} · {selectedMod.version} · {selectedMod.size || "Taille communiquée par la source"}</p></div>
              {selectedMod.rating > 0 && <span className="flex items-center gap-1.5 rounded-full bg-yellow-500/15 border border-yellow-500/30 px-3 py-1.5 text-yellow-300 text-xs font-bold"><Star className="w-3.5 h-3.5 fill-current" />{selectedMod.rating.toFixed(1)}</span>}
            </div>
            <p className="mt-5 text-sm text-white/75 leading-relaxed">{selectedMod.fullDesc}</p>
            <div className="mt-5 rounded-xl bg-black/35 border border-white/10 p-4 text-xs text-white/55">
              <p><strong className="text-white/80">Compatibilité déclarée :</strong> {selectedMod.compatibility.join(", ")}</p>
              <p className="mt-2"><strong className="text-white/80">Vérification :</strong> {selectedMod.legalStatus === "verified_source" ? `source vérifiée${selectedMod.verificationDate ? ` le ${selectedMod.verificationDate}` : ""}` : "lien communautaire à vérifier avant installation"}</p>
            </div>
            <div className="mt-7 flex flex-col sm:flex-row justify-between gap-3 border-t border-white/10 pt-5">
              <a href={selectedMod.downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#d870c5] flex items-center gap-2">Source du mod <ExternalLink className="w-4 h-4" /></a>
              <button onClick={() => { setSelectedMod(null); setSourceMod(selectedMod); }} className="rounded-full bg-[#711361] px-6 py-2.5 text-xs font-black uppercase flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Procédure d’installation</button>
            </div>
          </section>
        </div>
      )}

      <footer className="border-t border-[#711361]/25 bg-[#140c13] py-10 px-6 text-center text-xs text-white/55">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-center gap-3"><StrykerLogo size={32} /><span className="font-black text-white">STRYKER</span></div>
          <p>STRYKER — créé pour la communauté Football Life et PES 2021.</p>
          <p className="text-[10px] text-white/35">Projet indépendant pour la communauté SP Football Life et PES 2021. Non affilié à Konami, SmokePatch ou Nexus Mods.</p>
        </div>
      </footer>
    </div>
  );
}
