import path from "node:path";
import { createPackedPayload } from "../server/packed-payload.js";

const [sourceRoot, outputPath, ...includeRoots] = process.argv.slice(2);
if (!sourceRoot || !outputPath) {
  console.error("Usage: node scripts/create-packed-payload.mjs <source-directory> <output.br> [included-root ...]");
  process.exit(1);
}

const result = await createPackedPayload(path.resolve(sourceRoot), path.resolve(outputPath), {
  includeRoots: includeRoots.length ? includeRoots : ["."],
});
console.log(JSON.stringify(result));
