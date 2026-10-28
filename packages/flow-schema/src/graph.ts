import { z } from "zod";

export const GRAPH_SCHEMA_VERSION = 1;

export const NODE_KINDS = ["start", "prompt", "transform", "branch", "fetch", "respond"] as const;
export const nodeKindSchema = z.enum(NODE_KINDS);
export type NodeKind = (typeof NODE_KINDS)[number];

export const nodeKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]{1,31}$/,
    "key must start with a lowercase letter and contain 2-32 lowercase letters, digits or underscores",
  );
export const nodeIdSchema = z.string().min(1).max(64);

export const startConfigSchema = z.object({}).strict();
export const promptConfigSchema = z.object({
  model: z.string().trim().max(120).optional(),
  system: z.string().max(8000).default(""),
  template: z.string().min(1).max(20000),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().min(1).max(8192).default(512),
});
export const transformConfigSchema = z.object({
  expression: z.string().min(1).max(20000),
});
export const branchConfigSchema = z.object({
  expression: z.string().min(1).max(20000),
});
export const fetchConfigSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  url: z.string().min(1).max(2000),
  headers: z.record(z.string()).default({}),
  body: z.string().max(20000).default(""),
  timeoutMs: z.number().int().min(1000).max(30000).default(10000),
});
export const respondConfigSchema = z.object({
  expression: z.string().min(1).max(20000),
});

export const configSchemaByKind = {
  start: startConfigSchema,
  prompt: promptConfigSchema,
  transform: transformConfigSchema,
  branch: branchConfigSchema,
  fetch: fetchConfigSchema,
  respond: respondConfigSchema,
} as const;

export type NodeConfigMap = {
  start: z.infer<typeof startConfigSchema>;
  prompt: z.infer<typeof promptConfigSchema>;
  transform: z.infer<typeof transformConfigSchema>;
  branch: z.infer<typeof branchConfigSchema>;
  fetch: z.infer<typeof fetchConfigSchema>;
  respond: z.infer<typeof respondConfigSchema>;
};

export function parseNodeConfig<K extends NodeKind>(kind: K, config: unknown): NodeConfigMap[K] {
  return configSchemaByKind[kind].parse(config) as NodeConfigMap[K];
}

export const pipelineNodeSchema = z.object({
  id: nodeIdSchema,
  key: nodeKeySchema,
  kind: nodeKindSchema,
  title: z.string().min(1).max(80),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  config: z.record(z.unknown()).default({}),
  maxAttempts: z.number().int().min(1).max(3).default(1),
});

export const pipelineEdgeSchema = z.object({
  id: z.string().min(1).max(64),
  source: nodeIdSchema,
  target: nodeIdSchema,
  sourceHandle: z.string().min(1).max(16).default("out"),
  targetHandle: z.string().min(1).max(16).optional(),
});

export type PipelineNode = z.infer<typeof pipelineNodeSchema>;
export type PipelineEdge = z.infer<typeof pipelineEdgeSchema>;

export const pipelineGraphSchema = z
  .object({
    schemaVersion: z.literal(GRAPH_SCHEMA_VERSION),
    nodes: z.array(pipelineNodeSchema).min(1).max(100),
    edges: z.array(pipelineEdgeSchema).max(300),
  })
  .superRefine((graph, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    const byId = new Map<string, PipelineNode>();
    const byKey = new Map<string, PipelineNode>();

    graph.nodes.forEach((node, index) => {
      if (byId.has(node.id)) issue(["nodes", index, "id"], `duplicate node id "${node.id}"`);
      byId.set(node.id, node);
      if (byKey.has(node.key)) issue(["nodes", index, "key"], `duplicate step key "${node.key}"`);
      byKey.set(node.key, node);

      const parsed = configSchemaByKind[node.kind].safeParse(node.config);
      if (!parsed.success) {
        for (const problem of parsed.error.issues) {
          issue(["nodes", index, "config", ...problem.path], problem.message);
        }
      }
    });

    const starts = graph.nodes.filter((node) => node.kind === "start");
    if (starts.length !== 1) issue(["nodes"], "graph must contain exactly one start node");
    if (!graph.nodes.some((node) => node.kind === "respond")) {
      issue(["nodes"], "graph must contain at least one respond node");
    }

    const edgeKeys = new Set<string>();
    graph.edges.forEach((edge, index) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source) issue(["edges", index, "source"], `unknown source node "${edge.source}"`);
      if (!target) issue(["edges", index, "target"], `unknown target node "${edge.target}"`);
      if (edge.source === edge.target) issue(["edges", index], "self loops are not allowed");

      const dedupe = `${edge.source}|${edge.target}|${edge.sourceHandle}`;
      if (edgeKeys.has(dedupe)) issue(["edges", index], "duplicate edge");
      edgeKeys.add(dedupe);

      if (source) {
        if (source.kind === "branch") {
          if (edge.sourceHandle !== "true" && edge.sourceHandle !== "false") {
            issue(["edges", index, "sourceHandle"], "branch edges must use the true or false handle");
          }
        } else if (edge.sourceHandle !== "out") {
          issue(["edges", index, "sourceHandle"], "non-branch edges must use the out handle");
        }
        if (source.kind === "respond") {
          issue(["edges", index, "source"], "respond nodes cannot have outgoing edges");
        }
      }
      if (target?.kind === "start") {
        issue(["edges", index, "target"], "start node cannot have incoming edges");
      }
    });

    const adjacency = new Map<string, string[]>();
    for (const node of graph.nodes) adjacency.set(node.id, []);
    for (const edge of graph.edges) {
      if (byId.has(edge.source) && byId.has(edge.target)) {
        adjacency.get(edge.source)!.push(edge.target);
      }
    }

    if (starts.length === 1) {
      const reached = new Set<string>([starts[0].id]);
      const queue = [starts[0].id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const next of adjacency.get(current) ?? []) {
          if (!reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
      }
      graph.nodes.forEach((node, index) => {
        if (!reached.has(node.id)) issue(["nodes", index], "node is not reachable from start");
      });
    }

    const indegree = new Map<string, number>();
    graph.nodes.forEach((node) => indegree.set(node.id, 0));
    graph.edges.forEach((edge) => {
      if (indegree.has(edge.target)) indegree.set(edge.target, indegree.get(edge.target)! + 1);
    });
    const ready = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
    let visited = 0;
    while (ready.length > 0) {
      const current = ready.shift()!;
      visited += 1;
      for (const next of adjacency.get(current) ?? []) {
        const remaining = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, remaining);
        if (remaining === 0) ready.push(next);
      }
    }
    if (visited !== graph.nodes.length) issue([], "graph contains a cycle");
  });

export type PipelineGraph = z.infer<typeof pipelineGraphSchema>;

export function indexGraph(graph: PipelineGraph) {
  const byId = new Map<string, PipelineNode>();
  const byKey = new Map<string, PipelineNode>();
  for (const node of graph.nodes) {
    byId.set(node.id, node);
    byKey.set(node.key, node);
  }
  const incoming = new Map<string, PipelineEdge[]>();
  const outgoing = new Map<string, PipelineEdge[]>();
  for (const node of graph.nodes) {
    incoming.set(node.key, []);
    outgoing.set(node.key, []);
  }
  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    outgoing.get(source.key)?.push(edge);
    incoming.get(target.key)?.push(edge);
  }
  return { byId, byKey, incoming, outgoing };
}

export function topologicalOrder(graph: PipelineGraph): string[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    adjacency.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
  }
  const ready = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const remaining = indegree.get(next)! - 1;
      indegree.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
  }
  if (order.length !== graph.nodes.length) throw new Error("graph contains a cycle");
  return order.map((id) => nodes.get(id)!.key);
}

export function createDefaultGraph(): PipelineGraph {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: [
      {
        id: "n_start",
        key: "start",
        kind: "start",
        title: "起点",
        position: { x: 80, y: 200 },
        config: {},
        maxAttempts: 1,
      },
      {
        id: "n_respond",
        key: "respond",
        kind: "respond",
        title: "响应",
        position: { x: 520, y: 200 },
        config: { expression: "$" },
        maxAttempts: 1,
      },
    ],
    edges: [{ id: "e_start_respond", source: "n_start", target: "n_respond", sourceHandle: "out" }],
  };
}

export function nextNodeKey(kind: NodeKind, existingKeys: Iterable<string>): string {
  const taken = new Set(existingKeys);
  if (kind === "start" && !taken.has("start")) return "start";
  let index = 1;
  while (taken.has(`${kind}_${index}`)) index += 1;
  return `${kind}_${index}`;
}

export function newNodeId(): string {
  const cryptoApi = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  const uuid = cryptoApi?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `n_${uuid}`;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortDeep(record[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}
