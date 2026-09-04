import type { Language } from "../i18n";

/**
 * Libellés du centre de contrôle DLSS. Même motif que SITE_COPY : cette surface
 * a son propre vocabulaire, inutile de charger i18n.tsx avec une trentaine de
 * clés qui ne servent qu'à une seule fenêtre.
 */
type DlssCopy = {
  windowTitle: string;
  eyebrow: string;
  open: string;
  master: string;
  masterOn: string;
  masterOff: string;
  quality: string;
  presets: string;
  presetNeutral: string;
  presetCinema: string;
  presetBroadcast: string;
  presetMax: string;
  presetHint: string;
  rendering: string;
  intensity: string;
  intensityHint: string;
  autoMask: string;
  autoMaskHint: string;
  diffuseWhite: string;
  diffuseWhiteHint: string;
  uiCorrection: string;
  uiCorrectionOff: string;
  uiCorrectionSoft: string;
  uiCorrectionFull: string;
  uiCorrectionHint: string;
  tone: string;
  globalTone: string;
  localTone: string;
  structure: string;
  localStructure: string;
  skinStructure: string;
  panel: string;
  panelOn: string;
  panelOff: string;
  panelConfigure: string;
  panelRestore: string;
  panelHint: string;
  apply: string;
  reset: string;
  unsaved: string;
  upToDate: string;
  gameRunning: string;
  notReady: string;
  notReadyHint: string;
  loading: string;
};

export const DLSS_COPY: Record<Language, DlssCopy> = {
  fr: {
    windowTitle: "Centre de contrôle DLSS 5",
    eyebrow: "Direct Neural Rendering · RenoDX",
    open: "Ouvrir le centre DLSS",
    master: "Neural Rendering",
    masterOn: "Actif",
    masterOff: "Inactif",
    quality: "Niveau de qualité",
    presets: "Préréglages",
    presetNeutral: "Neutre",
    presetCinema: "Cinéma",
    presetBroadcast: "Diffusion TV",
    presetMax: "Maximum",
    presetHint: "Un préréglage remplit les curseurs ci-dessous. Rien n’est écrit tant que tu n’as pas appliqué.",
    rendering: "Rendu neuronal",
    intensity: "Intensité",
    intensityHint: "Dosage global de l’effet neuronal sur l’image.",
    autoMask: "Masque automatique",
    autoMaskHint: "Laisse RenoDX exclure l’interface et les éléments 2D.",
    diffuseWhite: "Blanc diffus",
    diffuseWhiteHint: "Point de référence du blanc, en nits.",
    uiCorrection: "Correction de l’interface",
    uiCorrectionOff: "Aucune",
    uiCorrectionSoft: "Conservatrice",
    uiCorrectionFull: "Complète",
    uiCorrectionHint: "Corrige le rendu du HUD et des menus du jeu.",
    tone: "Tonalité",
    globalTone: "Force globale",
    localTone: "Force locale",
    structure: "Structure",
    localStructure: "Détail local",
    skinStructure: "Peau et visages",
    panel: "Panneau en jeu",
    panelOn: "Configuré sur F10",
    panelOff: "Non configuré",
    panelConfigure: "Configurer F10",
    panelRestore: "Restaurer l’origine",
    panelHint: "Le panneau RenoDX s’ouvre en jeu avec F10 et applique les réglages à chaud, sans redémarrer.",
    apply: "Appliquer",
    reset: "Réinitialiser",
    unsaved: "Modifications non appliquées",
    upToDate: "Réglages à jour",
    gameRunning: "Football Life est lancé : ferme le jeu pour écrire les réglages.",
    notReady: "RenoDX DLSS introuvable",
    notReadyHint: "Lie ton installation et installe ReShade + RenoDX DLSS pour piloter le rendu neuronal.",
    loading: "Lecture de la configuration",
  },
  en: {
    windowTitle: "DLSS 5 Control Center",
    eyebrow: "Direct Neural Rendering · RenoDX",
    open: "Open DLSS center",
    master: "Neural Rendering",
    masterOn: "On",
    masterOff: "Off",
    quality: "Quality level",
    presets: "Presets",
    presetNeutral: "Neutral",
    presetCinema: "Cinema",
    presetBroadcast: "Broadcast",
    presetMax: "Maximum",
    presetHint: "A preset fills the sliders below. Nothing is written until you apply.",
    rendering: "Neural rendering",
    intensity: "Intensity",
    intensityHint: "Overall strength of the neural effect on the image.",
    autoMask: "Automatic mask",
    autoMaskHint: "Let RenoDX exclude the interface and 2D elements.",
    diffuseWhite: "Diffuse white",
    diffuseWhiteHint: "White reference point, in nits.",
    uiCorrection: "Interface correction",
    uiCorrectionOff: "None",
    uiCorrectionSoft: "Conservative",
    uiCorrectionFull: "Full",
    uiCorrectionHint: "Corrects how the HUD and in-game menus are rendered.",
    tone: "Tone",
    globalTone: "Global strength",
    localTone: "Local strength",
    structure: "Structure",
    localStructure: "Local detail",
    skinStructure: "Skin and faces",
    panel: "In-game panel",
    panelOn: "Bound to F10",
    panelOff: "Not configured",
    panelConfigure: "Configure F10",
    panelRestore: "Restore original",
    panelHint: "The RenoDX panel opens in game with F10 and applies settings live, with no restart.",
    apply: "Apply",
    reset: "Reset",
    unsaved: "Unapplied changes",
    upToDate: "Settings up to date",
    gameRunning: "Football Life is running: close the game to write settings.",
    notReady: "RenoDX DLSS not found",
    notReadyHint: "Link your installation and install ReShade + RenoDX DLSS to drive neural rendering.",
    loading: "Reading configuration",
  },
  pt: {
    windowTitle: "Centro de controlo DLSS 5",
    eyebrow: "Direct Neural Rendering · RenoDX",
    open: "Abrir centro DLSS",
    master: "Neural Rendering",
    masterOn: "Ativo",
    masterOff: "Inativo",
    quality: "Nível de qualidade",
    presets: "Predefinições",
    presetNeutral: "Neutro",
    presetCinema: "Cinema",
    presetBroadcast: "Transmissão TV",
    presetMax: "Máximo",
    presetHint: "Uma predefinição preenche os cursores abaixo. Nada é escrito até aplicares.",
    rendering: "Renderização neuronal",
    intensity: "Intensidade",
    intensityHint: "Força global do efeito neuronal na imagem.",
    autoMask: "Máscara automática",
    autoMaskHint: "Deixa o RenoDX excluir a interface e os elementos 2D.",
    diffuseWhite: "Branco difuso",
    diffuseWhiteHint: "Ponto de referência do branco, em nits.",
    uiCorrection: "Correção da interface",
    uiCorrectionOff: "Nenhuma",
    uiCorrectionSoft: "Conservadora",
    uiCorrectionFull: "Completa",
    uiCorrectionHint: "Corrige a renderização do HUD e dos menus do jogo.",
    tone: "Tonalidade",
    globalTone: "Força global",
    localTone: "Força local",
    structure: "Estrutura",
    localStructure: "Detalhe local",
    skinStructure: "Pele e rostos",
    panel: "Painel no jogo",
    panelOn: "Configurado em F10",
    panelOff: "Não configurado",
    panelConfigure: "Configurar F10",
    panelRestore: "Restaurar original",
    panelHint: "O painel RenoDX abre no jogo com F10 e aplica os ajustes a quente, sem reiniciar.",
    apply: "Aplicar",
    reset: "Reiniciar",
    unsaved: "Alterações por aplicar",
    upToDate: "Definições atualizadas",
    gameRunning: "O Football Life está em execução: fecha o jogo para gravar as definições.",
    notReady: "RenoDX DLSS não encontrado",
    notReadyHint: "Liga a tua instalação e instala o ReShade + RenoDX DLSS para controlar a renderização neuronal.",
    loading: "A ler a configuração",
  },
  es: {
    windowTitle: "Centro de control DLSS 5",
    eyebrow: "Direct Neural Rendering · RenoDX",
    open: "Abrir centro DLSS",
    master: "Neural Rendering",
    masterOn: "Activo",
    masterOff: "Inactivo",
    quality: "Nivel de calidad",
    presets: "Ajustes predefinidos",
    presetNeutral: "Neutro",
    presetCinema: "Cine",
    presetBroadcast: "Emisión TV",
    presetMax: "Máximo",
    presetHint: "Un ajuste predefinido rellena los deslizadores. No se escribe nada hasta que apliques.",
    rendering: "Renderizado neuronal",
    intensity: "Intensidad",
    intensityHint: "Fuerza global del efecto neuronal sobre la imagen.",
    autoMask: "Máscara automática",
    autoMaskHint: "Deja que RenoDX excluya la interfaz y los elementos 2D.",
    diffuseWhite: "Blanco difuso",
    diffuseWhiteHint: "Punto de referencia del blanco, en nits.",
    uiCorrection: "Corrección de la interfaz",
    uiCorrectionOff: "Ninguna",
    uiCorrectionSoft: "Conservadora",
    uiCorrectionFull: "Completa",
    uiCorrectionHint: "Corrige el renderizado del HUD y los menús del juego.",
    tone: "Tonalidad",
    globalTone: "Fuerza global",
    localTone: "Fuerza local",
    structure: "Estructura",
    localStructure: "Detalle local",
    skinStructure: "Piel y rostros",
    panel: "Panel en el juego",
    panelOn: "Configurado en F10",
    panelOff: "Sin configurar",
    panelConfigure: "Configurar F10",
    panelRestore: "Restaurar original",
    panelHint: "El panel RenoDX se abre en el juego con F10 y aplica los ajustes en caliente, sin reiniciar.",
    apply: "Aplicar",
    reset: "Restablecer",
    unsaved: "Cambios sin aplicar",
    upToDate: "Ajustes al día",
    gameRunning: "Football Life está en marcha: cierra el juego para escribir los ajustes.",
    notReady: "RenoDX DLSS no encontrado",
    notReadyHint: "Vincula tu instalación e instala ReShade + RenoDX DLSS para controlar el renderizado neuronal.",
    loading: "Leyendo la configuración",
  },
};

/** Curseurs pilotés par les préréglages. Les autres réglages ne sont pas touchés. */
export type DlssPresetValues = {
  intensity: number;
  diffuseWhiteNits: number;
  globalToneStrength: number;
  localToneStrength: number;
  localStructureStrength: number;
  skinStructureStrength: number;
};

export const DLSS_PRESETS: Record<"neutral" | "cinema" | "broadcast" | "max", DlssPresetValues> = {
  neutral: { intensity: 0.5, diffuseWhiteNits: 300, globalToneStrength: 0.5, localToneStrength: 0.4, localStructureStrength: 0.4, skinStructureStrength: 0.35 },
  cinema: { intensity: 0.85, diffuseWhiteNits: 420, globalToneStrength: 0.9, localToneStrength: 0.65, localStructureStrength: 0.6, skinStructureStrength: 0.8 },
  broadcast: { intensity: 0.7, diffuseWhiteNits: 550, globalToneStrength: 0.7, localToneStrength: 0.8, localStructureStrength: 0.75, skinStructureStrength: 0.55 },
  max: { intensity: 1, diffuseWhiteNits: 700, globalToneStrength: 1, localToneStrength: 1, localStructureStrength: 1, skinStructureStrength: 1 },
};
