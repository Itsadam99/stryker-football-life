import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Cpu, Gauge, Layers, RefreshCw, RotateCcw, Sparkles, Sun,
} from "lucide-react";
import { api } from "../services/api";
import { DLSS_COPY, DLSS_PRESETS, type DlssPresetValues } from "../services/dlssCopy";
import type { DlssSettings, GameProcessStatus } from "../types";
import { useI18n } from "../i18n";
import { StrykerLogo } from "./StrykerLogo";

/** Réglages modifiables depuis cette fenêtre, dans l'ordre où ils sont envoyés. */
type DlssDraft = {
  enabled: boolean;
  qualityMode: number;
  autoExposure: boolean;
  intensity: number;
  autoMask: boolean;
  diffuseWhiteNits: number;
  uiCorrectionMode: 0 | 1 | 2;
  globalToneStrength: number;
  localToneStrength: number;
  localStructureStrength: number;
  skinStructureStrength: number;
};

const DRAFT_KEYS: Array<keyof DlssDraft> = [
  "enabled", "qualityMode", "autoExposure", "intensity", "autoMask", "diffuseWhiteNits",
  "uiCorrectionMode", "globalToneStrength", "localToneStrength", "localStructureStrength", "skinStructureStrength",
];

function toDraft(settings: DlssSettings): DlssDraft {
  return {
    enabled: settings.enabled,
    qualityMode: settings.qualityMode,
    autoExposure: settings.autoExposure,
    intensity: settings.intensity,
    autoMask: settings.autoMask,
    diffuseWhiteNits: settings.diffuseWhiteNits,
    uiCorrectionMode: settings.uiCorrectionMode,
    globalToneStrength: settings.globalToneStrength,
    localToneStrength: settings.localToneStrength,
    localStructureStrength: settings.localStructureStrength,
    skinStructureStrength: settings.skinStructureStrength,
  };
}

export function DlssStudio() {
  const { language, t } = useI18n();
  const copy = DLSS_COPY[language];
  const [settings, setSettings] = useState<DlssSettings | null>(null);
  const [draft, setDraft] = useState<DlssDraft | null>(null);
  const [status, setStatus] = useState<GameProcessStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const qualityModes = useMemo(() => [
    { value: 0, label: t("desktop.dlssDefault") },
    { value: 1, label: t("desktop.dlssPerformance") },
    { value: 2, label: t("desktop.dlssBalanced") },
    { value: 3, label: t("desktop.dlssQualityMode") },
    { value: 4, label: t("desktop.dlssUltraPerformance") },
    { value: 5, label: t("desktop.dlssUltraQuality") },
    { value: 6, label: "DLAA" },
  ], [t]);

  const announce = useCallback((message: string, type: "success" | "error" = "success") => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4500);
  }, []);

  const load = useCallback(async () => {
    const next = await api.getDlssSettings();
    setSettings(next);
    setDraft(toDraft(next));
    return next;
  }, []);

  useEffect(() => {
    load().catch((error) => announce(error.message, "error"));
  }, [load, announce]);

  // Le jeu doit être fermé pour écrire ReShade.ini : on suit son état sans
  // marteler l'API, avec repli quand le moteur local ne répond plus.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let failures = 0;
    const tick = async () => {
      try {
        const next = await api.getLauncherStatus();
        if (cancelled) return;
        setStatus(next);
        failures = 0;
      } catch {
        failures += 1;
      }
      if (cancelled) return;
      timer = window.setTimeout(tick, failures === 0 ? 2_000 : Math.min(2_000 * 2 ** failures, 30_000));
    };
    timer = window.setTimeout(tick, 2_000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    document.title = `${copy.windowTitle} — STRYKER`;
  }, [copy.windowTitle]);

  const gameRunning = Boolean(status?.isRunning);
  const ready = Boolean(settings?.configurable);
  const locked = busy || gameRunning || !ready;
  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    const saved = toDraft(settings);
    return DRAFT_KEYS.some((key) => saved[key] !== draft[key]);
  }, [settings, draft]);

  const patch = (values: Partial<DlssDraft>) => setDraft((current) => (current ? { ...current, ...values } : current));
  const applyPreset = (values: DlssPresetValues) => patch(values);

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await load();
      announce(successMessage);
    } catch (error: any) {
      announce(error.message || "Erreur STRYKER.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (!settings || !draft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--sk-void)] font-poppins text-white">
        <div className="flex flex-col items-center gap-5">
          <StrykerLogo size={72} />
          <RefreshCw className="h-4 w-4 animate-spin text-[color:var(--sk-brand-glow)]" />
          <p className="sk-label">{copy.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--sk-void)] font-poppins text-white">
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={`sk-toast fixed bottom-24 right-5 z-50 max-w-sm px-4 py-3 text-xs font-semibold ${
            notice.type === "success"
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
              : "border-rose-400/40 bg-rose-500/15 text-rose-100"
          }`}
        >
          <span className="flex items-start gap-2.5">
            {notice.type === "success"
              ? <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-emerald-300" />
              : <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-rose-300" />}
            {notice.message}
          </span>
        </div>
      )}

      {/* ---------------------------------------------------------- EN-TÊTE */}
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-[color:var(--sk-ink)]/90 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3.5">
          <div className="motion-logo"><StrykerLogo size={38} /></div>
          <div>
            <p className="sk-eyebrow">{copy.eyebrow}</p>
            <h1 className="sk-display mt-1 text-[clamp(1.3rem,2.6vw,1.75rem)]">{copy.windowTitle}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="sk-chip" data-tone={settings.compatibility.supported ? "ok" : "warn"}>
            <Cpu className="h-3 w-3" />
            {settings.compatibility.gpuName || t("desktop.dlssGpuUnknown")}
          </span>
          <span className="sk-chip" data-tone={settings.overlay.configured ? "brand" : undefined}>
            {settings.overlay.configured ? copy.panelOn : copy.panelOff}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 space-y-5 p-6">
        {!ready && (
          <section className="flex gap-3.5 rounded-[var(--sk-r-lg)] border border-amber-400/30 bg-amber-400/[0.07] p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight text-amber-100">{copy.notReady}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-amber-100/65">{copy.notReadyHint}</p>
              {settings.missingFiles.length > 0 && (
                <p className="mt-2 break-words font-mono text-[10px] text-amber-200/60">
                  {t("desktop.dlssMissing")} {settings.missingFiles.join(", ")}
                </p>
              )}
            </div>
          </section>
        )}

        {gameRunning && (
          <p className="rounded-[var(--sk-r-md)] border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-[11px] text-sky-100/80">
            {copy.gameRunning}
          </p>
        )}

        {/* -------------------------------------------------- INTERRUPTEUR */}
        <section className="sk-statusband flex flex-wrap items-center justify-between gap-5 p-6">
          <img src="/stryker-logo.png" alt="" aria-hidden="true" width={1536} height={1024} loading="lazy" decoding="async" className="sk-watermark -right-12 -top-16 w-72 max-w-none" />
          <div className="relative">
            <p className="sk-eyebrow">{copy.master}</p>
            <h2 className="sk-display mt-2 text-[clamp(1.7rem,3.4vw,2.6rem)]">
              {draft.enabled ? copy.masterOn : copy.masterOff}
            </h2>
            <p className={`mt-2 text-[11px] ${settings.installed ? "text-emerald-300" : "text-amber-300"}`}>
              {settings.installed ? t("desktop.dlssDetected") : t("desktop.dlssIncomplete")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.enabled}
            aria-label={copy.master}
            disabled={locked}
            onClick={() => patch({ enabled: !draft.enabled })}
            className="sk-switch relative h-9 w-16 shrink-0 disabled:opacity-40"
            data-on={draft.enabled ? "on" : "off"}
            style={{ height: 36, width: 64, padding: 5 }}
          >
            <span style={{ height: 26, width: 26, transform: draft.enabled ? "translateX(28px)" : undefined }} />
          </button>
        </section>

        {/* ----------------------------------------------------- QUALITÉ */}
        <section className="sk-panel">
          <div className="sk-panel-head">
            <h2 className="flex items-center gap-2.5 text-xs font-black uppercase tracking-[0.08em]">
              <Gauge className="h-4 w-4 text-[color:var(--sk-brand-glow)]" />{copy.quality}
            </h2>
          </div>
          <div className="sk-panel-body">
            <div className="sk-segment" role="group" aria-label={copy.quality}>
              {qualityModes.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  disabled={locked}
                  aria-pressed={draft.qualityMode === mode.value}
                  data-active={draft.qualityMode === mode.value}
                  onClick={() => patch({ qualityMode: mode.value })}
                  className="sk-segment-item"
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- PRÉRÉGLAGES */}
        <section className="sk-panel">
          <div className="sk-panel-head">
            <h2 className="flex items-center gap-2.5 text-xs font-black uppercase tracking-[0.08em]">
              <Sparkles className="h-4 w-4 text-[color:var(--sk-brand-glow)]" />{copy.presets}
            </h2>
          </div>
          <div className="sk-panel-body">
            <div className="grid gap-2 sm:grid-cols-4">
              {([
                ["neutral", copy.presetNeutral],
                ["cinema", copy.presetCinema],
                ["broadcast", copy.presetBroadcast],
                ["max", copy.presetMax],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" disabled={locked} onClick={() => applyPreset(DLSS_PRESETS[key])} className="sk-btn sk-btn-ghost">
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{copy.presetHint}</p>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* ------------------------------------------------ RENDU NEURONAL */}
          <section className="sk-panel">
            <div className="sk-panel-head">
              <h2 className="flex items-center gap-2.5 text-xs font-black uppercase tracking-[0.08em]">
                <Sparkles className="h-4 w-4 text-[color:var(--sk-brand-glow)]" />{copy.rendering}
              </h2>
            </div>
            <div className="sk-panel-body space-y-5">
              <Slider id="dlss-intensity" label={copy.intensity} hint={copy.intensityHint} value={draft.intensity} min={0} max={1} step={0.05} disabled={locked} onChange={(intensity) => patch({ intensity })} />
              <Slider id="dlss-white" label={copy.diffuseWhite} hint={copy.diffuseWhiteHint} value={draft.diffuseWhiteNits} min={80} max={1000} step={10} unit=" nits" decimals={0} disabled={locked} onChange={(diffuseWhiteNits) => patch({ diffuseWhiteNits })} />
              <Toggle label={copy.autoMask} hint={copy.autoMaskHint} checked={draft.autoMask} disabled={locked} onChange={(autoMask) => patch({ autoMask })} />
              <Toggle label={t("desktop.dlssAutoExposure")} checked={draft.autoExposure} disabled={locked} onChange={(autoExposure) => patch({ autoExposure })} />
              <div>
                <label className="sk-label mb-2 block" htmlFor="dlss-ui-correction">{copy.uiCorrection}</label>
                <select
                  id="dlss-ui-correction"
                  className="sk-input"
                  disabled={locked}
                  value={draft.uiCorrectionMode}
                  onChange={(event) => patch({ uiCorrectionMode: Number(event.target.value) as 0 | 1 | 2 })}
                >
                  <option value={0}>{copy.uiCorrectionOff}</option>
                  <option value={1}>{copy.uiCorrectionSoft}</option>
                  <option value={2}>{copy.uiCorrectionFull}</option>
                </select>
                <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{copy.uiCorrectionHint}</p>
              </div>
            </div>
          </section>

          <div className="space-y-5">
            {/* ------------------------------------------------------ TONALITÉ */}
            <section className="sk-panel">
              <div className="sk-panel-head">
                <h2 className="flex items-center gap-2.5 text-xs font-black uppercase tracking-[0.08em]">
                  <Sun className="h-4 w-4 text-[color:var(--sk-brand-glow)]" />{copy.tone}
                </h2>
              </div>
              <div className="sk-panel-body space-y-5">
                <Slider id="dlss-tone-global" label={copy.globalTone} value={draft.globalToneStrength} min={0} max={1} step={0.05} disabled={locked} onChange={(globalToneStrength) => patch({ globalToneStrength })} />
                <Slider id="dlss-tone-local" label={copy.localTone} value={draft.localToneStrength} min={0} max={1} step={0.05} disabled={locked} onChange={(localToneStrength) => patch({ localToneStrength })} />
              </div>
            </section>

            {/* ----------------------------------------------------- STRUCTURE */}
            <section className="sk-panel">
              <div className="sk-panel-head">
                <h2 className="flex items-center gap-2.5 text-xs font-black uppercase tracking-[0.08em]">
                  <Layers className="h-4 w-4 text-[color:var(--sk-brand-glow)]" />{copy.structure}
                </h2>
              </div>
              <div className="sk-panel-body space-y-5">
                <Slider id="dlss-structure-local" label={copy.localStructure} value={draft.localStructureStrength} min={0} max={1} step={0.05} disabled={locked} onChange={(localStructureStrength) => patch({ localStructureStrength })} />
                <Slider id="dlss-structure-skin" label={copy.skinStructure} value={draft.skinStructureStrength} min={0} max={1} step={0.05} disabled={locked} onChange={(skinStructureStrength) => patch({ skinStructureStrength })} />
              </div>
            </section>
          </div>
        </div>

        {/* ----------------------------------------------------- PANNEAU F10 */}
        <section className="sk-panel">
          <div className="sk-panel-head">
            <h2 className="flex items-center gap-2.5 text-xs font-black uppercase tracking-[0.08em]">
              <Gauge className="h-4 w-4 text-[color:var(--sk-brand-glow)]" />{copy.panel}
            </h2>
            <span className="sk-chip" data-tone={settings.overlay.configured ? "ok" : "warn"}>
              {settings.overlay.configured ? copy.panelOn : copy.panelOff}
            </span>
          </div>
          <div className="sk-panel-body">
            <p className="text-[11px] leading-relaxed text-[color:var(--sk-faint)]">{copy.panelHint}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={locked}
                onClick={() => run(() => api.configureDlssOverlay(), copy.panelOn)}
                className="sk-btn sk-btn-brand"
              >{copy.panelConfigure}</button>
              <button
                type="button"
                disabled={locked}
                onClick={() => run(() => api.restoreDlssOverlay(), copy.panelRestore)}
                className="sk-btn sk-btn-ghost"
              >
                <RotateCcw className="h-3.5 w-3.5" />{copy.panelRestore}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* --------------------------------------------------------- PIED DE PAGE */}
      <footer className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 bg-[color:var(--sk-ink)]/90 px-6 py-4 backdrop-blur-xl">
        <p className="flex items-center gap-2.5 text-[11px] font-bold">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dirty ? "bg-[color:var(--sk-warn)]" : "bg-[color:var(--sk-ok)]"}`} />
          <span className={dirty ? "text-amber-200" : "text-[color:var(--sk-faint)]"}>
            {dirty ? copy.unsaved : copy.upToDate}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => setDraft(toDraft(settings))}
            className="sk-btn sk-btn-ghost"
          >
            <RotateCcw className="h-3.5 w-3.5" />{copy.reset}
          </button>
          <button
            type="button"
            disabled={locked || !dirty}
            onClick={() => run(() => api.saveDlssSettings(draft), t("desktop.dlssSaved"))}
            className="sk-btn sk-btn-primary"
          >
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {copy.apply}
          </button>
        </div>
      </footer>
    </div>
  );
}

function Slider({ id, label, hint, value, min, max, step, unit = "", decimals = 2, disabled, onChange }: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="sk-label" htmlFor={id}>{label}</label>
        <span className="font-mono text-[11px] font-bold text-[color:var(--sk-accent)]">
          {value.toFixed(decimals)}{unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="sk-slider mt-2.5"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ ["--sk-fill" as string]: `${fill}%` }}
      />
      {hint && <p className="mt-1.5 text-[10px] leading-relaxed text-[color:var(--sk-ghost)]">{hint}</p>}
    </div>
  );
}

function Toggle({ label, hint, checked, disabled, onChange }: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-bold">{label}</p>
        {hint && <p className="mt-1 text-[10px] leading-relaxed text-[color:var(--sk-ghost)]">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="sk-switch mt-0.5 shrink-0 disabled:opacity-40"
        data-on={checked ? "on" : "off"}
      ><span /></button>
    </div>
  );
}
