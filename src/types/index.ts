export type ModCategory = "gameplay" | "turf" | "menu" | "audio" | "kit" | "face" | "scoreboard" | "other";

export interface ModItem {
  id: string;
  name: string;
  folderName: string;
  category: ModCategory;
  enabled: boolean;
  siderLine: string;
  type: "livecpk" | "lua";
  priority: number;
  lineIndex: number;
  managed: boolean;
}

export interface ManagedComponent {
  type: "livecpk" | "lua" | "sider";
  root: string;
  target?: "content";
  files?: string[];
  entrypoints?: string[];
}

export interface ManagedMod {
  id: string;
  packageId?: string;
  name: string;
  version: string;
  author: string;
  category: ModCategory;
  compatibility: string[];
  dependencies: Array<{ id: string; version?: string }>;
  sourceUrl: string;
  sourceType: string;
  archiveName: string;
  archiveHash: string;
  installedAt: string;
  lastInstalledAt?: string;
  installCount?: number;
  stagingPath: string;
  components: ManagedComponent[];
  managed: true;
  enabled: boolean;
  priority: number;
}

export interface Profile {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  modOrder: string[];
  enabledMods: string[];
  active: boolean;
  enabledCount: number;
  modCount: number;
}

export interface ConflictItem {
  file: string;
  winnerModId: string;
  loserModIds: string[];
  modIds: string[];
}

export interface ConflictReport {
  total: number;
  truncated: boolean;
  conflicts: ConflictItem[];
  dependencyIssues: Array<{ modId: string; dependency: { id: string; version?: string }; reason: "missing" | "disabled" }>;
}

export interface HealthCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  warning?: boolean;
}

export interface HealthReport {
  healthy: boolean;
  checks: HealthCheck[];
  deployment: { lastDeployedAt: string | null; lastSiderHash: string | null; profileId: string };
  currentSiderHash: string | null;
}

export interface BackupItem {
  name: string;
  size: number;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  type: string;
  message: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CatalogMod {
  id: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  author: string;
  version: string;
  category: ModCategory;
  compatibility: string[];
  downloadUrl: string;
  size: string;
  rating: number;
  downloadsCount: number;
  thumbnail: string;
  screenshots: string[];
  legalStatus: "verified_source" | "verified_package" | "author_submission" | "community_external" | "unverified";
  verificationDate?: string;
  installationType?: "livecpk" | "lua" | "mixed" | "automatic" | "manual";
  tags: string[];
  archiveHash?: string;
  archiveSize?: number;
  fileCount?: number;
  status?: "awaiting_archive" | "pending_review" | "published" | "rejected";
  submittedAt?: string;
  publishedAt?: string | null;
  license?: string;
  sourceUrl?: string;
}

export interface HubSubmission extends CatalogMod {
  status: "awaiting_archive" | "pending_review" | "published" | "rejected";
  submittedAt: string;
  submitterEmail?: string;
  reviewNote?: string;
}

export interface HubSubmissionInput {
  title: string;
  author: string;
  version: string;
  shortDesc: string;
  fullDesc?: string;
  category: ModCategory;
  compatibility: string[];
  tags: string[];
  thumbnail?: string;
  sourceUrl?: string;
  license?: string;
  submitterEmail?: string;
  distributionPermission: boolean;
}

export interface GameConfig {
  gamePath: string;
  siderPath: string;
  siderExecutablePath: string;
  gameExecutablePath: string;
  exeName: string;
  detectedVersion: string;
  autoStartSider: boolean;
  launchMode: "game" | "sider";
  isDemoMode: boolean;
  isLinked: boolean;
  stagingPath: string;
}

export interface GameProcessStatus {
  isRunning: boolean;
  pid: number | null;
  startTime: number | null;
  playDurationSeconds: number;
  executable?: string | null;
  isDemo?: boolean;
}

export interface UpdateStatus {
  currentVersion: string;
  availableVersion: string | null;
  state: "disabled" | "idle" | "checking" | "available" | "downloading" | "ready" | "upToDate" | "error";
  progress: number;
  updateAvailable: boolean;
  updaterConfigured: boolean;
  message: string;
}
