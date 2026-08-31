import type { CatalogMod } from "../types";

/**
 * Curated links only. STRYKER does not mirror third-party files and does not
 * invent download counts or ratings. Each entry sends the user to its author.
 */
export const VERIFIED_CATALOG_MODS: CatalogMod[] = [
  {
    id: "smokepatch-fl26",
    title: "SmokePatch Football Life 2026",
    author: "SmokePatch",
    version: "2.2",
    shortDesc: "Page officielle du jeu autonome Football Life 2026 et de ses mises à jour.",
    fullDesc: "Source officielle de Football Life 2026. L'installation et les mises à jour du jeu restent manuelles afin de respecter les instructions et les fichiers distribués par SmokePatch.",
    category: "other",
    compatibility: ["Football Life 2026"],
    size: "Voir la source",
    thumbnail: "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?auto=format&fit=crop&w=1200&q=80",
    downloadUrl: "https://www.pessmokepatch.com/2025/10/spfl26.html",
    screenshots: [],
    installationType: "manual",
    rating: 0,
    downloadsCount: 0,
    tags: ["officiel", "jeu", "mise à jour"],
    legalStatus: "verified_source",
    verificationDate: "2026-08-30",
  },
  {
    id: "smokepatch-real-faces-2627",
    title: "Real Faces 2026/2027",
    author: "SmokePatch",
    version: "Update 4",
    shortDesc: "Pack officiel de visages destiné à Football Life 2026/2027.",
    fullDesc: "Pack de visages publié par SmokePatch. La page de l'auteur indique environ 37,4 Go installés. L'installation CPK reste manuelle et doit suivre les consignes officielles.",
    category: "face",
    compatibility: ["Football Life 2026", "Football Life 2027"],
    size: "37,4 Go installés",
    thumbnail: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80",
    downloadUrl: "https://www.pessmokepatch.com/2025/10/faces2627.html",
    screenshots: [],
    installationType: "manual",
    rating: 0,
    downloadsCount: 0,
    tags: ["officiel", "visages", "CPK"],
    legalStatus: "verified_source",
    verificationDate: "2026-08-30",
  },
  {
    id: "smokepatch-sider-stadiums",
    title: "Football Life Sider Stadiums",
    author: "SmokePatch",
    version: "Source officielle",
    shortDesc: "Collection et instructions officielles pour les stades chargés par Sider.",
    fullDesc: "Ressources de stades Football Life avec contenu et fichiers de correspondance à installer selon les instructions de SmokePatch. STRYKER ouvre la source, puis permet d'importer un ZIP compatible séparément.",
    category: "turf",
    compatibility: ["Football Life", "Sider 7"],
    size: "Selon le stade",
    thumbnail: "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1200&q=80",
    downloadUrl: "https://www.pessmokepatch.com/2024/11/siderstadiums.html",
    screenshots: [],
    installationType: "mixed",
    rating: 0,
    downloadsCount: 0,
    tags: ["officiel", "stades", "Sider"],
    legalStatus: "verified_source",
    verificationDate: "2026-08-30",
  },
  {
    id: "smokepatch-commentaries",
    title: "Football Life Match Commentaries",
    author: "SmokePatch",
    version: "v9",
    shortDesc: "Packs officiels de commentaires audio pour Football Life.",
    fullDesc: "Page officielle des commentaires multilingues de Football Life. Les fichiers sont volumineux et leur procédure d'installation est spécifique : STRYKER renvoie donc vers les instructions originales.",
    category: "audio",
    compatibility: ["Football Life"],
    size: "Selon la langue",
    thumbnail: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1200&q=80",
    downloadUrl: "https://www.pessmokepatch.com/2025/10/flcoms.html",
    screenshots: [],
    installationType: "manual",
    rating: 0,
    downloadsCount: 0,
    tags: ["officiel", "commentaires", "audio"],
    legalStatus: "verified_source",
    verificationDate: "2026-08-30",
  },
  {
    id: "smokepatch-game-music",
    title: "Football Life Game Music",
    author: "SmokePatch",
    version: "Source officielle",
    shortDesc: "Pack musical alternatif publié pour Football Life.",
    fullDesc: "Ce pack utilise son propre programme d'installation. Par sécurité, STRYKER n'exécute jamais automatiquement les installateurs téléchargés et renvoie vers la procédure de l'auteur.",
    category: "audio",
    compatibility: ["Football Life"],
    size: "Voir la source",
    thumbnail: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80",
    downloadUrl: "https://www.pessmokepatch.com/2024/06/BGM.html",
    screenshots: [],
    installationType: "manual",
    rating: 0,
    downloadsCount: 0,
    tags: ["officiel", "musique", "manuel"],
    legalStatus: "verified_source",
    verificationDate: "2026-08-30",
  },
  {
    id: "holland-world-soccer",
    title: "World Soccer Gameplay Mod",
    author: "Holland",
    version: "Voir le sujet",
    shortDesc: "Mod de gameplay communautaire publié sur EvoWeb.",
    fullDesc: "Lien communautaire vers le sujet de l'auteur. La compatibilité exacte dépend de la version du jeu et des instructions du mod ; elle doit être vérifiée avant toute installation.",
    category: "gameplay",
    compatibility: ["PES 2021", "Football Life (à vérifier selon la version)"],
    size: "Voir la source",
    thumbnail: "https://images.unsplash.com/photo-1575361204480-aadea25e6e68?auto=format&fit=crop&w=1200&q=80",
    downloadUrl: "https://evoweb.uk/threads/new-gameplay-mod-world-soccer-world-soccer-2-new-update-available.84356/",
    screenshots: [],
    installationType: "manual",
    rating: 0,
    downloadsCount: 0,
    tags: ["communauté", "gameplay", "EvoWeb"],
    legalStatus: "community_external",
    verificationDate: "2026-08-30",
  },
];

type CatalogLanguage = "fr" | "en" | "pt" | "es";
type CatalogTranslation = Pick<CatalogMod, "shortDesc" | "fullDesc" | "version" | "compatibility" | "size" | "tags">;

const CATALOG_TRANSLATIONS: Record<Exclude<CatalogLanguage, "fr">, Record<string, CatalogTranslation>> = {
  en: {
    "smokepatch-fl26": {
      shortDesc: "Official page for the standalone Football Life 2026 game and its updates.",
      fullDesc: "Official Football Life 2026 source. Game installation and updates remain manual to respect the instructions and files distributed by SmokePatch.",
      version: "2.2", compatibility: ["Football Life 2026"], size: "View source", tags: ["official", "game", "update"],
    },
    "smokepatch-real-faces-2627": {
      shortDesc: "Official face pack for Football Life 2026/2027.",
      fullDesc: "Face pack published by SmokePatch. The author’s page indicates approximately 37.4 GB installed. CPK installation remains manual and must follow the official instructions.",
      version: "Update 4", compatibility: ["Football Life 2026", "Football Life 2027"], size: "37.4 GB installed", tags: ["official", "faces", "CPK"],
    },
    "smokepatch-sider-stadiums": {
      shortDesc: "Official collection and instructions for stadiums loaded through Sider.",
      fullDesc: "Football Life stadium resources with content and mapping files to install according to SmokePatch instructions. STRYKER opens the source and then lets you import a compatible ZIP separately.",
      version: "Official source", compatibility: ["Football Life", "Sider 7"], size: "Depends on the stadium", tags: ["official", "stadiums", "Sider"],
    },
    "smokepatch-commentaries": {
      shortDesc: "Official audio commentary packs for Football Life.",
      fullDesc: "Official page for Football Life’s multilingual commentary packs. The files are large and use a specific installation procedure, so STRYKER links to the original instructions.",
      version: "v9", compatibility: ["Football Life"], size: "Depends on the language", tags: ["official", "commentary", "audio"],
    },
    "smokepatch-game-music": {
      shortDesc: "Alternative music pack published for Football Life.",
      fullDesc: "This pack uses its own installer. For safety, STRYKER never runs downloaded installers automatically and links to the author’s procedure.",
      version: "Official source", compatibility: ["Football Life"], size: "View source", tags: ["official", "music", "manual"],
    },
    "holland-world-soccer": {
      shortDesc: "Community gameplay mod published on EvoWeb.",
      fullDesc: "Community link to the author’s thread. Exact compatibility depends on the game version and the mod instructions and must be checked before installation.",
      version: "View thread", compatibility: ["PES 2021", "Football Life (check for your version)"], size: "View source", tags: ["community", "gameplay", "EvoWeb"],
    },
    "eferq-graphic-menu-epl-2526": {
      shortDesc: "Premier League 2025/26 graphic menu for PES 2021 and Football Life 2026, directly installable with STRYKER.",
      fullDesc: "Complete package with Menu EPL, UIColors, a Lua module and content data. STRYKER verifies its fingerprint, installs both LiveCPK roots, deploys the Lua module and backs up any Sider data it replaces.",
      version: "2025/26", compatibility: ["PES 2021", "Football Life 2026", "Sider 7.3.4"], size: "127.1 MB", tags: ["menu", "Premier League", "EPL", "UIColors", "EFER.Q"],
    },
  },
  pt: {
    "smokepatch-fl26": {
      shortDesc: "Página oficial do jogo autónomo Football Life 2026 e das suas atualizações.",
      fullDesc: "Fonte oficial do Football Life 2026. A instalação e as atualizações do jogo continuam manuais para respeitar as instruções e os ficheiros distribuídos pela SmokePatch.",
      version: "2.2", compatibility: ["Football Life 2026"], size: "Ver fonte", tags: ["oficial", "jogo", "atualização"],
    },
    "smokepatch-real-faces-2627": {
      shortDesc: "Pack oficial de rostos para Football Life 2026/2027.",
      fullDesc: "Pack de rostos publicado pela SmokePatch. A página do autor indica cerca de 37,4 GB instalados. A instalação CPK continua manual e deve seguir as instruções oficiais.",
      version: "Atualização 4", compatibility: ["Football Life 2026", "Football Life 2027"], size: "37,4 GB instalados", tags: ["oficial", "rostos", "CPK"],
    },
    "smokepatch-sider-stadiums": {
      shortDesc: "Coleção e instruções oficiais para estádios carregados pelo Sider.",
      fullDesc: "Recursos de estádios do Football Life com conteúdo e ficheiros de correspondência para instalar segundo as instruções da SmokePatch. O STRYKER abre a fonte e permite importar separadamente um ZIP compatível.",
      version: "Fonte oficial", compatibility: ["Football Life", "Sider 7"], size: "Depende do estádio", tags: ["oficial", "estádios", "Sider"],
    },
    "smokepatch-commentaries": {
      shortDesc: "Packs oficiais de comentários áudio para Football Life.",
      fullDesc: "Página oficial dos comentários multilingues do Football Life. Os ficheiros são grandes e têm um procedimento de instalação específico, por isso o STRYKER encaminha para as instruções originais.",
      version: "v9", compatibility: ["Football Life"], size: "Depende do idioma", tags: ["oficial", "comentários", "áudio"],
    },
    "smokepatch-game-music": {
      shortDesc: "Pack de música alternativo publicado para Football Life.",
      fullDesc: "Este pack utiliza o seu próprio instalador. Por segurança, o STRYKER nunca executa automaticamente instaladores transferidos e encaminha para o procedimento do autor.",
      version: "Fonte oficial", compatibility: ["Football Life"], size: "Ver fonte", tags: ["oficial", "música", "manual"],
    },
    "holland-world-soccer": {
      shortDesc: "Mod de jogabilidade da comunidade publicado no EvoWeb.",
      fullDesc: "Ligação da comunidade para o tópico do autor. A compatibilidade exata depende da versão do jogo e das instruções do mod e deve ser verificada antes da instalação.",
      version: "Ver tópico", compatibility: ["PES 2021", "Football Life (verificar conforme a versão)"], size: "Ver fonte", tags: ["comunidade", "jogabilidade", "EvoWeb"],
    },
    "eferq-graphic-menu-epl-2526": {
      shortDesc: "Menu gráfico da Premier League 2025/26 para PES 2021 e Football Life 2026, instalável diretamente com o STRYKER.",
      fullDesc: "Pack completo com Menu EPL, UIColors, módulo Lua e dados content. O STRYKER verifica a impressão digital, instala as duas raízes LiveCPK, implementa o módulo Lua e guarda os dados Sider que forem substituídos.",
      version: "2025/26", compatibility: ["PES 2021", "Football Life 2026", "Sider 7.3.4"], size: "127,1 MB", tags: ["menu", "Premier League", "EPL", "UIColors", "EFER.Q"],
    },
  },
  es: {
    "smokepatch-fl26": {
      shortDesc: "Página oficial del juego independiente Football Life 2026 y sus actualizaciones.",
      fullDesc: "Fuente oficial de Football Life 2026. La instalación y las actualizaciones del juego siguen siendo manuales para respetar las instrucciones y los archivos distribuidos por SmokePatch.",
      version: "2.2", compatibility: ["Football Life 2026"], size: "Ver fuente", tags: ["oficial", "juego", "actualización"],
    },
    "smokepatch-real-faces-2627": {
      shortDesc: "Pack oficial de caras para Football Life 2026/2027.",
      fullDesc: "Pack de caras publicado por SmokePatch. La página del autor indica unos 37,4 GB instalados. La instalación CPK sigue siendo manual y debe respetar las instrucciones oficiales.",
      version: "Actualización 4", compatibility: ["Football Life 2026", "Football Life 2027"], size: "37,4 GB instalados", tags: ["oficial", "caras", "CPK"],
    },
    "smokepatch-sider-stadiums": {
      shortDesc: "Colección e instrucciones oficiales para estadios cargados mediante Sider.",
      fullDesc: "Recursos de estadios de Football Life con contenido y archivos de correspondencia que deben instalarse según las instrucciones de SmokePatch. STRYKER abre la fuente y permite importar por separado un ZIP compatible.",
      version: "Fuente oficial", compatibility: ["Football Life", "Sider 7"], size: "Depende del estadio", tags: ["oficial", "estadios", "Sider"],
    },
    "smokepatch-commentaries": {
      shortDesc: "Packs oficiales de comentarios de audio para Football Life.",
      fullDesc: "Página oficial de los comentarios multilingües de Football Life. Los archivos son grandes y su instalación es específica, por lo que STRYKER enlaza las instrucciones originales.",
      version: "v9", compatibility: ["Football Life"], size: "Depende del idioma", tags: ["oficial", "comentarios", "audio"],
    },
    "smokepatch-game-music": {
      shortDesc: "Pack de música alternativo publicado para Football Life.",
      fullDesc: "Este pack utiliza su propio instalador. Por seguridad, STRYKER nunca ejecuta automáticamente los instaladores descargados y enlaza el procedimiento del autor.",
      version: "Fuente oficial", compatibility: ["Football Life"], size: "Ver fuente", tags: ["oficial", "música", "manual"],
    },
    "holland-world-soccer": {
      shortDesc: "Mod de jugabilidad comunitario publicado en EvoWeb.",
      fullDesc: "Enlace comunitario al tema del autor. La compatibilidad exacta depende de la versión del juego y de las instrucciones del mod y debe comprobarse antes de instalar.",
      version: "Ver tema", compatibility: ["PES 2021", "Football Life (comprobar según la versión)"], size: "Ver fuente", tags: ["comunidad", "jugabilidad", "EvoWeb"],
    },
    "eferq-graphic-menu-epl-2526": {
      shortDesc: "Menú gráfico de la Premier League 2025/26 para PES 2021 y Football Life 2026, instalable directamente con STRYKER.",
      fullDesc: "Pack completo con Menu EPL, UIColors, módulo Lua y datos content. STRYKER comprueba su huella, instala las dos raíces LiveCPK, despliega el módulo Lua y guarda los datos de Sider que se sustituyan.",
      version: "2025/26", compatibility: ["PES 2021", "Football Life 2026", "Sider 7.3.4"], size: "127,1 MB", tags: ["menú", "Premier League", "EPL", "UIColors", "EFER.Q"],
    },
  },
};

export function localizeCatalogMod(mod: CatalogMod, language: CatalogLanguage): CatalogMod {
  if (language === "fr") return mod;
  const translation = CATALOG_TRANSLATIONS[language][mod.id];
  return translation ? { ...mod, ...translation } : mod;
}
