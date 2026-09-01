import React from "react";
import { Download, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useI18n } from "../i18n";
import { STRYKER_DOWNLOAD_URL } from "../services/distribution";
import { StrykerLogo } from "./StrykerLogo";

interface StrykerUnavailableModalProps {
  isOpen: boolean;
  modTitle?: string;
  onClose: () => void;
  onRetry: () => void;
}

export const StrykerUnavailableModal: React.FC<StrykerUnavailableModalProps> = ({
  isOpen,
  modTitle,
  onClose,
  onRetry,
}) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md" onClick={onClose}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="stryker-required-title"
        aria-describedby="stryker-required-description"
        className="relative w-full max-w-lg rounded-[2rem] border border-white/12 bg-[#0d090c] p-7 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button onClick={onClose} aria-label={t("common.close")} className="absolute right-5 top-5 p-1 text-white/50 hover:text-white">
          <X className="h-5 w-5" />
        </button>
        <div className="flex justify-center"><StrykerLogo size={56} /></div>
        <h2 id="stryker-required-title" className="mt-4 text-center text-xl font-black uppercase">{t("appFallback.title")}</h2>
        <p id="stryker-required-description" className="mt-3 text-center text-sm leading-relaxed text-white/60">
          {t("appFallback.description")}
        </p>
        {modTitle && <p className="mt-3 text-center text-xs font-bold text-[#e69bd8]">{t("appFallback.pendingMod")} {modTitle}</p>}

        <div className="mt-6 flex gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <ShieldCheck className="h-5 w-5 flex-shrink-0 text-emerald-400" />
          <p className="text-xs leading-relaxed text-emerald-50/75">{t("appFallback.help")}</p>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <a href={STRYKER_DOWNLOAD_URL} className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-black">
            <Download className="h-4 w-4" /> {t("appFallback.download")}
          </a>
          <button onClick={onRetry} className="flex items-center justify-center gap-2 rounded-full bg-[#7f1d70] px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-white">
            <RefreshCw className="h-4 w-4" /> {t("appFallback.retry")}
          </button>
        </div>
      </section>
    </div>
  );
};
