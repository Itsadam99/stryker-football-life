import crypto from "crypto";
import fs from "fs";
import path from "path";

function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf-8");
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(error.code)) throw error;
    fs.copyFileSync(tempPath, filePath);
    fs.unlinkSync(tempPath);
  }
}

function createDefaultProfile() {
  const now = new Date().toISOString();
  return {
    id: "default",
    name: "Profil principal",
    description: "Configuration stable par défaut",
    createdAt: now,
    updatedAt: now,
    modOrder: [],
    enabledMods: [],
  };
}

export function createDefaultState({ mockDir, dataDirectories }) {
  const profile = createDefaultProfile();
  return {
    schemaVersion: 1,
    settings: {
      gamePath: mockDir,
      siderPath: path.join(mockDir, "sider.ini"),
      siderExecutablePath: "",
      gameExecutablePath: "",
      detectedVersion: "Environnement de démonstration sécurisé",
      autoStartSider: true,
      launchMode: "game",
      isDemoMode: true,
      isLinked: false,
      stagingPath: dataDirectories.mods,
    },
    activeProfileId: profile.id,
    profiles: [profile],
    mods: {},
    deployment: {
      lastDeployedAt: null,
      lastSiderHash: null,
      profileId: profile.id,
    },
    activity: [],
  };
}

function normalizeState(state, defaults) {
  const normalized = {
    ...defaults,
    ...state,
    settings: { ...defaults.settings, ...(state.settings || {}) },
    deployment: { ...defaults.deployment, ...(state.deployment || {}) },
    profiles: Array.isArray(state.profiles) && state.profiles.length > 0
      ? state.profiles
      : defaults.profiles,
    mods: state.mods && typeof state.mods === "object" ? state.mods : {},
    activity: Array.isArray(state.activity) ? state.activity.slice(0, 250) : [],
  };

  if (!normalized.profiles.some((profile) => profile.id === normalized.activeProfileId)) {
    normalized.activeProfileId = normalized.profiles[0].id;
  }

  return normalized;
}

export class StateStore {
  constructor({ dataRoot, mockDir, dataDirectories, legacyConfigPath }) {
    this.filePath = path.join(dataRoot, "state.json");
    this.defaults = createDefaultState({ mockDir, dataDirectories });
    this.state = this.load(legacyConfigPath);
  }

  load(legacyConfigPath) {
    let loaded = null;
    if (fs.existsSync(this.filePath)) {
      try {
        loaded = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      } catch (error) {
        const recoveryPath = `${this.filePath}.corrupt-${Date.now()}`;
        fs.copyFileSync(this.filePath, recoveryPath);
      }
    }

    const state = normalizeState(loaded || {}, this.defaults);

    if (!loaded && legacyConfigPath && fs.existsSync(legacyConfigPath)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(legacyConfigPath, "utf-8"));
        const legacyExecutable = legacy.gamePath && legacy.exeName ? path.join(legacy.gamePath, legacy.exeName) : "";
        const isUsableRealLink = legacy.isLinked === true
          && legacy.isDemoMode !== true
          && fs.existsSync(legacy.siderPath || "")
          && fs.existsSync(legacyExecutable);
        if (isUsableRealLink) {
          state.settings = {
            ...state.settings,
            gamePath: legacy.gamePath,
            siderPath: legacy.siderPath,
            gameExecutablePath: legacyExecutable,
            detectedVersion: legacy.detectedVersion || "Installation migrée",
            autoStartSider: legacy.autoStartSider !== false,
            isDemoMode: false,
            isLinked: true,
          };
        }
      } catch {
        // The legacy file remains untouched and can be recovered manually.
      }
    }

    atomicWriteJson(this.filePath, state);
    return state;
  }

  snapshot() {
    return structuredClone(this.state);
  }

  save() {
    atomicWriteJson(this.filePath, this.state);
  }

  update(mutator) {
    const draft = structuredClone(this.state);
    const result = mutator(draft);
    this.state = normalizeState(draft, this.defaults);
    this.save();
    return result;
  }

  replace(nextState) {
    this.state = normalizeState(structuredClone(nextState), this.defaults);
    this.save();
  }

  addActivity(type, message, details = {}) {
    this.update((draft) => {
      draft.activity.unshift({
        id: crypto.randomUUID(),
        type,
        message,
        details,
        createdAt: new Date().toISOString(),
      });
      draft.activity = draft.activity.slice(0, 250);
    });
  }
}

export { atomicWriteJson };
