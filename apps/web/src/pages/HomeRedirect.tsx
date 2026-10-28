import { useState } from "react";
import { Button, Input } from "antd";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, problemMessage } from "../lib/api";
import type { ListResponse, Workspace } from "../lib/types";
import { Splash } from "../components/Splash";

export function HomeRedirect() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("我的工作区");

  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<ListResponse<Workspace>>("/v1/workspaces"),
  });

  const create = useMutation({
    mutationFn: () => api<Workspace>("/v1/workspaces", { method: "POST", body: { name } }),
    onSuccess: (workspace) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      navigate(`/w/${workspace.slug}`, { replace: true });
    },
  });

  if (workspaces.isLoading) return <Splash />;
  if (workspaces.isError) {
    return (
      <div className="empty-state">
        <h3>无法读取工作区</h3>
        <p>{problemMessage(workspaces.error)}</p>
        <Button onClick={() => workspaces.refetch()}>重试</Button>
      </div>
    );
  }

  const items = workspaces.data?.items ?? [];
  if (items.length > 0) return <Navigate to={`/w/${items[0].slug}`} replace />;

  return (
    <div style={{ maxWidth: 480, margin: "80px auto" }}>
      <div className="panel">
        <div className="page-eyebrow">FIRST WORKSPACE</div>
        <h2 style={{ marginTop: 0 }}>创建第一个工作区</h2>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
          工作区用于隔离项目、管道、运行记录与模型连接。你之后可以随时新建更多工作区。
        </p>
        <Input value={name} onChange={(event) => setName(event.target.value)} style={{ marginBottom: 12 }} />
        <Button type="primary" block loading={create.isPending} onClick={() => create.mutate()}>
          创建工作区
        </Button>
        {create.isError && <div style={{ color: "#f87171", fontSize: 11, marginTop: 10 }}>{problemMessage(create.error)}</div>}
      </div>
    </div>
  );
}
