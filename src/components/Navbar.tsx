import React from "react";
import { Monitor } from "lucide-react";
import { StrykerLogo } from "./StrykerLogo";

interface NavbarProps {
  currentPage: "home" | "all-mods";
  setCurrentPage: (page: "home" | "all-mods") => void;
  onOpenDesktop: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPage, setCurrentPage, onOpenDesktop }) => (
  <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md border-b border-[#711361]/35 px-4 lg:px-6 py-3">
    <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
      <button onClick={() => setCurrentPage("home")} className="flex items-center gap-2.5 text-left" aria-label="Accueil STRYKER">
        <StrykerLogo size={36} />
        <div><span className="font-extrabold text-xl tracking-tight">STRYKER</span><p className="hidden sm:block text-[9px] text-white/45 uppercase tracking-wider">Gestionnaire de mods Football Life</p></div>
      </button>

      <nav aria-label="Navigation du site" className="order-3 sm:order-none w-full sm:w-auto flex items-center justify-center gap-1 rounded-full bg-white/5 p-1">
        <button onClick={() => setCurrentPage("home")} aria-current={currentPage === "home" ? "page" : undefined} className={`rounded-full px-4 py-2 text-[10px] font-black uppercase ${currentPage === "home" ? "bg-[#711361]" : "text-white/55 hover:text-white"}`}>Accueil</button>
        <button onClick={() => setCurrentPage("all-mods")} aria-current={currentPage === "all-mods" ? "page" : undefined} className={`rounded-full px-4 py-2 text-[10px] font-black uppercase ${currentPage === "all-mods" ? "bg-[#711361]" : "text-white/55 hover:text-white"}`}>Sources de mods</button>
      </nav>

      <button onClick={onOpenDesktop} className="flex items-center gap-1.5 rounded-full bg-white text-[#711361] px-3.5 py-2 text-[10px] font-black uppercase"><Monitor className="w-3.5 h-3.5" /><span className="hidden sm:inline">Application</span></button>
    </div>
  </header>
);
