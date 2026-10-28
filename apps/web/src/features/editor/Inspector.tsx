import { Button, Divider, Input, InputNumber, Popconfirm } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { nodeSpecs } from "@flowgate/schema";
import { useEditor } from "../../stores/editor";
import { NodeConfigForm } from "./NodeConfigForm";

const OUTPUT_HINTS: Record<string, string> = {
  start: "output.<inputField>",
  prompt: "output.text",
  transform: "output.value",
  branch: "output.result",
  fetch: "output.body",
  respond: "output.response",
};

export function Inspector() {
  const selected = useEditor((state) => state.nodes.find((node) => node.id === state.selectedId)?.data.node ?? null);
  const nodes = useEditor((state) => state.nodes);
  const updateNode = useEditor((state) => state.updateNode);
  const updateConfig = useEditor((state) => state.updateConfig);
  const deleteNode = useEditor((state) => state.deleteNode);

  if (!selected) {
    return (
      <aside className="inspector">
        <div className="empty-inspector">
          选择一个步骤查看配置。
          <br />
          也可以从左侧拖入新的步骤。
        </div>
      </aside>
    );
  }

  const spec = nodeSpecs[selected.kind];
  const keyValid = /^[a-z][a-z0-9_]{1,31}$/.test(selected.key);
  const others = nodes.filter((node) => node.id !== selected.id);

  return (
    <aside className="inspector">
      <div className="inspector__head">
        <span style={{ color: spec.color }}>{spec.label}</span>
        <span className="inspector__kind">{selected.kind}</span>
      </div>

      <div className="field">
        <label>标题</label>
        <Input
          value={selected.title}
          onChange={(event) => updateNode(selected.id, { title: event.target.value })}
        />
      </div>

      <div className="field">
        <label>步骤 Key（用于变量引用）</label>
        <Input
          className="mono"
          value={selected.key}
          status={keyValid ? undefined : "error"}
          onChange={(event) => updateNode(selected.id, { key: event.target.value })}
        />
        {!keyValid && <div className="field-help" style={{ color: "#f87171" }}>需以小写字母开头，2-32 位小写字母/数字/下划线。</div>}
      </div>

      <div className="field">
        <label>失败重试次数</label>
        <InputNumber
          min={1}
          max={3}
          value={selected.maxAttempts}
          onChange={(value) => updateNode(selected.id, { maxAttempts: value ?? 1 })}
          style={{ width: "100%" }}
        />
        <div className="field-help">节点级重试，退避 0.5s / 1s / 2s。仅对可重试错误有意义。</div>
      </div>

      <Divider />
      <NodeConfigForm node={selected} onChange={(config) => updateConfig(selected.id, config)} />

      <Divider />
      <div className="variable-hint">
        <span className="variable-hint__title">可用上游变量</span>
        <code>{"{{inputs.<field>}}"}</code>
        {others.map((node) => (
          <code key={node.id}>{`{{steps.${node.data.node.key}.${OUTPUT_HINTS[node.data.node.kind]}}}`}</code>
        ))}
      </div>

      <Popconfirm
        title="删除这个步骤？"
        description="与它相连的边也会被删除。"
        okText="删除"
        cancelText="取消"
        onConfirm={() => deleteNode(selected.id)}
      >
        <Button danger block icon={<DeleteOutlined />}>
          删除步骤
        </Button>
      </Popconfirm>
    </aside>
  );
}
