import { z } from "zod";
import { type NodeKind, configSchemaByKind } from "./graph";

export type FieldType = "text" | "textarea" | "code" | "number" | "select" | "switch" | "keyValue";

export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  help?: string;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
};

export type NodeSpec = {
  kind: NodeKind;
  label: string;
  description: string;
  category: string;
  color: string;
  icon: string;
  hasTarget: boolean;
  hasSource: boolean;
  sourceHandles: string[];
  fields: FieldSpec[];
  defaultConfig: Record<string, unknown>;
};

export const nodeSpecs: Record<NodeKind, NodeSpec> = {
  start: {
    kind: "start",
    label: "起点",
    description: "接收本次运行的输入，作为管道入口。",
    category: "入口",
    color: "#14b8a6",
    icon: "play",
    hasTarget: false,
    hasSource: true,
    sourceHandles: ["out"],
    fields: [],
    defaultConfig: {},
  },
  prompt: {
    kind: "prompt",
    label: "提示词",
    description: "用模板拼接上下文并调用模型。",
    category: "模型",
    color: "#f59e0b",
    icon: "message",
    hasTarget: true,
    hasSource: true,
    sourceHandles: ["out"],
    fields: [
      { key: "model", label: "模型", type: "text", placeholder: "留空则使用服务端默认模型" },
      { key: "system", label: "系统提示", type: "textarea", rows: 3, placeholder: "你是一个严谨的业务助手。" },
      {
        key: "template",
        label: "用户模板",
        type: "code",
        rows: 6,
        help: "支持 {{steps.<key>.output.<path>}} 与 {{inputs.<path>}} 变量。",
      },
      { key: "temperature", label: "温度", type: "number", min: 0, max: 2, step: 0.1 },
      { key: "maxTokens", label: "最大 Token", type: "number", min: 1, max: 8192, step: 1 },
    ],
    defaultConfig: {
      system: "",
      template: "请根据以下信息给出结论：{{inputs.query}}",
      temperature: 0.2,
      maxTokens: 512,
    },
  },
  transform: {
    kind: "transform",
    label: "变换",
    description: "用安全的 JSONata 表达式加工上游输出。",
    category: "数据",
    color: "#60a5fa",
    icon: "function",
    hasTarget: true,
    hasSource: true,
    sourceHandles: ["out"],
    fields: [
      {
        key: "expression",
        label: "JSONata 表达式",
        type: "code",
        rows: 6,
        help: "上下文为 { steps, inputs }，结果写入 output.value。",
      },
    ],
    defaultConfig: { expression: "$" },
  },
  branch: {
    kind: "branch",
    label: "分支",
    description: "按布尔表达式选择 true / false 出口。",
    category: "逻辑",
    color: "#f472b6",
    icon: "branch",
    hasTarget: true,
    hasSource: true,
    sourceHandles: ["true", "false"],
    fields: [
      {
        key: "expression",
        label: "条件表达式",
        type: "code",
        rows: 4,
        help: "返回布尔值。例如 steps.prompt_1.output.text != ''。",
      },
    ],
    defaultConfig: { expression: "true" },
  },
  fetch: {
    kind: "fetch",
    label: "请求",
    description: "调用外部 HTTP 接口，带 SSRF 防护。",
    category: "集成",
    color: "#a3e635",
    icon: "api",
    hasTarget: true,
    hasSource: true,
    sourceHandles: ["out"],
    fields: [
      {
        key: "method",
        label: "方法",
        type: "select",
        options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ label: value, value })),
      },
      {
        key: "url",
        label: "URL",
        type: "text",
        placeholder: "https://api.example.com/hook",
        help: "支持 {{steps.xxx.output.yyy}} 模板变量；私网地址会被拒绝。",
      },
      { key: "headers", label: "请求头", type: "keyValue" },
      { key: "body", label: "请求体", type: "code", rows: 4, placeholder: "{\"query\": \"{{inputs.query}}\"}" },
      { key: "timeoutMs", label: "超时 (ms)", type: "number", min: 1000, max: 30000, step: 500 },
    ],
    defaultConfig: {
      method: "GET",
      url: "https://api.example.test/qualify?q={{inputs.query}}",
      headers: {},
      body: "",
      timeoutMs: 10000,
    },
  },
  respond: {
    kind: "respond",
    label: "响应",
    description: "组装最终输出并结束本次运行。",
    category: "出口",
    color: "#34d399",
    icon: "flag",
    hasTarget: true,
    hasSource: false,
    sourceHandles: [],
    fields: [
      {
        key: "expression",
        label: "输出表达式",
        type: "code",
        rows: 6,
        help: "$ 代表整个运行上下文 { steps, inputs }。",
      },
    ],
    defaultConfig: { expression: "$" },
  },
};

export function defaultConfigFor(kind: NodeKind): Record<string, unknown> {
  return { ...nodeSpecs[kind].defaultConfig };
}

export const nodeConfigValidators = configSchemaByKind;

export const nodeKindUnion = z.enum(["start", "prompt", "transform", "branch", "fetch", "respond"]);
