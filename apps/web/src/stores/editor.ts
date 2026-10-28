import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import {
  GRAPH_SCHEMA_VERSION,
  defaultConfigFor,
  newNodeId,
  nextNodeKey,
  nodeSpecs,
  type NodeKind,
  type PipelineGraph,
  type PipelineNode,
} from "@flowgate/schema";

export type FlowNode = Node<{ node: PipelineNode }, "step">;

type EditorState = {
  pipelineId: string | null;
  nodes: FlowNode[];
  edges: Edge[];
  selectedId: string | null;
  rowVersion: number | null;
  headRevision: number | null;
  dirty: boolean;
  saving: boolean;
  lastSavedAt: string | null;
  editVersion: number;
  load: (
    pipelineId: string,
    graph: PipelineGraph,
    rowVersion: number,
    headRevision: number | null,
  ) => void;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<Edge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (kind: NodeKind, position: { x: number; y: number }) => void;
  updateNode: (nodeId: string, patch: Partial<PipelineNode>) => void;
  updateConfig: (nodeId: string, config: Record<string, unknown>) => void;
  deleteNode: (nodeId: string) => void;
  select: (nodeId: string | null) => void;
  setSaving: (saving: boolean) => void;
  markSaved: (rowVersion: number, editVersion: number) => void;
  setHeadRevision: (number: number) => void;
  toGraph: () => PipelineGraph;
};

function bump(state: EditorState) {
  return { dirty: true, editVersion: state.editVersion + 1 };
}

export function graphFrom(nodes: FlowNode[], edges: Edge[]): PipelineGraph {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes: nodes.map((flowNode) => ({
      ...flowNode.data.node,
      position: flowNode.position,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? "out",
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    })),
  };
}

export const useEditor = create<EditorState>((set, get) => ({
  pipelineId: null,
  nodes: [],
  edges: [],
  selectedId: null,
  rowVersion: null,
  headRevision: null,
  dirty: false,
  saving: false,
  lastSavedAt: null,
  editVersion: 0,

  load: (pipelineId, graph, rowVersion, headRevision) =>
    set({
      pipelineId,
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        type: "step",
        position: node.position,
        data: { node },
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: "smoothstep",
      })),
      selectedId: null,
      rowVersion,
      headRevision,
      dirty: false,
      saving: false,
      lastSavedAt: null,
      editVersion: 0,
    }),

  onNodesChange: (changes) => {
    const state = get();
    const next = applyNodeChanges(changes, state.nodes);
    const structural = changes.some(
      (change) =>
        change.type === "remove" ||
        change.type === "add" ||
        change.type === "replace" ||
        change.type === "position",
    );
    set({ nodes: next, ...(structural ? bump(state) : {}) });
  },

  onEdgesChange: (changes) => {
    const state = get();
    const next = applyEdgeChanges(changes, state.edges);
    const structural = changes.some(
      (change) => change.type === "remove" || change.type === "add" || change.type === "replace",
    );
    set({ edges: next, ...(structural ? bump(state) : {}) });
  },

  onConnect: (connection) => {
    const state = get();
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const source = state.nodes.find((node) => node.id === connection.source);
    const target = state.nodes.find((node) => node.id === connection.target);
    if (!source || !target) return;
    if (source.data.node.kind === "respond") return;
    if (target.data.node.kind === "start") return;

    const handle =
      source.data.node.kind === "branch"
        ? connection.sourceHandle === "false"
          ? "false"
          : "true"
        : "out";
    const duplicate = state.edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        (edge.sourceHandle ?? "out") === handle,
    );
    if (duplicate) return;

    const edge: Edge = {
      ...connection,
      id: `e_${crypto.randomUUID()}`,
      sourceHandle: handle,
      type: "smoothstep",
    };
    set({ edges: addEdge(edge, state.edges), ...bump(state) });
  },

  addNode: (kind, position) => {
    const state = get();
    const key = nextNodeKey(
      kind,
      state.nodes.map((node) => node.data.node.key),
    );
    const node: PipelineNode = {
      id: newNodeId(),
      key,
      kind,
      title: nodeSpecs[kind].label,
      position,
      config: defaultConfigFor(kind),
      maxAttempts: 1,
    };
    set({
      nodes: [...state.nodes, { id: node.id, type: "step", position, data: { node } }],
      selectedId: node.id,
      ...bump(state),
    });
  },

  updateNode: (nodeId, patch) => {
    const state = get();
    set({
      nodes: state.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, data: { node: { ...node.data.node, ...patch } } }
          : node,
      ),
      ...bump(state),
    });
  },

  updateConfig: (nodeId, config) => {
    get().updateNode(nodeId, { config });
  },

  deleteNode: (nodeId) => {
    const state = get();
    set({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      selectedId: state.selectedId === nodeId ? null : state.selectedId,
      ...bump(state),
    });
  },

  select: (nodeId) => set({ selectedId: nodeId }),

  setSaving: (saving) => set({ saving }),

  markSaved: (rowVersion, editVersion) => {
    const state = get();
    set({
      rowVersion,
      dirty: state.editVersion !== editVersion,
      saving: false,
      lastSavedAt: new Date().toISOString(),
    });
  },

  setHeadRevision: (number) => set({ headRevision: number }),

  toGraph: () => graphFrom(get().nodes, get().edges),
}));
