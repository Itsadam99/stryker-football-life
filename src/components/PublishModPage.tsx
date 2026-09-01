import React, { useState } from "react";
import { ArrowLeft, CheckCircle2, FileArchive, Send, ShieldCheck } from "lucide-react";
import { api } from "../services/api";
import type { HubSubmissionInput, ModCategory } from "../types";
import { useI18n } from "../i18n";

interface PublishModPageProps {
  onBackToHome: () => void;
}

const INITIAL_FORM: HubSubmissionInput = {
  title: "",
  author: "",
  version: "1.0.0",
  shortDesc: "",
  fullDesc: "",
  category: "other",
  compatibility: ["Football Life 2026"],
  tags: [],
  thumbnail: "",
  sourceUrl: "",
  license: "",
  submitterEmail: "",
  distributionPermission: false,
};

export const PublishModPage: React.FC<PublishModPageProps> = ({ onBackToHome }) => {
  const { t } = useI18n();
  const [form, setForm] = useState(INITIAL_FORM);
  const [compatibility, setCompatibility] = useState("Football Life 2026");
  const [tags, setTags] = useState("");
  const [archive, setArchive] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const setField = <K extends keyof HubSubmissionInput>(key: K, value: HubSubmissionInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!archive) return setError(t("publish.selectZipError"));
    if (!archive.name.toLowerCase().endsWith(".zip")) return setError(t("publish.invalidZipError"));
    setBusy(true);
    setError("");
    try {
      const created = await api.createSubmission({
        ...form,
        compatibility: compatibility.split(",").map((value) => value.trim()).filter(Boolean),
        tags: tags.split(",").map((value) => value.trim()).filter(Boolean),
      });
      await api.uploadSubmissionArchive(created.submission.id, archive);
      setDone(true);
    } catch (submissionError: any) {
      setError(submissionError.message || t("publish.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="min-h-screen bg-[#050405] px-6 pb-20 pt-32 text-white">
        <section className="mx-auto max-w-xl rounded-[2rem] border border-emerald-500/25 bg-[#0d0a0c] p-8 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" />
          <h1 className="mt-5 text-3xl font-black uppercase">{t("publish.sent")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">{t("publish.sentDescription")}</p>
          <button onClick={onBackToHome} className="mt-7 rounded-full bg-white px-6 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-black">{t("publish.back")}</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050405] px-5 pb-28 pt-28 text-white sm:px-8 lg:px-12 lg:pb-40 lg:pt-36">
      <div className="mx-auto max-w-[1180px]">
        <button onClick={onBackToHome} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/65 transition hover:border-white/40"><ArrowLeft className="h-4 w-4" /> {t("nav.home")}</button>
        <div className="mt-14 grid gap-8 border-b border-white/10 pb-12 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
          <div><p className="editorial-kicker">{t("publish.eyebrow")}</p><h1 className="mt-6 text-[clamp(3.5rem,8vw,8rem)] font-black uppercase leading-[0.8] tracking-[-0.08em]">{t("publish.title")}</h1></div>
          <p className="max-w-xl text-sm leading-7 text-white/50 lg:justify-self-end">{t("publish.description")}</p>
        </div>

        <form onSubmit={submit} className="mt-10 space-y-7 rounded-[2rem] border border-white/10 bg-[#0d090c] p-6 md:p-10">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t("publish.name")}><input required value={form.title} onChange={(event) => setField("title", event.target.value)} className="field" /></Field>
            <Field label={t("publish.author")}><input required value={form.author} onChange={(event) => setField("author", event.target.value)} className="field" /></Field>
            <Field label={t("publish.version")}><input required value={form.version} onChange={(event) => setField("version", event.target.value)} className="field" /></Field>
            <Field label={t("publish.category")}><select value={form.category} onChange={(event) => setField("category", event.target.value as ModCategory)} className="field"><option value="gameplay">Gameplay</option><option value="turf">{t("catalog.stadiums")}</option><option value="menu">Menus</option><option value="audio">Audio</option><option value="kit">Kits</option><option value="face">{t("catalog.faces")}</option><option value="scoreboard">Scoreboards</option><option value="other">{t("catalog.game")}</option></select></Field>
          </div>
          <Field label={t("publish.short")}><input required maxLength={240} value={form.shortDesc} onChange={(event) => setField("shortDesc", event.target.value)} className="field" /></Field>
          <Field label={t("publish.full")}><textarea value={form.fullDesc} onChange={(event) => setField("fullDesc", event.target.value)} className="field min-h-32" /></Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t("publish.compatibility")}><input value={compatibility} onChange={(event) => setCompatibility(event.target.value)} className="field" /></Field>
            <Field label={t("publish.tags")}><input value={tags} onChange={(event) => setTags(event.target.value)} className="field" /></Field>
            <Field label={t("publish.image")}><input type="url" value={form.thumbnail} onChange={(event) => setField("thumbnail", event.target.value)} className="field" /></Field>
            <Field label={t("publish.project")}><input type="url" value={form.sourceUrl} onChange={(event) => setField("sourceUrl", event.target.value)} className="field" /></Field>
            <Field label={t("publish.license")}><input value={form.license} onChange={(event) => setField("license", event.target.value)} className="field" /></Field>
            <Field label={t("publish.email")}><input type="email" value={form.submitterEmail} onChange={(event) => setField("submitterEmail", event.target.value)} className="field" /></Field>
          </div>

          <label className={`flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed p-5 ${archive ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/20 bg-black/20"}`}>
            <FileArchive className={`h-8 w-8 ${archive ? "text-emerald-400" : "text-[#d870c5]"}`} />
            <span className="min-w-0 flex-1"><strong className="block text-sm">{archive ? archive.name : t("publish.chooseZip")}</strong><span className="mt-1 block text-[11px] text-white/45">{t("publish.zipHelp")}</span></span>
            <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(event) => setArchive(event.target.files?.[0] || null)} />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-50/75">
            <input type="checkbox" required checked={form.distributionPermission} onChange={(event) => setField("distributionPermission", event.target.checked)} className="mt-0.5 accent-[#711361]" />
            <span>{t("publish.permission")}</span>
          </label>

          <div className="flex gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-[11px] leading-relaxed text-white/50"><ShieldCheck className="h-5 w-5 flex-shrink-0 text-emerald-400" /><p>{t("publish.security")}</p></div>
          {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100">{error}</p>}
          <button disabled={busy || !archive || !form.distributionPermission} className="ml-auto flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-black disabled:opacity-40"><Send className="h-4 w-4" /> {busy ? t("publish.sending") : t("publish.send")}</button>
        </form>
      </div>
    </main>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[10px] font-black uppercase tracking-[0.08em] text-white/55"><span className="mb-2.5 block">{label}</span>{children}</label>;
}
