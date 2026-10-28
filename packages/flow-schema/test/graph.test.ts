import { describe, expect, it } from "vitest";
import {
  createDefaultGraph,
  nextNodeKey,
  pipelineGraphSchema,
  topologicalOrder,
  type PipelineEdge,
  type PipelineGraph,
  type PipelineNode,
} from "../src";

const node = (
  id: string,
  key: string,
  kind: PipelineNode["kind"],
  config: Record<string, unknown> = {},
): PipelineNode => ({
  id,
  key,
  kind,
  title: key,
  position: { x: 0, y: 0 },
  config,
  maxAttempts: 1,
});

const edge = (id: string, source: string, target: string, sourceHandle = "out"): PipelineEdge => ({
  id,
  source,
  target,
  sourceHandle,
});

const graph = (nodes: PipelineNode[], edges: PipelineEdge[]): PipelineGraph => ({
  schemaVersion: 1,
  nodes,
  edges,
});

describe("pipeline graph", () => {
  it("accepts the default graph", () => {
    const parsed = pipelineGraphSchema.safeParse(createDefaultGraph());
    expect(parsed.success).toBe(true);
    expect(topologicalOrder(createDefaultGraph())).toEqual(["start", "respond"]);
  });

  it("rejects cycles", () => {
    const candidate = graph(
      [
        node("s", "start", "start"),
        node("p", "prompt_1", "prompt", { template: "hi" }),
        node("t", "transform_1", "transform", { expression: "$" }),
        node("r", "respond", "respond", { expression: "$" }),
      ],
      [
        edge("e1", "s", "p"),
        edge("e2", "p", "t"),
        edge("e3", "t", "p"),
        edge("e4", "s", "r"),
      ],
    );
    const parsed = pipelineGraphSchema.safeParse(candidate);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("cycle"))).toBe(true);
    }
  });

  it("rejects duplicate step keys", () => {
    const candidate = graph(
      [
        node("s", "start", "start"),
        node("p1", "prompt_1", "prompt", { template: "a" }),
        node("p2", "prompt_1", "prompt", { template: "b" }),
        node("r", "respond", "respond", { expression: "$" }),
      ],
      [edge("e1", "s", "p1"), edge("e2", "p1", "p2"), edge("e3", "p2", "r")],
    );
    const parsed = pipelineGraphSchema.safeParse(candidate);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("duplicate step key"))).toBe(true);
    }
  });

  it("rejects a branch edge with the wrong handle", () => {
    const candidate = graph(
      [
        node("s", "start", "start"),
        node("b", "branch_1", "branch", { expression: "true" }),
        node("r", "respond", "respond", { expression: "$" }),
      ],
      [edge("e1", "s", "b"), edge("e2", "b", "r", "out")],
    );
    const parsed = pipelineGraphSchema.safeParse(candidate);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("true or false"))).toBe(true);
    }
  });

  it("rejects unreachable nodes", () => {
    const candidate = graph(
      [
        node("s", "start", "start"),
        node("r", "respond", "respond", { expression: "$" }),
        node("t", "transform_1", "transform", { expression: "$" }),
      ],
      [edge("e1", "s", "r")],
    );
    const parsed = pipelineGraphSchema.safeParse(candidate);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("not reachable"))).toBe(true);
    }
  });

  it("allocates stable step keys", () => {
    expect(nextNodeKey("prompt", [])).toBe("prompt_1");
    expect(nextNodeKey("prompt", ["prompt_1", "prompt_2"])).toBe("prompt_3");
    expect(nextNodeKey("start", [])).toBe("start");
  });
});
