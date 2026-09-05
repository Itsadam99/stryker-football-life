import type { CatalogMod, ManagedMod } from "../types";

export function installableCatalog(local: CatalogMod[], remote: CatalogMod[]): CatalogMod[] {
  const result = new Map<string, CatalogMod>();
  for (const mod of remote) {
    if (mod.status === "published" && mod.installationType === "automatic" && mod.archiveHash && mod.repositoryUrl) {
      result.set(mod.id, mod);
    }
  }
  // A locally available archive takes precedence over a remote copy or stale preview.
  for (const mod of local) {
    if (mod.status === "published" && mod.installationType === "automatic" && mod.archiveHash) result.set(mod.id, mod);
  }
  return [...result.values()];
}

export function installedCatalogMod(mod: CatalogMod, installed: ManagedMod[]) {
  return installed.find((item) => item.packageId === mod.id || item.id === mod.id
    || Boolean(mod.archiveHash && item.archiveHash === mod.archiveHash));
}

export function searchCatalog(mods: CatalogMod[], search: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const words = normalize(search).trim().split(/\s+/).filter(Boolean);
  return mods.filter((mod) => {
    const text = normalize([mod.title, mod.author, mod.category, mod.shortDesc, ...mod.tags].join(" "));
    return words.every((word) => text.includes(word));
  });
}

export function catalogInstallPlan(target: CatalogMod, catalog: CatalogMod[], installed: ManagedMod[]) {
  const plan: CatalogMod[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(mod: CatalogMod) {
    if (visited.has(mod.id)) return;
    if (visiting.has(mod.id)) throw new Error("Dépendances circulaires : " + mod.title);
    visiting.add(mod.id);
    for (const dependency of mod.dependencies || []) {
      if (installed.some((item) => item.packageId === dependency.id && item.enabled)) continue;
      const required = catalog.find((item) => item.id === dependency.id);
      if (!required) throw new Error("Mod requis absent du catalogue : " + dependency.id);
      visit(required);
    }
    visiting.delete(mod.id);
    visited.add(mod.id);
    plan.push(mod);
  }
  visit(target);
  return plan;
}
