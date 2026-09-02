import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../server/index.js";

const archives = process.argv.slice(2).map((archive) => path.resolve(archive));
if (archives.length === 0) {
  console.error("Usage: node scripts/validate-mod-packages.mjs <package.zip> [...]");
  process.exit(1);
}
for (const archive of archives) {
  if (!fs.existsSync(archive) || path.extname(archive).toLowerCase() !== ".zip") {
    throw new Error(`Paquet ZIP introuvable : ${archive}`);
  }
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "stryker-package-validation-"));
const previousUserProfile = process.env.USERPROFILE;
const previousOneDrive = process.env.OneDrive;
process.env.USERPROFILE = path.join(temporary, "profile");
process.env.OneDrive = "";

let service = null;
try {
  service = await startServer({ port: 0, rootDir: temporary, dataRoot: path.join(temporary, "data") });
  const runtime = service.runtime;
  const results = [];
  for (const archive of archives) {
    const installed = await runtime.modEngine.installArchive(archive);
    results.push({
      archive: path.basename(archive),
      id: installed.packageId,
      files: installed.components.reduce((sum, component) => sum + (component.files?.length || 0), 0),
      components: installed.components.map((component) => component.type),
    });
  }
  const optionFile = runtime.modEngine.list().find((mod) => mod.components.some((component) => component.type === "save"));
  if (optionFile) runtime.modEngine.toggle(optionFile.id, false);
  console.log(JSON.stringify({ valid: true, packages: results }, null, 2));
} finally {
  if (service) await service.close();
  if (previousUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = previousUserProfile;
  if (previousOneDrive === undefined) delete process.env.OneDrive;
  else process.env.OneDrive = previousOneDrive;
  fs.rmSync(temporary, { recursive: true, force: true });
}
