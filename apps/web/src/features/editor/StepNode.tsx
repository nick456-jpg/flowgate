import { Fragment, memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { nodeSpecs } from "@flowgate/schema";
import type { FlowNode } from "../../stores/editor";
import { useRunView } from "../../stores/runView";
import { NODE_ICONS } from "./nodeIcons";

const STATUS_LABEL: Record<string, string> = {
  pending: "待运行",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  skipped: "跳过",
};

export const StepNode = memo(function StepNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.node;
  const spec = nodeSpecs[node.kind];
  const step = useRunView((state) => state.folded.steps[node.key]);
  const status = step?.status ?? "pending";

  return (
    <div className={`step-node${selected ? " selected" : ""} status-${status}`}>
      {spec.hasTarget && <Handle id="in" type="target" position={Position.Left} />}

      <span className="step-node__stripe" style={{ background: spec.color }} />
      <div className="step-node__body">
        <div className="step-node__head">
          <span className="step-node__icon" style={{ color: spec.color }}>
            {NODE_ICONS[spec.icon]}
          </span>
          <span className="step-node__title">{node.title}</span>
          {step?.retrying && <span className="step-node__retry">重试</span>}
        </div>
        <div className="step-node__key mono">{node.key}</div>
        <div className="step-node__foot">
          <span className={`status-dot status-dot--${status}`} />
          <span>{STATUS_LABEL[status]}</span>
          {step?.durationMs !== undefined && step?.durationMs !== null && (
            <span className="step-node__duration">{step.durationMs}ms</span>
          )}
        </div>
      </div>

      {spec.sourceHandles.map((handle, index) => {
        const top = spec.sourceHandles.length > 1 ? `${34 + index * 30}%` : "50%";
        return (
          <Fragment key={handle}>
            <Handle id={handle} type="source" position={Position.Right} style={{ top }} />
            {spec.sourceHandles.length > 1 && (
              <span className="handle-label" style={{ top }}>
                {handle === "true" ? "真" : "假"}
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
});
