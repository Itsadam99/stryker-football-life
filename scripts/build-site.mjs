import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
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

const serverDirectory = path.join(projectRoot, "dist", "server");
await mkdir(serverDirectory, { recursive: true });
await writeFile(path.join(serverDirectory, "index.js"), `export default {
  async fetch(request, env) {
    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response("Static asset binding unavailable", { status: 500 });
    }
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return response;
    const acceptsHtml = (request.headers.get("accept") || "").includes("text/html");
    if (!acceptsHtml) return response;
    const indexUrl = new URL("/index.html", request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
`, "utf8");

