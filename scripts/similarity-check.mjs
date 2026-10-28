import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const referenceRoot = getArg("--reference");
const targetRoot = resolve(getArg("--target", "."));
const WINDOW = 8;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED = new Set(["node_modules", "dist", ".git", ".next", "coverage", "build"]);

if (!referenceRoot) {
  console.error("Usage: node scripts/similarity-check.mjs --reference <reference-repo> [--target .]");
  process.exit(2);
}

function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...collect(full));
    else if (SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) files.push(full);
  }
  return files;
}

function grams(file) {
  const source = readFileSync(file, "utf8");
  const tokens = source.toLowerCase().match(/[a-z0-9_$]+/g) ?? [];
  const set = new Set();
  for (let index = 0; index + WINDOW <= tokens.length; index += 1) {
    set.add(tokens.slice(index, index + WINDOW).join(" "));
  }
  return set;
}

const referenceFiles = collect(resolve(referenceRoot));
const targetFiles = collect(targetRoot);
const referenceGrams = new Set();
const referenceHashes = new Set();

for (const file of referenceFiles) {
  for (const gram of grams(file)) referenceGrams.add(gram);
  referenceHashes.add(createHash("sha256").update(readFileSync(file)).digest("hex"));
}

const results = [];
let identical = 0;
for (const file of targetFiles) {
  const fileGrams = grams(file);
  if (fileGrams.size === 0) continue;
  if (referenceHashes.has(createHash("sha256").update(readFileSync(file)).digest("hex"))) identical += 1;
  let shared = 0;
  for (const gram of fileGrams) if (referenceGrams.has(gram)) shared += 1;
  results.push({
    file: relative(targetRoot, file).replaceAll("\\", "/"),
    overlap: shared / fileGrams.size,
    grams: fileGrams.size,
  });
}

results.sort((a, b) => b.overlap - a.overlap);
const mean = results.reduce((sum, item) => sum + item.overlap, 0) / Math.max(results.length, 1);

console.log(`reference source files: ${referenceFiles.length}`);
console.log(`target source files:    ${targetFiles.length}`);
console.log(`identical files:        ${identical}`);
console.log(`mean 8-gram overlap:    ${(mean * 100).toFixed(2)}%`);
console.log("top overlaps:");
for (const item of results.slice(0, 10)) {
  console.log(`  ${(item.overlap * 100).toFixed(1).padStart(5)}%  ${item.file}`);
}
