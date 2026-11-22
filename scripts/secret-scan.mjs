// Lightweight secret scanner over tracked files. Fails on likely credentials.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter((f) => f && !/\.(png|jpg|jpeg|woff2?|svg|ico)$/.test(f) && !f.startsWith("package-lock"));
const rules = [
  ["Cloudflare API token", /\b[A-Za-z0-9_-]{40}\b(?=.*(cf|cloudflare|api[_-]?token))/i],
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Private key", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Generic secret assignment", /\b(api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9/+_-]{24,}["']/i],
  ["OpenAI/Anthropic key", /\b(sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9-]{20,})\b/],
];
let hits = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const [name, re] of rules) if (re.test(line)) { hits++; console.log(`${f}:${i + 1}  ${name}`); }
  });
}
console.log(hits ? `\n${hits} potential secret(s) found` : `secret scan: ${files.length} tracked files, no secrets found`);
process.exit(hits ? 1 : 0);
