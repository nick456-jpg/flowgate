import { useState } from "react";
import { Button, Input, Table, Tag, message } from "antd";
import { DeleteOutlined, LogoutOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, logoutRequest, problemMessage } from "../lib/api";
import type { ListResponse, LlmConnection, Member, Workspace } from "../lib/types";
import { formatTime } from "../lib/format";
import { useSession } from "../stores/session";

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);
  const setAnonymous = useSession((state) => state.setAnonymous);

  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<ListResponse<Workspace>>("/v1/workspaces"),
  });
  const workspace = workspaces.data?.items[0];

  const members = useQuery({
    queryKey: ["members", workspace?.id],
    queryFn: () => api<ListResponse<Member>>(`/v1/workspaces/${workspace!.id}/members`),
    enabled: !!workspace,
  });

  const connections = useQuery({
    queryKey: ["connections", workspace?.id],
    queryFn: () => api<ListResponse<LlmConnection>>(`/v1/workspaces/${workspace!.id}/llm-connections`),
    enabled: !!workspace,
  });

  const [provider, setProvider] = useState("dashscope");
  const [baseUrl, setBaseUrl] = useState("https://dashscope.aliyuncs.com/compatible-mode/v1");
  const [model, setModel] = useState("qwen-plus");
  const [apiKey, setApiKey] = useState("");

  const saveConnection = useMutation({
    mutationFn: () =>
      api<LlmConnection>(`/v1/workspaces/${workspace!.id}/llm-connections`, {
        method: "POST",
        body: { provider, baseUrl, model, apiKey },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections", workspace!.id] });
      setApiKey("");
      message.success("模型连接已保存");
    },
    onError: (error) => message.error(problemMessage(error)),
  });

  const deleteConnection = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/v1/workspaces/${workspace!.id}/llm-connections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections", workspace!.id] });
      message.success("连接已删除");
    },
    onError: (error) => message.error(problemMessage(error)),
  });

  const signOut = async () => {
    await logoutRequest();
    queryClient.clear();
    setAnonymous();
    navigate("/login", { replace: true });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">SETTINGS</div>
          <h1 className="page-title">工作区设置</h1>
          <p className="page-subtitle">管理身份、成员与模型连接。</p>
        </div>
        <Button icon={<LogoutOutlined />} onClick={() => void signOut()}>
          退出登录
        </Button>
      </div>

      <div className="split-2">
        <div className="panel">
          <h3 className="panel__title">账号</h3>
          <div className="form-grid">
            <div>
              <div className="dim" style={{ fontSize: 10, marginBottom: 4 }}>显示名称</div>
              <div>{user?.displayName}</div>
            </div>
            <div>
              <div className="dim" style={{ fontSize: 10, marginBottom: 4 }}>邮箱</div>
              <div className="mono">{user?.email}</div>
            </div>
            <div>
              <div className="dim" style={{ fontSize: 10, marginBottom: 4 }}>当前工作区</div>
              <div>{workspace?.name ?? "—"} {workspace && <Tag style={{ marginLeft: 6 }}>{workspace.role}</Tag>}</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <h3 className="panel__title">成员</h3>
          <Table<Member>
            rowKey="userId"
            size="small"
            pagination={false}
            loading={members.isLoading}
            dataSource={members.data?.items ?? []}
            columns={[
              { title: "成员", dataIndex: "displayName" },
              { title: "邮箱", dataIndex: "email", render: (value: string) => <span className="mono dim">{value}</span> },
              { title: "角色", dataIndex: "role", width: 90, render: (value: string) => <Tag>{value}</Tag> },
              {
                title: "加入时间",
                dataIndex: "joinedAt",
                width: 170,
                render: (value: string) => <span className="dim">{formatTime(value)}</span>,
              },
            ]}
          />
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h3 className="panel__title">模型连接</h3>
        <p className="muted" style={{ fontSize: 11, marginTop: 0, lineHeight: 1.7 }}>
          密钥使用 AES-256-GCM 加密存储，接口不会回显明文。若服务端开启 <span className="mono">LLM_MOCK=true</span>，
          运行会使用内置演示模型，真实连接不会生效。
        </p>

        <div className="form-grid form-grid--2" style={{ marginBottom: 14 }}>
          <div>
            <div className="dim" style={{ fontSize: 10, marginBottom: 4 }}>Provider</div>
            <Input value={provider} onChange={(event) => setProvider(event.target.value)} />
          </div>
          <div>
            <div className="dim" style={{ fontSize: 10, marginBottom: 4 }}>Model</div>
            <Input value={model} onChange={(event) => setModel(event.target.value)} />
          </div>
          <div>
            <div className="dim" style={{ fontSize: 10, marginBottom: 4 }}>Base URL</div>
            <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </div>
          <div>
            <div className="dim" style={{ fontSize: 10, marginBottom: 4 }}>API Key</div>
            <Input.Password
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
            />
          </div>
        </div>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saveConnection.isPending}
          disabled={!workspace || !apiKey}
          onClick={() => saveConnection.mutate()}
        >
          保存连接
        </Button>

        <div style={{ marginTop: 16 }}>
          {(connections.data?.items ?? []).map((connection) => (
            <div className="connection-row" key={connection.id}>
              <Tag color="gold">{connection.provider}</Tag>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12 }}>{connection.model}</div>
                <div className="mono dim" style={{ fontSize: 10 }}>{connection.baseUrl}</div>
              </div>
              <span className="spacer" />
              <span className="dim" style={{ fontSize: 10 }}>{formatTime(connection.updatedAt)}</span>
              <Button
                danger
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => deleteConnection.mutate(connection.id)}
              />
            </div>
          ))}
          {!connections.isLoading && (connections.data?.items.length ?? 0) === 0 && (
            <div className="dim" style={{ fontSize: 11 }}>还没有配置模型连接。</div>
          )}
        </div>
      </div>
    </div>
  );
}
