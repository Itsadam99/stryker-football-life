import type { Language } from "../i18n";

type SiteCopy = {
  heroKicker: string;
  dropsEyebrow: string;
  dropsTitle: string;
  dropsDescription: string;
  openDrop: string;
  manifestoEyebrow: string;
  manifestoTitle: string;
  manifestoBody: string;
  methodEyebrow: string;
  methodTitle: string;
  methodSteps: Array<{ number: string; title: string; body: string }>;
  appEyebrow: string;
  appTitle: string;
  appBody: string;
  appPoint1: string;
  appPoint2: string;
  appPoint3: string;
  faqEyebrow: string;
  faqTitle: string;
  faqs: Array<{ question: string; answer: string }>;
  detailBack: string;
  detailRelease: string;
  detailAbout: string;
  detailIncludes: string;
  detailInstallTitle: string;
  detailInstallAutomatic: string;
  detailInstallManual: string;
  detailPending: string;
  detailPendingBody: string;
  detailVerifiedPackage: string;
  detailVerifiedSource: string;
  detailCommunity: string;
  detailOpenSource: string;
};

export const SITE_COPY: Record<Language, SiteCopy> = {
  fr: {
    heroKicker: "Football Life Mod Culture",
    dropsEyebrow: "Drops sélectionnés / 01—03",
    dropsTitle: "Les mods ne sont plus des dossiers. Ce sont des drops.",
    dropsDescription: "Chaque fiche montre ce que le mod change, d’où il vient et comment STRYKER l’installe. Aucun compteur inventé, aucune source cachée.",
    openDrop: "Voir le drop",
    manifestoEyebrow: "Notre manifeste",
    manifestoTitle: "Moins de fichiers perdus. Plus de jeu.",
    manifestoBody: "STRYKER garde l’application légère : le catalogue vit en ligne, les archives sont téléchargées seulement quand tu les choisis, puis vérifiées avant installation.",
    methodEyebrow: "Une mécanique simple",
    methodTitle: "Du site au terrain en trois mouvements.",
    methodSteps: [
      { number: "01", title: "Choisis ton mod", body: "Lis la fiche, la compatibilité, les crédits et le statut de vérification." },
      { number: "02", title: "Ouvre STRYKER", body: "Le lien du site transmet le mod à l’application. Si elle manque, le site propose son installateur." },
      { number: "03", title: "Installe et joue", body: "STRYKER télécharge, contrôle l’empreinte, déploie le mod et conserve un retour arrière." },
    ],
    appEyebrow: "STRYKER Desktop / Windows",
    appTitle: "Ta collection. Tes priorités. Ton Football Life.",
    appBody: "Installe les mods du Hub, importe n’importe quel ZIP compatible, active ou désactive sans supprimer et lance le jeu avec son démarreur officiel.",
    appPoint1: "Mises à jour automatiques",
    appPoint2: "Profils et conflits Sider",
    appPoint3: "Sauvegardes récupérables",
    faqEyebrow: "Questions fréquentes",
    faqTitle: "Avant de rejoindre le Hub.",
    faqs: [
      { question: "Les mods alourdissent-ils STRYKER ?", answer: "Non. L’application contient seulement son moteur et quelques petits modules STRYKER. Les gros mods restent dans un stockage séparé et ne sont téléchargés qu’à la demande." },
      { question: "Puis-je installer un mod absent du site ?", answer: "Oui. Glisse un ZIP compatible dans STRYKER. L’application vérifie sa structure et refuse les exécutables ou les chemins dangereux." },
      { question: "Que se passe-t-il si STRYKER n’est pas installé ?", answer: "Le site détecte que l’ouverture n’a pas fonctionné et affiche le téléchargement de la dernière version. Après installation, un nouveau clic reprend le mod choisi." },
      { question: "Les mods sont-ils officiels ?", answer: "STRYKER est indépendant. Chaque fiche distingue les paquets hébergés, les sources vérifiées et les liens communautaires, avec les crédits disponibles." },
    ],
    detailBack: "Retour aux drops",
    detailRelease: "Fiche du drop",
    detailAbout: "À propos",
    detailIncludes: "Ce que tu installes",
    detailInstallTitle: "Prêt pour STRYKER",
    detailInstallAutomatic: "Le paquet est contrôlé et peut être transmis directement à l’application.",
    detailInstallManual: "Ce mod reste distribué par sa source. STRYKER ouvre la procédure sans héberger le fichier.",
    detailPending: "Drop en préparation",
    detailPendingBody: "La fiche et le paquet propre sont prêts. La mise en ligne attend encore la validation des droits de redistribution et du stockage public.",
    detailVerifiedPackage: "Paquet et empreinte vérifiés",
    detailVerifiedSource: "Source originale vérifiée",
    detailCommunity: "Source communautaire",
    detailOpenSource: "Ouvrir la source",
  },
  en: {
    heroKicker: "Football Life Mod Culture",
    dropsEyebrow: "Selected drops / 01—03",
    dropsTitle: "Mods are no longer folders. They are drops.",
    dropsDescription: "Every page explains what changes, where the mod comes from and how STRYKER installs it. No invented counters, no hidden sources.",
    openDrop: "View drop",
    manifestoEyebrow: "Our manifesto",
    manifestoTitle: "Fewer lost files. More football.",
    manifestoBody: "STRYKER stays light: the catalog lives online, archives are downloaded only when you choose them, then verified before installation.",
    methodEyebrow: "A simple mechanism",
    methodTitle: "From the site to the pitch in three moves.",
    methodSteps: [
      { number: "01", title: "Choose your mod", body: "Read its page, compatibility, credits and verification status." },
      { number: "02", title: "Open STRYKER", body: "The site link sends the mod to the app. If it is missing, the site offers the installer." },
      { number: "03", title: "Install and play", body: "STRYKER downloads, verifies the checksum, deploys the mod and keeps a rollback." },
    ],
    appEyebrow: "STRYKER Desktop / Windows",
    appTitle: "Your collection. Your priorities. Your Football Life.",
    appBody: "Install Hub mods, import any compatible ZIP, enable or disable without deleting, and launch the game with its official starter.",
    appPoint1: "Automatic updates",
    appPoint2: "Profiles and Sider conflicts",
    appPoint3: "Recoverable backups",
    faqEyebrow: "Frequently asked questions",
    faqTitle: "Before joining the Hub.",
    faqs: [
      { question: "Do mods make STRYKER heavy?", answer: "No. The app only contains its engine and a few small STRYKER modules. Large mods stay in separate storage and download only on demand." },
      { question: "Can I install a mod that is not on the site?", answer: "Yes. Drop a compatible ZIP into STRYKER. The app checks its structure and rejects executables or unsafe paths." },
      { question: "What if STRYKER is not installed?", answer: "The site detects that opening failed and shows the latest installer. After installation, clicking again resumes the selected mod." },
      { question: "Are the mods official?", answer: "STRYKER is independent. Every page distinguishes hosted packages, verified sources and community links, with available credits." },
    ],
    detailBack: "Back to drops",
    detailRelease: "Drop page",
    detailAbout: "About",
    detailIncludes: "What you install",
    detailInstallTitle: "Ready for STRYKER",
    detailInstallAutomatic: "The package is checked and can be sent directly to the app.",
    detailInstallManual: "This mod remains distributed by its source. STRYKER opens the procedure without hosting the file.",
    detailPending: "Drop in preparation",
    detailPendingBody: "The page and clean package are ready. Publishing still awaits redistribution-rights and public-storage approval.",
    detailVerifiedPackage: "Package and checksum verified",
    detailVerifiedSource: "Original source verified",
    detailCommunity: "Community source",
    detailOpenSource: "Open source",
  },
  pt: {
    heroKicker: "Cultura de Mods Football Life",
    dropsEyebrow: "Drops selecionados / 01—03",
    dropsTitle: "Os mods deixaram de ser pastas. São drops.",
    dropsDescription: "Cada página explica o que muda, de onde vem o mod e como o STRYKER o instala. Sem contadores inventados nem fontes escondidas.",
    openDrop: "Ver drop",
    manifestoEyebrow: "O nosso manifesto",
    manifestoTitle: "Menos ficheiros perdidos. Mais futebol.",
    manifestoBody: "O STRYKER mantém-se leve: o catálogo vive online, os arquivos só são transferidos quando os escolhes e são verificados antes da instalação.",
    methodEyebrow: "Um mecanismo simples",
    methodTitle: "Do site ao relvado em três movimentos.",
    methodSteps: [
      { number: "01", title: "Escolhe o mod", body: "Consulta a página, compatibilidade, créditos e estado de verificação." },
      { number: "02", title: "Abre o STRYKER", body: "A ligação do site envia o mod para a app. Se faltar, o site apresenta o instalador." },
      { number: "03", title: "Instala e joga", body: "O STRYKER transfere, verifica a assinatura, implementa o mod e guarda uma reversão." },
    ],
    appEyebrow: "STRYKER Desktop / Windows",
    appTitle: "A tua coleção. As tuas prioridades. O teu Football Life.",
    appBody: "Instala mods do Hub, importa qualquer ZIP compatível, ativa ou desativa sem apagar e inicia o jogo com o lançador oficial.",
    appPoint1: "Atualizações automáticas",
    appPoint2: "Perfis e conflitos Sider",
    appPoint3: "Cópias recuperáveis",
    faqEyebrow: "Perguntas frequentes",
    faqTitle: "Antes de entrares no Hub.",
    faqs: [
      { question: "Os mods tornam o STRYKER pesado?", answer: "Não. A app só contém o motor e pequenos módulos STRYKER. Os mods grandes ficam num armazenamento separado e só são transferidos quando pedidos." },
      { question: "Posso instalar um mod ausente do site?", answer: "Sim. Arrasta um ZIP compatível para o STRYKER. A app verifica a estrutura e recusa executáveis ou caminhos perigosos." },
      { question: "E se o STRYKER não estiver instalado?", answer: "O site deteta a falha de abertura e mostra o instalador mais recente. Depois, um novo clique retoma o mod escolhido." },
      { question: "Os mods são oficiais?", answer: "O STRYKER é independente. Cada página distingue pacotes alojados, fontes verificadas e ligações comunitárias, com os créditos disponíveis." },
    ],
    detailBack: "Voltar aos drops",
    detailRelease: "Página do drop",
    detailAbout: "Sobre",
    detailIncludes: "O que instalas",
    detailInstallTitle: "Pronto para o STRYKER",
    detailInstallAutomatic: "O pacote foi verificado e pode ser enviado diretamente para a app.",
    detailInstallManual: "Este mod continua distribuído pela fonte. O STRYKER abre o procedimento sem alojar o ficheiro.",
    detailPending: "Drop em preparação",
    detailPendingBody: "A página e o pacote limpo estão prontos. A publicação ainda aguarda a validação dos direitos de redistribuição e do armazenamento público.",
    detailVerifiedPackage: "Pacote e assinatura verificados",
    detailVerifiedSource: "Fonte original verificada",
    detailCommunity: "Fonte comunitária",
    detailOpenSource: "Abrir fonte",
  },
  es: {
    heroKicker: "Cultura de Mods Football Life",
    dropsEyebrow: "Drops seleccionados / 01—03",
    dropsTitle: "Los mods ya no son carpetas. Son drops.",
    dropsDescription: "Cada ficha explica qué cambia, de dónde viene el mod y cómo lo instala STRYKER. Sin contadores inventados ni fuentes ocultas.",
    openDrop: "Ver drop",
    manifestoEyebrow: "Nuestro manifiesto",
    manifestoTitle: "Menos archivos perdidos. Más fútbol.",
    manifestoBody: "STRYKER se mantiene ligero: el catálogo vive online, los archivos solo se descargan cuando los eliges y se verifican antes de instalarlos.",
    methodEyebrow: "Un mecanismo simple",
    methodTitle: "De la web al campo en tres movimientos.",
    methodSteps: [
      { number: "01", title: "Elige tu mod", body: "Lee su ficha, compatibilidad, créditos y estado de verificación." },
      { number: "02", title: "Abre STRYKER", body: "El enlace de la web envía el mod a la app. Si falta, la web ofrece el instalador." },
      { number: "03", title: "Instala y juega", body: "STRYKER descarga, comprueba la huella, despliega el mod y conserva una restauración." },
    ],
    appEyebrow: "STRYKER Desktop / Windows",
    appTitle: "Tu colección. Tus prioridades. Tu Football Life.",
    appBody: "Instala mods del Hub, importa cualquier ZIP compatible, activa o desactiva sin borrar e inicia el juego con su lanzador oficial.",
    appPoint1: "Actualizaciones automáticas",
    appPoint2: "Perfiles y conflictos Sider",
    appPoint3: "Copias recuperables",
    faqEyebrow: "Preguntas frecuentes",
    faqTitle: "Antes de entrar en el Hub.",
    faqs: [
      { question: "¿Los mods hacen pesada la aplicación?", answer: "No. La app solo contiene su motor y pequeños módulos STRYKER. Los mods grandes permanecen en un almacenamiento separado y solo se descargan bajo demanda." },
      { question: "¿Puedo instalar un mod ausente de la web?", answer: "Sí. Arrastra un ZIP compatible a STRYKER. La app comprueba su estructura y rechaza ejecutables o rutas peligrosas." },
      { question: "¿Qué ocurre si STRYKER no está instalado?", answer: "La web detecta que no se abrió y muestra el instalador más reciente. Después, otro clic retoma el mod elegido." },
      { question: "¿Los mods son oficiales?", answer: "STRYKER es independiente. Cada ficha distingue paquetes alojados, fuentes verificadas y enlaces comunitarios, con los créditos disponibles." },
    ],
    detailBack: "Volver a los drops",
    detailRelease: "Ficha del drop",
    detailAbout: "Acerca de",
    detailIncludes: "Lo que instalas",
    detailInstallTitle: "Listo para STRYKER",
    detailInstallAutomatic: "El paquete está verificado y puede enviarse directamente a la app.",
    detailInstallManual: "Este mod sigue distribuido por su fuente. STRYKER abre el procedimiento sin alojar el archivo.",
    detailPending: "Drop en preparación",
    detailPendingBody: "La ficha y el paquete limpio están listos. La publicación aún espera la validación de los derechos de redistribución y del almacenamiento público.",
    detailVerifiedPackage: "Paquete y huella verificados",
    detailVerifiedSource: "Fuente original verificada",
    detailCommunity: "Fuente comunitaria",
    detailOpenSource: "Abrir fuente",
  },
};
