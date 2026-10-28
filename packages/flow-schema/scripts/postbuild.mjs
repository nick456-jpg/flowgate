import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("dist/esm", { recursive: true });
writeFileSync("dist/esm/package.json", JSON.stringify({ type: "module" }, null, 2));
mkdirSync("dist/cjs", { recursive: true });
writeFileSync("dist/cjs/package.json", JSON.stringify({ type: "commonjs" }, null, 2));
