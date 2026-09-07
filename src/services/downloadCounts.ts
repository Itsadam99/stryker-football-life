import { useEffect, useState } from "react";
import type { CatalogMod } from "../types";

/**
 * Nombre réel de téléchargements d'un paquet, lu sur la Release qui l'héberge.
 *
 * GitHub compte chaque téléchargement d'un asset de Release depuis sa mise en
 * ligne et l'expose publiquement. C'est la seule source de vérité disponible :
 * STRYKER n'a pas de serveur de statistiques, et un compteur inventé serait pire
 * que pas de compteur. Un paquet livré avec l'application n'a pas d'asset, donc
 * pas de chiffre — et la carte n'en affiche aucun.
 */
const RELEASES_ENDPOINT = "https://api.github.com/repos/Itsadam99/stryker-football-life/releases";
const CACHE_KEY = "stryker.downloadCounts.v1";
// L'API publique est limitée à 60 requêtes par heure et par adresse : une
// lecture par session suffit largement pour un compteur de cette nature.
const CACHE_TTL_MS = 30 * 60 * 1000;

type Counts = Record<string, number>;

let inflight: Promise<Counts> | null = null;

function readCache(): Counts | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; counts: Counts };
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.counts;
  } catch {
    return null;
  }
}

function writeCache(counts: Counts) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), counts })); }
  catch { /* Navigation privée ou stockage plein : le cache est un confort. */ }
}

/** Nom de l'asset qui héberge ce paquet, ou "" pour un paquet non hébergé. */
export function releaseAssetName(mod: Pick<CatalogMod, "downloadUrl">) {
  if (!mod.downloadUrl || !mod.downloadUrl.includes("/releases/download/")) return "";
  try { return decodeURIComponent(new URL(mod.downloadUrl).pathname.split("/").pop() || ""); }
  catch { return ""; }
}

export async function fetchDownloadCounts(): Promise<Counts> {
  const cached = readCache();
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const response = await fetch(`${RELEASES_ENDPOINT}?per_page=100`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub a répondu ${response.status}.`);
    const releases = await response.json() as Array<{ assets?: Array<{ name?: string; download_count?: number }> }>;
    const counts: Counts = {};
    for (const release of Array.isArray(releases) ? releases : []) {
      for (const asset of release.assets || []) {
        if (!asset?.name || typeof asset.download_count !== "number") continue;
        counts[asset.name] = (counts[asset.name] || 0) + asset.download_count;
      }
    }
    writeCache(counts);
    return counts;
  })().finally(() => { inflight = null; });

  return inflight;
}

export function formatDownloadCount(value: number, language: string) {
  return new Intl.NumberFormat(language === "en" ? "en-US" : language).format(value);
}

/** Compteurs chargés une fois par session ; l'échec est silencieux. */
export function useDownloadCounts() {
  const [counts, setCounts] = useState<Counts>({});
  useEffect(() => {
    let alive = true;
    fetchDownloadCounts().then((value) => { if (alive) setCounts(value); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return counts;
}

/** Nombre de téléchargements du paquet, ou null s'il n'est pas mesurable. */
export function downloadsFor(mod: Pick<CatalogMod, "downloadUrl">, counts: Record<string, number>) {
  const asset = releaseAssetName(mod);
  if (!asset) return null;
  const value = counts[asset];
  return typeof value === "number" ? value : null;
}
