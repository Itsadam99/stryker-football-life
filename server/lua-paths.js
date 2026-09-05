import path from "node:path";

// Adapt only quoted paths into resources belonging to this package.
// The downloaded/staged Lua is left intact; adaptation applies to deployed copies.
export function adaptLuaPaths(source, mod, component, siderRoot) {
  const normalizedRoot = component.root.replace(/\\/g, "/");
  const moduleSuffix = normalizedRoot.match(/(?:^|\/)modules(?:\/(.*))?$/i)?.[1] || "";
  const mappings = [{
    from: "modules/" + (moduleSuffix ? moduleSuffix + "/" : ""),
    to: "modules/STRYKER/" + mod.id + "/",
  }];
  for (const resource of mod.components || []) {
    if (resource.type !== "livecpk") continue;
    const root = resource.root.replace(/\\/g, "/");
    const suffix = root.match(/(?:^|\/)livecpk\/(.+)$/i)?.[1];
    if (!suffix) continue;
    mappings.push({ from: "livecpk/" + suffix + "/", to: path.relative(siderRoot, path.resolve(mod.stagingPath, resource.root)).replace(/\\/g, "/") + "/" });
  }
  return source.replace(/(--\[\[[\s\S]*?\]\]|--[^\r\n]*)|("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')/g, (token, comment) => {
    if (comment) return token;
    const value = token.slice(1, -1).replace(/\\\\/g, "\\");
    const normalized = value.replace(/\\/g, "/").replace(/^(?:\.\/|\/)+/, "");
    for (const mapping of mappings) {
      const prefix = mapping.from.slice(0, -1);
      if (normalized.toLowerCase() !== prefix.toLowerCase() && !normalized.toLowerCase().startsWith(mapping.from.toLowerCase())) continue;
      const tail = normalized.slice(prefix.length);
      // Lua strings with interpolations/escape sequences are not filesystem paths.
      if (/[\r\n\0]/.test(tail) || tail.split("/").includes("..")) return token;
      const rewritten = (mapping.to.slice(0, -1) + tail).replace(/\//g, "\\");
      const leading = /^[.]*[\\/]/.test(value) ? "\\" : "";
      return '"' + (leading + rewritten).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }
    return token;
  });
}
