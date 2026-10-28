import { useEffect } from "react";
import { Avatar, Dropdown, Select, type MenuProps } from "antd";
import { LogoutOutlined, SettingOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "./Brand";
import { api, logoutRequest } from "../lib/api";
import type { ListResponse, Workspace } from "../lib/types";
import { useSession } from "../stores/session";

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const user = useSession((state) => state.user);
  const setAnonymous = useSession((state) => state.setAnonymous);

  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<ListResponse<Workspace>>("/v1/workspaces"),
  });

  const match = location.pathname.match(/^\/w\/([^/]+)/);
  const stored = localStorage.getItem("flowgate:workspace");
  const currentSlug = match?.[1] ?? stored ?? workspaces.data?.items[0]?.slug ?? "";
  const currentWorkspace =
    workspaces.data?.items.find((item) => item.slug === currentSlug) ?? workspaces.data?.items[0];

  useEffect(() => {
    if (currentWorkspace) localStorage.setItem("flowgate:workspace", currentWorkspace.slug);
  }, [currentWorkspace]);

  const signOut = async () => {
    await logoutRequest();
    queryClient.clear();
    setAnonymous();
    navigate("/login", { replace: true });
  };

  const items: MenuProps["items"] = [
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "工作区设置",
      onClick: () => navigate("/settings"),
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      onClick: () => void signOut(),
    },
  ];

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link to="/" style={{ textDecoration: "none" }}>
          <Brand />
        </Link>

        <Select
          className="workspace-switcher"
          value={currentWorkspace?.slug}
          placeholder="选择工作区"
          loading={workspaces.isLoading}
          options={workspaces.data?.items.map((item) => ({ label: item.name, value: item.slug }))}
          onChange={(slug) => {
            const workspace = workspaces.data?.items.find((item) => item.slug === slug);
            if (workspace) {
              localStorage.setItem("flowgate:workspace", workspace.slug);
              navigate(`/w/${workspace.slug}`);
            }
          }}
        />

        <nav className="app-nav">
          <Link
            to={currentWorkspace ? `/w/${currentWorkspace.slug}` : "/"}
            className={location.pathname.startsWith("/w/") ? "active" : ""}
          >
            项目
          </Link>
          <Link to="/settings" className={location.pathname === "/settings" ? "active" : ""}>
            设置
          </Link>
        </nav>

        <div className="spacer" />

        <Dropdown menu={{ items }} trigger={["click"]}>
          <div className="user-chip">
            <Avatar size={24} style={{ background: "#f59e0b", color: "#15181f", fontSize: 11 }}>
              {user?.displayName?.slice(0, 1).toUpperCase()}
            </Avatar>
            <span>{user?.displayName}</span>
          </div>
        </Dropdown>
      </header>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
