import { nodeSpecs, type NodeKind } from "@flowgate/schema";
import { useEditor } from "../../stores/editor";
import { NODE_ICONS } from "./nodeIcons";

export function NodePalette() {
  const addNode = useEditor((state) => state.addNode);
  const nodeCount = useEditor((state) => state.nodes.length);

  return (
    <aside className="palette">
      <div className="palette__title">步骤库</div>
      {Object.values(nodeSpecs).map((spec) => (
        <div
          key={spec.kind}
          className="palette-item"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("application/flowgate-node", spec.kind);
            event.dataTransfer.effectAllowed = "move";
          }}
          onClick={() =>
            addNode(spec.kind as NodeKind, {
              x: 180 + (nodeCount % 3) * 56,
              y: 150 + (nodeCount % 5) * 78,
            })
          }
        >
          <span
            className="palette-item__icon"
            style={{ color: spec.color, background: `${spec.color}18` }}
          >
            {NODE_ICONS[spec.icon]}
          </span>
          <span className="palette-item__text">
            <span className="palette-item__label">{spec.label}</span>
            <span className="palette-item__desc">{spec.description}</span>
          </span>
        </div>
      ))}
      <div className="palette__note">
        拖拽或点击添加步骤。分支步骤有「真 / 假」两个出口，其余步骤使用默认出口。
      </div>
    </aside>
  );
}
