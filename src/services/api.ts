import {
  ActivityItem,
  BackupItem,
  ConflictReport,
  GameConfig,
  GameProcessStatus,
  HealthReport,
  HubSubmission,
  HubSubmissionInput,
  ManagedMod,
  ModItem,
  Profile,
  CatalogMod,
  UpdateStatus,
} from "../types";

const BASE_URL = "/api";
let sessionTokenPromise: Promise<string> | null = null;

async function getSessionToken() {
  if (!sessionTokenPromise) {
    sessionTokenPromise = fetch(`${BASE_URL}/session`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossible d’ouvrir une session locale STRYKER.");
        const data = await response.json();
        return data.token as string;
      });
  }
  return sessionTokenPromise;
}

async function request<T>(route: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-STRYKER-Token", await getSessionToken());

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${route}`, { ...options, method, headers });
  } catch {
    throw new Error("Le moteur local STRYKER est indisponible. Relancez l’application desktop.");
  }

  const text = await response.text();
  let data: any = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { throw new Error("Réponse invalide du moteur local STRYKER."); }
  }
  if (!response.ok) {
    if (response.status === 403) sessionTokenPromise = null;
    throw new Error(data.error || data.message || `Erreur STRYKER (${response.status})`);
  }
  return data as T;
}

export const api = {
  getConfig: () => request<GameConfig>("/config"),
  saveConfig: (config: Pick<GameConfig, "autoStartSider" | "launchMode">) =>
    request<{ success: boolean; config: GameConfig }>("/config", { method: "POST", body: JSON.stringify(config) }),
  detectInstallation: () => request<{ success: boolean; config: GameConfig }>("/detect", { method: "POST" }),
  linkGame: (gamePath: string) => request<{ success: boolean; message: string; config: GameConfig }>("/game/link", {
    method: "POST",
    body: JSON.stringify({ gamePath: gamePath.trim() }),
  }),
  unlinkGame: () => request<{ success: boolean; config: GameConfig }>("/game/unlink", { method: "POST" }),
  browseGameFolder: () => request<{ success: boolean; path?: string; cancelled?: boolean }>("/game/browse", { method: "POST" }),

  getManagedMods: async () => (await request<{ mods: ManagedMod[] }>("/mods")).mods,
  getSiderMods: () => request<{ mods: ModItem[]; totalLines: number; error?: string }>("/sider/mods"),
  toggleManagedMod: (modId: string, enabled: boolean) => request<{ success: boolean; mod: ManagedMod }>(`/mods/${encodeURIComponent(modId)}/toggle`, {
    method: "POST",
    body: JSON.stringify({ enabled }),
  }),
  toggleManualMod: (lineIndex: number, enabled: boolean) => request<{ success: boolean; updatedLine: string }>("/sider/manual-toggle", {
    method: "POST",
    body: JSON.stringify({ lineIndex, enabled }),
  }),
  reorderMods: (orderedIds: string[]) => request<{ success: boolean; mods: ManagedMod[] }>("/mods/reorder", {
    method: "POST",
    body: JSON.stringify({ orderedIds }),
  }),
  deployMods: () => request<{ success: boolean }>("/mods/deploy", { method: "POST" }),
  uninstallMod: (modId: string) => request<{ success: boolean; recoverablePaths: string[] }>(`/mods/${encodeURIComponent(modId)}`, { method: "DELETE" }),
  browseArchive: () => request<{ success: boolean; path?: string; cancelled?: boolean }>("/mods/browse-archive", { method: "POST" }),
  installArchive: (archivePath: string, metadata: Record<string, unknown> = {}) => request<{ success: boolean; mod: ManagedMod; action: "installed" | "reinstalled"; message: string }>("/mods/install-archive", {
    method: "POST",
    body: JSON.stringify({ archivePath, metadata }),
  }),
  installUploadedArchive: (file: File) => request<{ success: boolean; mod: ManagedMod; action: "installed" | "reinstalled"; message: string }>("/mods/install-upload", {
    method: "PUT",
    headers: {
      "Content-Type": "application/zip",
      "X-STRYKER-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  }),

  getCatalog: async () => (await request<{ mods: CatalogMod[] }>("/catalog")).mods,
  installCatalogMod: (modId: string) => request<{ success: boolean; mod: ManagedMod; action: "installed" | "reinstalled"; message: string }>(`/catalog/${encodeURIComponent(modId)}/install`, { method: "POST" }),
  installRemoteCatalogMod: (repositoryUrl: string, modId: string) => request<{ success: boolean; mod: ManagedMod; message: string }>("/catalog/install-remote", {
    method: "POST",
    body: JSON.stringify({ repositoryUrl, modId }),
  }),
  createSubmission: (metadata: HubSubmissionInput) => request<{ success: boolean; submission: HubSubmission }>("/hub/submissions", {
    method: "POST",
    body: JSON.stringify(metadata),
  }),
  uploadSubmissionArchive: (submissionId: string, file: File) => request<{ success: boolean; submission: HubSubmission; message: string }>(`/hub/submissions/${encodeURIComponent(submissionId)}/archive`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/zip",
      "X-STRYKER-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  }),
  getSubmissions: async () => (await request<{ submissions: HubSubmission[] }>("/hub/submissions", {
    headers: { "X-STRYKER-Token": await getSessionToken() },
  })).submissions,
  installSubmission: (submissionId: string) => request<{ success: boolean; mod: ManagedMod }>(`/hub/submissions/${encodeURIComponent(submissionId)}/install`, { method: "POST" }),
  publishSubmission: (submissionId: string) => request<{ success: boolean; mod: CatalogMod }>(`/hub/submissions/${encodeURIComponent(submissionId)}/publish`, { method: "POST" }),
  rejectSubmission: (submissionId: string, note: string) => request<{ success: boolean; submission: HubSubmission }>(`/hub/submissions/${encodeURIComponent(submissionId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  }),

  getProfiles: async () => (await request<{ profiles: Profile[] }>("/profiles")).profiles,
  createProfile: (name: string, description: string, cloneActive = true) => request<{ success: boolean; profile: Profile }>("/profiles", {
    method: "POST",
    body: JSON.stringify({ name, description, cloneActive }),
  }),
  activateProfile: (profileId: string) => request<{ success: boolean; profile: Profile }>(`/profiles/${encodeURIComponent(profileId)}/activate`, { method: "POST" }),
  deleteProfile: (profileId: string) => request<{ success: boolean }>(`/profiles/${encodeURIComponent(profileId)}`, { method: "DELETE" }),

  getConflicts: () => request<ConflictReport>("/conflicts"),
  getHealth: () => request<HealthReport>("/health"),
  getBackups: async () => (await request<{ backups: BackupItem[] }>("/backups")).backups,
  restoreBackup: (name: string) => request<{ success: boolean }>(`/backups/${encodeURIComponent(name)}/restore`, { method: "POST" }),
  getActivity: async () => (await request<{ activity: ActivityItem[] }>("/activity")).activity,

  getLauncherStatus: () => request<GameProcessStatus>("/launcher/status"),
  launchGame: () => request<{ success: boolean; message: string } & GameProcessStatus>("/launcher/launch", { method: "POST" }),
  stopGame: () => request<{ success: boolean; message: string }>("/launcher/stop", { method: "POST" }),
  getVersion: () => request<UpdateStatus>("/app/version"),
  checkForUpdate: () => request<UpdateStatus>("/app/update/check", { method: "POST" }),
  downloadUpdate: () => request<UpdateStatus>("/app/update/download", { method: "POST" }),
  installUpdate: () => request<{ success: boolean; message: string }>("/app/update/install", { method: "POST" }),
};
