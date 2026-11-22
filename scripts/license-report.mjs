// Production dependency license review. Fails on copyleft licenses in shipped code.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const tree = JSON.parse(execSync("npm ls --omit=dev --all --json", { encoding: "utf8" }));
const seen = new Map();
(function walk(deps) {
  for (const [name, d] of Object.entries(deps ?? {})) {
    if (seen.has(name) || d.extraneous) continue;
    const pj = `node_modules/${name}/package.json`;
    const lic = existsSync(pj) ? JSON.parse(readFileSync(pj, "utf8")).license ?? "UNKNOWN" : "UNKNOWN";
    seen.set(name, typeof lic === "string" ? lic : JSON.stringify(lic));
    walk(d.dependencies);
  }
})(tree.dependencies);
const counts = {};
for (const l of seen.values()) counts[l] = (counts[l] ?? 0) + 1;
console.log("Production dependency licenses:", counts);
const bad = [...seen].filter(([, l]) => /\b(A?GPL|LGPL|SSPL|UNKNOWN)\b/i.test(l));
for (const [n, l] of bad) console.log(`  review: ${n} — ${l}`);
process.exit(bad.length ? 1 : 0);
