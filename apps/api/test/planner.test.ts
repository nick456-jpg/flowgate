import { describe, expect, it } from "vitest";
import type { PipelineEdge, PipelineGraph } from "@flowgate/schema";
import {
  createEdgeStates,
  markBranchSelected,
  markNodeSkipped,
  nodeIsBlocked,
} from "../src/runtime/planner";

const trueEdge: PipelineEdge = {
  id: "e_true",
  source: "n_branch",
  target: "n_hot",
  sourceHandle: "true",
};
const falseEdge: PipelineEdge = {
  id: "e_false",
  source: "n_branch",
  target: "n_cold",
  sourceHandle: "false",
};

const graph: PipelineGraph = {
  schemaVersion: 1,
  nodes: [
    { id: "n_start", key: "start", kind: "start", title: "起点", position: { x: 0, y: 0 }, config: {}, maxAttempts: 1 },
    { id: "n_branch", key: "branch_1", kind: "branch", title: "分支", position: { x: 100, y: 0 }, config: { expression: "true" }, maxAttempts: 1 },
    { id: "n_hot", key: "respond_hot", kind: "respond", title: "热", position: { x: 200, y: 0 }, config: { expression: "$" }, maxAttempts: 1 },
    { id: "n_cold", key: "respond_cold", kind: "respond", title: "冷", position: { x: 200, y: 100 }, config: { expression: "$" }, maxAttempts: 1 },
  ],
  edges: [
    { id: "e_start_branch", source: "n_start", target: "n_branch", sourceHandle: "out" },
    trueEdge,
    falseEdge,
  ],
};

describe("run planner", () => {
  it("opens all edges initially", () => {
    const states = createEdgeStates(graph);
    expect(states.e_true).toBe("open");
    expect(states.e_false).toBe("open");
  });

  it("closes the branch that was not selected", () => {
    const states = createEdgeStates(graph);
    markBranchSelected(states, [trueEdge, falseEdge], "true");
    expect(states.e_true).toBe("open");
    expect(states.e_false).toBe("closed");
  });

  it("only blocks a node when every incoming edge is closed", () => {
    const states = createEdgeStates(graph);
    markBranchSelected(states, [trueEdge, falseEdge], "true");

    expect(nodeIsBlocked([trueEdge], states)).toBe(false);
    expect(nodeIsBlocked([falseEdge], states)).toBe(true);
    expect(nodeIsBlocked([trueEdge, falseEdge], states)).toBe(false);
    expect(nodeIsBlocked([], states)).toBe(false);
  });

  it("propagates a skipped node to its downstream edges", () => {
    const states = createEdgeStates(graph);
    markNodeSkipped(states, [trueEdge]);
    expect(nodeIsBlocked([trueEdge], states)).toBe(true);
  });
});
