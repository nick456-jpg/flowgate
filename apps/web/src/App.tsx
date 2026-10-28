import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Brand } from "./components/Brand";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthPage } from "./pages/AuthPage";
import { EditorPage } from "./pages/EditorPage";
import { HomeRedirect } from "./pages/HomeRedirect";
import { ProjectPage } from "./pages/ProjectPage";
import { RunPage } from "./pages/RunPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkspacePage } from "./pages/WorkspacePage";

function NotFound() {
  return (
    <div className="notfound">
      <div>
        <Brand large />
        <h2 style={{ marginTop: 22 }}>页面不存在</h2>
        <p className="muted" style={{ fontSize: 12 }}>检查一下地址，或回到工作区继续。</p>
        <a href="/">返回首页</a>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <AuthPage mode="login" /> },
  { path: "/signup", element: <AuthPage mode="signup" /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/", element: <HomeRedirect /> },
      {
        element: <AppShell />,
        children: [
          { path: "/w/:workspaceSlug", element: <WorkspacePage /> },
          { path: "/projects/:projectId", element: <ProjectPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
      { path: "/pipelines/:pipelineId", element: <EditorPage /> },
      { path: "/runs/:runId", element: <RunPage /> },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
