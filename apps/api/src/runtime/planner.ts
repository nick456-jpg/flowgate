import type { PipelineEdge, PipelineGraph } from "@flowgate/schema";

export type EdgeState = "open" | "closed";
export type EdgeStates = Record<string, EdgeState>;

export function createEdgeStates(graph: PipelineGraph): EdgeStates {
  const states: EdgeStates = {};
  for (const edge of graph.edges) states[edge.id] = "open";
  return states;
}

export function markBranchSelected(states: EdgeStates, outgoing: PipelineEdge[], branch: "true" | "false"): void {
  for (const edge of outgoing) {
    states[edge.id] = edge.sourceHandle === branch ? "open" : "closed";
  }
}

export function markNodeSkipped(states: EdgeStates, outgoing: PipelineEdge[]): void {
  for (const edge of outgoing) states[edge.id] = "closed";
}

export function nodeIsBlocked(incoming: PipelineEdge[], states: EdgeStates): boolean {
  if (incoming.length === 0) return false;
  return incoming.every((edge) => states[edge.id] === "closed");
}

export function seedEdgeStates(
  graph: PipelineGraph,
  branches: Record<string, "true" | "false">,
  skippedKeys: string[],
): EdgeStates {
  const states = createEdgeStates(graph);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, PipelineEdge[]>();
  for (const node of graph.nodes) outgoing.set(node.key, []);
  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    if (source) outgoing.get(source.key)?.push(edge);
  }
  for (const [key, branch] of Object.entries(branches)) {
    markBranchSelected(states, outgoing.get(key) ?? [], branch);
  }
  for (const key of skippedKeys) {
    markNodeSkipped(states, outgoing.get(key) ?? []);
  }
  return states;
}
