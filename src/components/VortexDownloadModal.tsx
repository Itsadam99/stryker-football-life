import React from "react";
import { ExternalLink, Monitor, ShieldCheck, X } from "lucide-react";
import { CatalogMod } from "../types";
import { StrykerLogo } from "./StrykerLogo";

interface VortexDownloadModalProps {
  mod: CatalogMod | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadExe: () => void;
}

export const VortexDownloadModal: React.FC<VortexDownloadModalProps> = ({ mod, isOpen, onClose, onDownloadExe }) => {
  if (!isOpen || !mod) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="source-modal-title" className="bg-[#1a0717] border border-[#711361] rounded-3xl max-w-lg w-full p-7 shadow-2xl relative" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} aria-label="Fermer" className="absolute top-5 right-5 text-white/50 hover:text-white p-1"><X className="w-5 h-5" /></button>
        <div className="flex justify-center mb-4"><StrykerLogo size={48} /></div>
        <h2 id="source-modal-title" className="text-xl font-black text-center uppercase">Installer depuis la source</h2>
        <p className="text-xs text-center text-white/55 mt-2">{mod.title} · {mod.author}</p>

        <div className="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 flex gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div className="text-xs text-emerald-50/75 leading-relaxed">
            <strong className="text-emerald-200">STRYKER respecte la page et les permissions de l’auteur.</strong>
            <p className="mt-1">Télécharge le fichier depuis sa source, puis importe le ZIP dans l’application desktop. Aucun faux téléchargement ni dossier vide ne sera créé.</p>
          </div>
        </div>

        <ol className="mt-5 space-y-3 text-xs text-white/65">
          <li className="flex gap-3"><span className="font-black text-[#d870c5]">1</span><span>Ouvre la source officielle ou communautaire et lis les instructions.</span></li>
          <li className="flex gap-3"><span className="font-black text-[#d870c5]">2</span><span>Télécharge l’archive ZIP proposée par l’auteur.</span></li>
          <li className="flex gap-3"><span className="font-black text-[#d870c5]">3</span><span>Dans STRYKER Desktop, utilise « Installer une archive ZIP ».</span></li>
        </ol>

        <div className="mt-7 grid sm:grid-cols-2 gap-3">
          <a href={mod.downloadUrl} target="_blank" rel="noreferrer" className="rounded-full bg-white text-[#711361] py-3 px-4 text-xs font-black uppercase flex items-center justify-center gap-2">Source de l’auteur <ExternalLink className="w-4 h-4" /></a>
          <button onClick={() => { onClose(); onDownloadExe(); }} className="rounded-full bg-[#711361] py-3 px-4 text-xs font-black uppercase flex items-center justify-center gap-2"><Monitor className="w-4 h-4" /> Ouvrir Desktop</button>
        </div>
      </section>
    </div>
  );
};
