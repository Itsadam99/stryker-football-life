import { useState } from "react";
import type { CatalogMod } from "../types";

export const DEFAULT_THUMBNAIL = "/stryker-logo.png";

export function hasCover(mod: Pick<CatalogMod, "thumbnail">) {
  return Boolean(mod.thumbnail) && mod.thumbnail !== DEFAULT_THUMBNAIL;
}

/**
 * Bandeau d’illustration d’une fiche de mod.
 *
 * Sans image propre, la carte garde le filigrane STRYKER : c’est le cas de la
 * plupart des paquets, et une vignette vide serait pire que pas de vignette.
 * Dès qu’un mod en a une, elle occupe le bandeau, assombrie vers le bas pour
 * que le titre et les badges restent lisibles. Si le fichier manque à
 * l’exécution, on revient au filigrane plutôt que de laisser une image cassée.
 */
export function ModCover({ mod, watermarkClassName, coverClassName = "", overlayClassName = "" }: {
  mod: Pick<CatalogMod, "thumbnail" | "title">;
  watermarkClassName: string;
  coverClassName?: string;
  overlayClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!hasCover(mod) || failed) {
    return (
      <img
        src={DEFAULT_THUMBNAIL}
        alt=""
        aria-hidden="true"
        width={1536}
        height={1024}
        loading="lazy"
        decoding="async"
        className={watermarkClassName}
      />
    );
  }

  return (
    <>
      <img
        src={mod.thumbnail}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${coverClassName}`}
      />
      {/* Assombri en haut et en bas : les badges et le libellé de catégorie sont posés sur ces deux bords. */}
      <div className={`pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(7,5,7,.92),rgba(7,5,7,.18)_52%,rgba(7,5,7,.58))] ${overlayClassName}`} />
    </>
  );
}
