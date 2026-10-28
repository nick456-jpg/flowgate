import { useState } from "react";
import { Button, Input, Modal, Tag, message } from "antd";
import { ArrowRightOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, problemMessage } from "../lib/api";
import type { ListResponse, Project, Workspace } from "../lib/types";
import { formatTime } from "../lib/format";
import { Splash } from "../components/Splash";

export function WorkspacePage() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");

  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<ListResponse<Workspace>>("/v1/workspaces"),
  });
  const workspace = workspaces.data?.items.find((item) => item.slug === workspaceSlug);

  const projects = useQuery({
    queryKey: ["projects", workspace?.id],
    queryFn: () => api<ListResponse<Project>>(`/v1/workspaces/${workspace!.id}/projects`),
    enabled: !!workspace,
  });

  const create = useMutation({
    mutationFn: () =>
      api<Project>(`/v1/workspaces/${workspace!.id}/projects`, { method: "POST", body: { name } }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects", workspace!.id] });
      setModalOpen(false);
      setName("");
      message.success("项目已创建");
      navigate(`/projects/${project.id}`);
    },
    onError: (error) => message.error(problemMessage(error)),
  });

  if (workspaces.isLoading) return <Splash />;
  if (!workspace) {
    return (
      <div className="empty-state">
        <h3>工作区不存在</h3>
        <p>它可能已被删除，或者你没有访问权限。</p>
      </div>
    );
  }

  const items = projects.data?.items ?? [];
  const pipelineCount = items.reduce((total, project) => total + (project.pipelineCount ?? 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">WORKSPACE</div>
          <h1 className="page-title">{workspace.name}</h1>
          <p className="page-subtitle">
            把一条业务链路拆成可回放的管道。当前角色：
            <Tag style={{ marginLeft: 6 }}>{workspace.role}</Tag>
          </p>
        </div>
        <div className="toolbar">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            新建项目
          </Button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="stat__label">Projects</div>
          <div className="stat__value">{items.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Pipelines</div>
          <div className="stat__value">{pipelineCount}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Replay model</div>
          <div className="stat__value" style={{ fontSize: 17 }}>Event-sourced</div>
        </div>
      </div>

      {projects.isLoading ? (
        <Splash label="正在读取项目" />
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h3>还没有项目</h3>
          <p>一个项目可以包含多条管道，适合按业务域组织。</p>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            创建第一个项目
          </Button>
        </div>
      ) : (
        <div className="grid">
          {items.map((project) => (
            <div className="card" key={project.id} onClick={() => navigate(`/projects/${project.id}`)}>
              <span className="card__accent" />
              <div className="card__top">
                <h3 className="card__title">{project.name}</h3>
                <ArrowRightOutlined style={{ color: "#6f7888" }} />
              </div>
              <div className="card__meta">
                <span>{project.pipelineCount ?? 0} 条管道</span>
                <span>更新于 {formatTime(project.updatedAt)}</span>
              </div>
              <div className="card__foot">
                <span className="mono">{project.slug}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="新建项目"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => {
          if (!name.trim()) {
            message.warning("请输入项目名称");
            return;
          }
          create.mutate();
        }}
        confirmLoading={create.isPending}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="例如：线索运营"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onPressEnter={() => name.trim() && create.mutate()}
        />
      </Modal>
    </div>
  );
}
