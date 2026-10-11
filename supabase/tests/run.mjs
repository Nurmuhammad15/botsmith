// Runs every *.test.mjs in this folder in its own process and reports the combined result.
//   npm install --no-save @electric-sql/pglite && node supabase/tests/run.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = fs
  .readdirSync(here)
  .filter((f) => f.endsWith(".test.mjs") && (!only || f.includes(only)))
  .sort();

let failed = 0;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  const result = spawnSync(process.execPath, [path.join(here, file)], { stdio: "inherit" });
  if (result.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) failed` : "\nAll SQL tests passed");
process.exit(failed ? 1 : 0);
