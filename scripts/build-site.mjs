import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const outputDirectory = path.join(projectRoot, "dist");
const viteEntry = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [viteEntry, "build"], {
    cwd: projectRoot,
    env: { ...process.env, STRYKER_SITES_BUILD: "1" },
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`La compilation du site a échoué (${code}).`)));
});

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

async function collectStaticFiles(directory, relativeDirectory = "") {
  const records = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!relativeDirectory && (entry.name === "server" || entry.name === ".openai")) continue;
    // Social metadata uses the canonical GitHub image; desktop-only assets do not
    // need to be embedded in the Sites worker.
    if (!relativeDirectory && ["og.png", "stryker-social-card.png", "stryker.ico"].includes(entry.name)) continue;
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      records.push(...await collectStaticFiles(absolutePath, relativePath));
      continue;
    }
    if (!entry.isFile()) continue;
    const buffer = await readFile(absolutePath);
    const extension = path.extname(entry.name).toLowerCase();
    const route = `/${relativePath.replaceAll("\\", "/")}`;
    records.push([route, [
      contentTypes.get(extension) ?? (extension ? "application/octet-stream" : "application/json; charset=utf-8"),
      buffer.toString("base64"),
    ]]);
  }
  return records;
}

const staticFiles = await collectStaticFiles(outputDirectory);
const serverDirectory = path.join(outputDirectory, "server");
await mkdir(serverDirectory, { recursive: true });

const workerSource = `const files = new Map(${JSON.stringify(staticFiles)});

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function assetFor(request) {
  const url = new URL(request.url);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  if (pathname.includes("\\0")) return null;
  let asset = files.get(pathname);
  if (!asset && pathname.endsWith("/")) asset = files.get(pathname + "index.html");
  if (!asset && (request.headers.get("accept") || "").includes("text/html")) asset = files.get("/index.html");
  return asset || null;
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const asset = assetFor(request);
    if (!asset) return new Response("Not Found", { status: 404 });
    const [contentType, encoded] = asset;
    const pathname = new URL(request.url).pathname;
    const immutable = pathname.startsWith("/assets/");
    const headers = {
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "Content-Type": contentType,
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    };
    return new Response(request.method === "HEAD" ? null : decodeBase64(encoded), { status: 200, headers });
  },
};
`;

await writeFile(path.join(serverDirectory, "index.js"), workerSource, "utf8");
