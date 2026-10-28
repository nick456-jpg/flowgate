import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, "../assets/architecture.svg");
const W = 2400;
const H = 1500;
const FONT = "Inter, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";
const MONO = "ui-monospace, 'Cascadia Code', Consolas, monospace";

const C = {
  bg: "#0a0d12",
  grid: "#141a24",
  panel: "#10151d",
  panelHi: "#141b24",
  line: "#222a36",
  lineSoft: "#1a212c",
  text: "#e8ebf0",
  muted: "#9aa3b2",
  dim: "#6f7888",
  amber: "#f59e0b",
  teal: "#14b8a6",
  blue: "#60a5fa",
  pink: "#f472b6",
  lime: "#a3e635",
  emerald: "#34d399",
  slate: "#94a3b8",
};

const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function text(x, y, value, options = {}) {
  const {
    size = 14,
    weight = 400,
    fill = C.text,
    anchor = "start",
    family = FONT,
    letter = 0,
    opacity = 1,
  } = options;
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${letter}" opacity="${opacity}">${esc(value)}</text>`;
}

function box(x, y, w, h, title, lines, accent, options = {}) {
  const { highlight = false, note = null } = options;
  const fill = highlight ? C.panelHi : C.panel;
  let out = `<g>`;
  out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${highlight ? accent : C.line}" stroke-width="${highlight ? 1.5 : 1}"/>`;
  out += `<rect x="${x}" y="${y}" width="3" height="${h}" rx="1.5" fill="${accent}"/>`;
  out += text(x + 18, y + 30, title, { size: 18, weight: 600 });
  if (note) out += text(x + w - 18, y + 30, note, { size: 11, fill: C.dim, anchor: "end" });
  lines.forEach((line, index) => {
    out += text(x + 18, y + 56 + index * 20, line, { size: 13, fill: C.muted });
  });
  out += `</g>`;
  return out;
}

function section(y, number, title) {
  return `<g>${text(72, y, number, { size: 12, weight: 600, fill: C.amber, letter: 1.6 })}${text(112, y, title, { size: 12, weight: 600, fill: C.dim, letter: 1.6 })}<line x1="330" y1="${y - 4}" x2="1778" y2="${y - 4}" stroke="${C.lineSoft}" stroke-width="1"/></g>`;
}

function sectionRight(y, number, title) {
  return `<g>${text(1820, y, number, { size: 12, weight: 600, fill: C.amber, letter: 1.6 })}${text(1860, y, title, { size: 12, weight: 600, fill: C.dim, letter: 1.6 })}<line x1="2070" y1="${y - 4}" x2="2328" y2="${y - 4}" stroke="${C.lineSoft}" stroke-width="1"/></g>`;
}

function arrow(x1, y1, x2, y2, options = {}) {
  const { dashed = false, color = C.dim, marker = "arrow-dim", label = null, labelFill = C.dim } = options;
  let out = `<path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="1.4" ${dashed ? 'stroke-dasharray="6 6"' : ""} marker-end="url(#${marker})"/>`;
  if (label) {
    out += text((x1 + x2) / 2, (y1 + y2) / 2 - 8, label, {
      size: 11,
      fill: labelFill,
      anchor: "middle",
    });
  }
  return out;
}

function polyArrow(points, options = {}) {
  const { dashed = false, color = C.dim, marker = "arrow-dim", label = null } = options;
  const d = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`).join(" ");
  let out = `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" ${dashed ? 'stroke-dasharray="6 6"' : ""} marker-end="url(#${marker})"/>`;
  if (label) {
    const mid = points[Math.floor(points.length / 2)];
    out += text(mid[0] + 8, mid[1] - 8, label, { size: 11, fill: C.dim });
  }
  return out;
}

const header = `
<g>
  ${text(118, 82, "FlowGate", { size: 44, weight: 700, letter: -1 })}
  ${text(74, 118, "SYSTEM ARCHITECTURE / 可回放的 AI 管道编排台", { size: 17, fill: C.muted, letter: 0.4 })}
  ${text(2328, 80, "v1 · CORE ORCHESTRATION", { size: 12, fill: C.amber, anchor: "end", letter: 1.4 })}
  ${text(2328, 108, "NestJS 10 · PostgreSQL 16 · Redis 7", { size: 13, fill: C.muted, anchor: "end" })}
  ${text(2328, 130, "BullMQ 5 · event-sourced runs", { size: 13, fill: C.dim, anchor: "end" })}
  <line x1="72" y1="150" x2="2328" y2="150" stroke="${C.line}" stroke-width="1"/>
  <g transform="translate(72 38)">
    <rect width="34" height="34" rx="9" fill="#12161d" stroke="${C.amber}" stroke-width="1.4"/>
    <path d="M8 25V9l9 8 9-8v16" fill="none" stroke="${C.amber}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</g>`;

const clients = `
${section(190, "01", "CLIENTS 客户端")}
${box(72, 214, 520, 72, "Browser SPA", ["Editor · Run Dock · Replay · event tape"], C.blue, { note: "same-origin /v1" })}
${box(612, 214, 520, 72, "Authenticated clients", ["REST + SSE · JWT session · no API keys in v1"], C.blue, { note: "browser + scripts" })}
${arrow(332, 286, 332, 372, { color: C.blue, marker: "arrow-blue" })}
${arrow(872, 286, 872, 372, { color: C.blue, marker: "arrow-blue" })}
`;

const web = `
${section(348, "02", "WEB 前端")}
${box(72, 372, 1060, 112, "React 18 + Vite 6", [
  "React Flow 12 · Zustand 5 · TanStack Query 5 · Ant Design 5",
  "packages/flow-schema: graph / node configs / journal events / foldRun / API DTO · CJS + ESM",
  "SSE client: persisted events, cursor + Last-Event-ID; no in-memory run state as truth",
], C.blue, { note: "SPA · TypeScript" })}
${arrow(600, 484, 600, 554, { color: C.amber, marker: "arrow-amber" })}
`;

const api = `
${section(530, "03", "API EDGE 接口边界")}
${box(72, 554, 1060, 112, "NestJS 10 · /v1", [
  "JWT guard · Redis rate limit 300/min · Zod validation · problem+json (RFC 7807)",
  "REST + SSE controllers · resources, no response envelope · cursor pagination",
  "auth / workspaces / projects / pipelines / drafts / revisions / runs",
], C.amber, { note: "HTTP entrypoint" })}
${arrow(600, 666, 600, 736, { color: C.amber, marker: "arrow-amber" })}
`;

const domain = `
${section(712, "04", "DOMAIN MODULES + CONTRACTS 领域模块")}
${box(72, 736, 340, 150, "Identity", [
  "users · sessions · JWT 15m",
  "Argon2id password hashing",
  "refresh rotation + family reuse",
], C.pink)}
${box(430, 736, 340, 150, "Workspace", [
  "workspaces · members · roles",
  "projects · LLM connections",
  "AES-256-GCM secrets at rest",
], C.blue)}
${box(788, 736, 340, 150, "Catalog", [
  "pipelines · drafts (If-Match)",
  "revisions: JSONB + SHA-256",
  "DAG validation + step specs",
], C.lime)}
${box(1146, 736, 340, 150, "Integrations", [
  "OpenAI-compatible LLM client",
  "HTTP client + SSRF policy",
  "LLM_MOCK deterministic demo",
], C.teal)}
${box(72, 906, 1078, 138, "Runtime", [
  "runs · journal · dispatcher · executor · history · SSE",
  "6 step types: start / prompt / transform / branch / fetch / respond",
  "leases · retries · cancel · recovery · fork lineage",
], C.amber, { highlight: true, note: "event-sourced" })}
${box(1168, 906, 318, 138, "Shared contract", [
  "packages/flow-schema",
  "Zod graph + node configs",
  "JournalEvent + foldRun",
], C.slate, { note: "CJS + ESM" })}
${arrow(600, 1044, 600, 1130, { color: C.amber, marker: "arrow-amber" })}
`;

const asyncRuntime = `
${section(1106, "05", "ASYNC RUNTIME 运行链路")}
${box(72, 1130, 161, 74, "POST /runs", ["Idempotency-Key"], C.amber)}
${box(249, 1130, 181, 74, "journal: queued", ["seq = event_seq + 1"], C.teal)}
${box(446, 1130, 157, 74, "BullMQ", ["run.execute"], C.amber)}
${box(619, 1130, 205, 74, "run worker", ["executor + sweeper"], C.amber, { highlight: true })}
${box(840, 1130, 187, 74, "step events", ["entered / succeeded"], C.pink)}
${box(1043, 1130, 187, 74, "run.succeeded", ["output + finishedAt"], C.emerald)}
${box(1246, 1130, 181, 74, "SSE cursor", ["Last-Event-ID"], C.teal)}
${box(1443, 1130, 250, 74, "Browser foldRun", ["replay at any seq"], C.blue)}
${arrow(233, 1167, 249, 1167, { color: C.dim, marker: "arrow-dim" })}
${arrow(430, 1167, 446, 1167, { color: C.dim, marker: "arrow-dim" })}
${arrow(603, 1167, 619, 1167, { color: C.dim, marker: "arrow-dim" })}
${arrow(824, 1167, 840, 1167, { color: C.dim, marker: "arrow-dim" })}
${arrow(1027, 1167, 1043, 1167, { color: C.dim, marker: "arrow-dim" })}
${arrow(1230, 1167, 1246, 1167, { color: C.dim, marker: "arrow-dim" })}
${arrow(1427, 1167, 1443, 1167, { color: C.dim, marker: "arrow-dim" })}
${arrow(600, 1204, 600, 1274, { dashed: true, color: C.teal, marker: "arrow-teal", label: "events + lease" })}
`;

const data = `
${section(1250, "06", "DATA + PROCESSES 数据与进程")}
${box(72, 1274, 720, 78, "PostgreSQL 16", ["12 tables · run_events append-only · run_steps projection · revisions JSONB"], C.teal)}
${box(810, 1274, 330, 78, "Redis 7", ["queue · lease/heartbeat · rate limit"], C.teal)}
${box(1158, 1274, 620, 78, "worker process", ["BullMQ consumer · executor · 15s stale-lease sweeper"], C.amber)}
`;

const external = `
${sectionRight(190, "07", "EXTERNAL 外部依赖")}
${box(1820, 214, 508, 146, "LLM provider", [
  "OpenAI-compatible /chat/completions",
  "Qwen / OpenAI / Ollama via env or connection",
  "LLM_MOCK=true → deterministic demo model",
], C.teal)}
${box(1820, 380, 508, 128, "HTTP APIs", [
  "fetch step: http/https only",
  "DNS + private-IP block · 10s · 1MB",
  "max 3 redirects · no shell / vm2",
], C.lime)}
${box(1820, 528, 508, 122, "Secrets", [
  "AES-256-GCM at rest, versioned",
  "never returned by API · pino redaction",
], C.pink)}
${box(1820, 670, 508, 188, "v1 boundary", [
  "No RAG · Agent · MCP in v1",
  "knowledge / agent modules are seams",
  "No worker shell, arbitrary JS or MCP stdio",
  "at-least-once side effects, attempts visible",
], C.slate, { note: "honest scope" })}
${box(1820, 878, 508, 112, "Observability", [
  "run journal + step projection",
  "pino JSON logs · /health · /health/ready",
], C.slate)}
${polyArrow([[1486, 811], [1740, 811], [1740, 286], [1818, 286]], { dashed: true, color: C.dim, marker: "arrow-dim", label: "prompt / fetch" })}
`;

const keyFlows = `
<g>
  ${text(72, 1380, "KEY FLOWS", { size: 11, weight: 600, fill: C.amber, letter: 1.6 })}
  ${text(72, 1404, "RUN   POST /runs → journal:queued → BullMQ → worker → step events → run.succeeded → SSE → foldRun", { size: 13, fill: C.muted, family: MONO })}
  ${text(72, 1426, "REPLAY / RESUME / FORK   foldRun(events, seq) · same run id + pending steps · parentRunId + parentSeq → child starts at parentSeq + 1", { size: 13, fill: C.muted, family: MONO })}
</g>
`;

const legend = `
<g>
  ${text(72, 1458, "LEGEND", { size: 10, weight: 600, fill: C.dim, letter: 1.4 })}
  <line x1="150" y1="1454" x2="184" y2="1454" stroke="${C.dim}" stroke-width="1.4" marker-end="url(#arrow-dim)"/>${text(192, 1458, "sync call", { size: 11, fill: C.dim })}
  <line x1="290" y1="1454" x2="324" y2="1454" stroke="${C.dim}" stroke-width="1.4" stroke-dasharray="6 6" marker-end="url(#arrow-dim)"/>${text(332, 1458, "async / external", { size: 11, fill: C.dim })}
  <rect x="478" y="1447" width="14" height="10" rx="2" fill="${C.panel}" stroke="${C.teal}" stroke-width="1"/>${text(500, 1458, "data store", { size: 11, fill: C.dim })}
  ${text(2328, 1478, "FlowGate v1 · independent implementation · 2026", { size: 11, fill: C.dim, anchor: "end" })}
</g>
`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">FlowGate system architecture</title>
  <desc id="desc">FlowGate event-sourced AI pipeline architecture: browser SPA, NestJS API, domain modules, BullMQ runtime, PostgreSQL journal, Redis queue and external model/HTTP dependencies.</desc>
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${C.grid}" stroke-width="1"/>
    </pattern>
    <radialGradient id="glowAmber" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${C.amber}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${C.amber}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowTeal" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${C.teal}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${C.teal}" stop-opacity="0"/>
    </radialGradient>
    <marker id="arrow-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${C.dim}"/>
    </marker>
    <marker id="arrow-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${C.amber}"/>
    </marker>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${C.blue}"/>
    </marker>
    <marker id="arrow-teal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${C.teal}"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <ellipse cx="240" cy="80" rx="720" ry="420" fill="url(#glowAmber)"/>
  <ellipse cx="2200" cy="1260" rx="620" ry="380" fill="url(#glowTeal)"/>
  ${header}
  ${clients}
  ${web}
  ${api}
  ${domain}
  ${asyncRuntime}
  ${data}
  ${external}
  ${keyFlows}
  ${legend}
</svg>`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, svg, "utf8");
console.log(`wrote ${outPath} (${Buffer.byteLength(svg)} bytes)`);
