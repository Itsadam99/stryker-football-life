import type { Language } from "../i18n";

/** Libellés de la page Journal, sur le modèle de dlssCopy. */
type LogCopy = {
  nav: string;
  eyebrow: string;
  sources: string;
  search: string;
  searchLabel: string;
  follow: string;
  refresh: string;
  live: string;
  paused: string;
  lines: string;
  truncated: string;
  updatedAt: string;
  notLinked: string;
  notLinkedHint: string;
  empty: string;
  emptyHint: string;
  noMatch: string;
  loading: string;
  openedOnLaunch: string;
};

export const LOG_COPY: Record<Language, LogCopy> = {
  fr: {
    nav: "Journal",
    eyebrow: "Journaux du jeu",
    sources: "Sources",
    search: "Filtrer les lignes…",
    searchLabel: "Filtrer le journal",
    follow: "Suivre la fin",
    refresh: "Rafraîchir",
    live: "Suivi en direct",
    paused: "Suivi en pause",
    lines: "lignes",
    truncated: "Seule la fin du fichier est affichée.",
    updatedAt: "Mis à jour",
    notLinked: "Aucune installation liée",
    notLinkedHint: "Lie ton dossier Football Life pour consulter les journaux de Sider et de ReShade.",
    empty: "Aucun journal trouvé",
    emptyHint: "Les journaux apparaissent après le premier lancement du jeu.",
    noMatch: "Aucune ligne ne correspond au filtre.",
    loading: "Lecture du journal",
    openedOnLaunch: "Journal ouvert : le jeu démarre.",
  },
  en: {
    nav: "Logs",
    eyebrow: "Game logs",
    sources: "Sources",
    search: "Filter lines…",
    searchLabel: "Filter the log",
    follow: "Follow tail",
    refresh: "Refresh",
    live: "Live tail",
    paused: "Tail paused",
    lines: "lines",
    truncated: "Only the end of the file is shown.",
    updatedAt: "Updated",
    notLinked: "No linked installation",
    notLinkedHint: "Link your Football Life folder to read the Sider and ReShade logs.",
    empty: "No log found",
    emptyHint: "Logs appear after the game has been started once.",
    noMatch: "No line matches the filter.",
    loading: "Reading the log",
    openedOnLaunch: "Log opened: the game is starting.",
  },
  pt: {
    nav: "Registo",
    eyebrow: "Registos do jogo",
    sources: "Fontes",
    search: "Filtrar linhas…",
    searchLabel: "Filtrar o registo",
    follow: "Seguir o fim",
    refresh: "Atualizar",
    live: "Seguimento em direto",
    paused: "Seguimento em pausa",
    lines: "linhas",
    truncated: "Apenas o fim do ficheiro é mostrado.",
    updatedAt: "Atualizado",
    notLinked: "Nenhuma instalação ligada",
    notLinkedHint: "Liga a tua pasta do Football Life para consultar os registos do Sider e do ReShade.",
    empty: "Nenhum registo encontrado",
    emptyHint: "Os registos aparecem depois do primeiro arranque do jogo.",
    noMatch: "Nenhuma linha corresponde ao filtro.",
    loading: "A ler o registo",
    openedOnLaunch: "Registo aberto: o jogo está a arrancar.",
  },
  es: {
    nav: "Registro",
    eyebrow: "Registros del juego",
    sources: "Fuentes",
    search: "Filtrar líneas…",
    searchLabel: "Filtrar el registro",
    follow: "Seguir el final",
    refresh: "Actualizar",
    live: "Seguimiento en directo",
    paused: "Seguimiento en pausa",
    lines: "líneas",
    truncated: "Solo se muestra el final del archivo.",
    updatedAt: "Actualizado",
    notLinked: "Ninguna instalación vinculada",
    notLinkedHint: "Vincula tu carpeta de Football Life para consultar los registros de Sider y ReShade.",
    empty: "Ningún registro encontrado",
    emptyHint: "Los registros aparecen tras el primer arranque del juego.",
    noMatch: "Ninguna línea coincide con el filtro.",
    loading: "Leyendo el registro",
    openedOnLaunch: "Registro abierto: el juego está arrancando.",
  },
};

/** Colore une ligne selon ce qu'elle contient, pour repérer les incidents. */
export function logLineLevel(line: string): "error" | "warn" | "ok" | undefined {
  if (/\b(error|erreur|fail(ed|ure)?|exception|cannot|unable|missing)\b/i.test(line)) return "error";
  if (/\b(warn(ing)?|attention|deprecated|skipp?ed)\b/i.test(line)) return "warn";
  if (/\b(loaded|started|ok|success|ready|initialized)\b/i.test(line)) return "ok";
  return undefined;
}
