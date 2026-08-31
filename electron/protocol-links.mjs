export function parseProtocolLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "stryker:") return null;
    if (url.hostname === "open" && (url.pathname === "" || url.pathname === "/")) {
      return { type: "open" };
    }
    if (url.hostname !== "install") return null;
    const modId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const repository = url.searchParams.get("repository") || "";
    if (!modId || !repository) return null;
    return { type: "install", modId, repository };
  } catch {
    return null;
  }
}
