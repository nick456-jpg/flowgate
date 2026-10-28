import { useEffect, useRef } from "react";
import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeSpecs, type NodeKind } from "@flowgate/schema";
import { useEditor, type FlowNode } from "../../stores/editor";
import { NodePalette } from "./NodePalette";
import { StepNode } from "./StepNode";

const nodeTypes = { step: StepNode };

function CanvasInner() {
  const nodes = useEditor((state) => state.nodes);
  const edges = useEditor((state) => state.edges);
  const onNodesChange = useEditor((state) => state.onNodesChange);
  const onEdgesChange = useEditor((state) => state.onEdgesChange);
  const onConnect = useEditor((state) => state.onConnect);
  const addNode = useEditor((state) => state.addNode);
  const select = useEditor((state) => state.select);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let timer: number | undefined;
    const refit = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void fitView({ padding: 0.18, duration: 220 });
      }, 140);
    };
    const initial = window.setTimeout(() => {
      void fitView({ padding: 0.18, duration: 220 });
    }, 160);
    const observer = new ResizeObserver(refit);
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(initial);
      if (timer) window.clearTimeout(timer);
    };
  }, [fitView]);

  return (
    <div
      ref={containerRef}
      className="canvas-wrap"
      onDrop={(event) => {
        event.preventDefault();
        const kind = event.dataTransfer.getData("application/flowgate-node") as NodeKind;
        if (!kind || !(kind in nodeSpecs)) return;
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNode(kind, position);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
    >
      <ReactFlow<FlowNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_event, node) => select(node.id)}
        onPaneClick={() => select(null)}
        defaultEdgeOptions={{ type: "smoothstep" }}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        minZoom={0.25}
        maxZoom={1.6}
        snapToGrid
        snapGrid={[12, 12]}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Shift"
      >
        <Background variant={BackgroundVariant.Dots} color="#252b36" gap={22} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(9, 11, 15, 0.78)"
          nodeColor={(node) => {
            const flowNode = node as FlowNode;
            return nodeSpecs[flowNode.data.node.kind]?.color ?? "#4b5563";
          }}
        />
      </ReactFlow>
      {nodes.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            color: "#4b5563",
            fontSize: 12,
          }}
        >
          从左侧拖入一个步骤开始编排
        </div>
      )}
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <NodePalette />
      <CanvasInner />
    </ReactFlowProvider>
  );
}
