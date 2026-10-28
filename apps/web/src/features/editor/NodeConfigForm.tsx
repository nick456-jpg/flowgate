import { Button, Input, InputNumber, Select, Switch } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { nodeSpecs, type FieldSpec, type PipelineNode } from "@flowgate/schema";

function KeyValueEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const entries = Object.entries(value ?? {});

  const updateEntry = (index: number, key: string, entryValue: string) => {
    const next: Record<string, string> = {};
    entries.forEach(([currentKey, currentValue], currentIndex) => {
      next[currentIndex === index ? key : currentKey] = currentIndex === index ? entryValue : currentValue;
    });
    onChange(next);
  };

  const removeEntry = (index: number) => {
    const next: Record<string, string> = {};
    entries.forEach(([key, entryValue], currentIndex) => {
      if (currentIndex !== index) next[key] = entryValue;
    });
    onChange(next);
  };

  return (
    <div>
      {entries.map(([key, entryValue], index) => (
        <div className="key-value-row" key={index}>
          <Input
            size="small"
            value={key}
            placeholder="key"
            onChange={(event) => updateEntry(index, event.target.value, entryValue)}
          />
          <Input
            size="small"
            value={entryValue}
            placeholder="value"
            onChange={(event) => updateEntry(index, key, event.target.value)}
          />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => removeEntry(index)}
          />
        </div>
      ))}
      <Button
        size="small"
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => onChange({ ...value, [`header_${entries.length + 1}`]: "" })}
      >
        添加
      </Button>
    </div>
  );
}

function renderField(
  field: FieldSpec,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  switch (field.type) {
    case "number":
      return (
        <InputNumber
          style={{ width: "100%" }}
          value={typeof value === "number" ? value : undefined}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          onChange={(next) => onChange(next ?? 0)}
        />
      );
    case "select":
      return (
        <Select
          value={typeof value === "string" ? value : undefined}
          options={field.options}
          onChange={(next) => onChange(next)}
        />
      );
    case "switch":
      return <Switch checked={value === true} onChange={(next) => onChange(next)} />;
    case "keyValue":
      return (
        <KeyValueEditor
          value={(value as Record<string, string>) ?? {}}
          onChange={(next) => onChange(next)}
        />
      );
    case "code":
      return (
        <Input.TextArea
          className="mono"
          rows={field.rows ?? 5}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case "textarea":
      return (
        <Input.TextArea
          rows={field.rows ?? 3}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    default:
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

export function NodeConfigForm({
  node,
  onChange,
}: {
  node: PipelineNode;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const spec = nodeSpecs[node.kind];
  if (spec.fields.length === 0) {
    return <div className="dim" style={{ fontSize: 11, lineHeight: 1.7 }}>起点没有额外配置，运行输入在“运行”弹窗中提供。</div>;
  }

  return (
    <div>
      {spec.fields.map((field) => (
        <div className="field" key={field.key}>
          <label>{field.label}</label>
          {renderField(field, node.config[field.key], (value) =>
            onChange({ ...node.config, [field.key]: value }),
          )}
          {field.help && <div className="field-help">{field.help}</div>}
        </div>
      ))}
    </div>
  );
}
