import { useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { api, loginRequest, problemMessage, registerRequest } from "../lib/api";
import type { ListResponse, Workspace } from "../lib/types";
import { useSession } from "../stores/session";
import { Brand } from "../components/Brand";
import { Splash } from "../components/Splash";

type AuthMode = "login" | "signup";

type FormValues = {
  email: string;
  password: string;
  displayName?: string;
};

export function AuthPage({ mode }: { mode: AuthMode }) {
  const [form] = Form.useForm<FormValues>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const status = useSession((state) => state.status);
  const setUser = useSession((state) => state.setUser);
  const navigate = useNavigate();

  if (status === "loading") return <Splash label="正在恢复会话" />;
  if (status === "authenticated") return <Navigate to="/" replace />;

  const onFinish = async (values: FormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      const result =
        mode === "login"
          ? await loginRequest(values.email, values.password)
          : await registerRequest(values.email, values.password, values.displayName ?? "");
      setUser(result.user);
      const workspaces = await api<ListResponse<Workspace>>("/v1/workspaces");
      const target = workspaces.items[0];
      navigate(target ? `/w/${target.slug}` : "/", { replace: true });
    } catch (caught) {
      setError(problemMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="auth-page">
      <section className="auth-brand">
        <div>
          <Brand large />
          <div style={{ marginTop: 52 }}>
            <span className="auth-brand__eyebrow">Event-sourced pipelines</span>
            <h1>
              编排 AI 管道，
              <br />
              每一次运行都<em>可回放</em>。
            </h1>
            <p className="auth-brand__lead">
              FlowGate 把一次运行拆成可追溯的事件流。你可以暂停在半途、从任意成功步骤分叉，
              也可以在 worker 崩溃后继续跑完。
            </p>
          </div>

          <div className="auth-points">
            <div className="auth-point">
              <span className="auth-point__index">01</span>
              <div className="auth-point__text">
                事件日志而不是黑盒状态
                <span>run / step / journal event 三层模型，回放精确到 seq。</span>
              </div>
            </div>
            <div className="auth-point">
              <span className="auth-point__index">02</span>
              <div className="auth-point__text">
                断点恢复与步骤分叉
                <span>复用已成功的上游输出，只重跑你需要的那一段。</span>
              </div>
            </div>
            <div className="auth-point">
              <span className="auth-point__index">03</span>
              <div className="auth-point__text">
                面向生产的执行控制
                <span>租约、心跳、取消、重试与崩溃恢复全部落在数据库里。</span>
              </div>
            </div>
          </div>
        </div>
        <div className="auth-foot">
          <span>FLOWGATE / 2026</span>
          <span>DAG STUDIO</span>
          <span>POSTGRES + REDIS</span>
        </div>
      </section>

      <section className="auth-side">
        <div className="auth-card">
          <h2>{isLogin ? "回到编排台" : "创建你的工作区"}</h2>
          <p className="auth-card__sub">
            {isLogin
              ? "使用邮箱登录，继续上次的管道与运行。"
              : "注册后会自动创建一个个人工作区，无需额外配置。"}
          </p>

          {error && (
            <Alert
              type="error"
              showIcon
              message={error}
              style={{ marginBottom: 14 }}
              closable
              onClose={() => setError(null)}
            />
          )}

          <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
            {!isLogin && (
              <Form.Item
                name="displayName"
                label="显示名称"
                rules={[{ required: true, message: "请输入显示名称" }]}
              >
                <Input placeholder="例如：罗同学" autoComplete="name" />
              </Form.Item>
            )}
            <Form.Item
              name="email"
              label="邮箱"
              rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}
            >
              <Input placeholder="you@example.com" autoComplete="email" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, min: 8, message: "密码至少 8 位" }]}
            >
              <Input.Password placeholder="至少 8 位" autoComplete={isLogin ? "current-password" : "new-password"} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={submitting} style={{ marginTop: 4 }}>
              {isLogin ? "登录" : "注册并进入"}
            </Button>
          </Form>

          {isLogin && (
            <div className="demo-hint">
              <span>
                演示账号 <code>demo@flowgate.dev</code> / <code>flowgate-demo</code>
              </span>
              <Button
                size="small"
                type="text"
                onClick={() => form.setFieldsValue({ email: "demo@flowgate.dev", password: "flowgate-demo" })}
              >
                填入
              </Button>
            </div>
          )}

          <div className="auth-card__switch">
            {isLogin ? (
              <>
                还没有账号？ <Link to="/signup">创建一个</Link>
              </>
            ) : (
              <>
                已有账号？ <Link to="/login">直接登录</Link>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
