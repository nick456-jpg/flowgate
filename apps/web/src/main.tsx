import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App as AntApp, ConfigProvider } from "antd";
import { App } from "./App";
import { bootstrapSession } from "./lib/api";
import { queryClient } from "./lib/query";
import { useSession } from "./stores/session";
import { flowgateTheme } from "./theme";
import "./styles.css";

function Bootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useSession((state) => state.setUser);
  const setAnonymous = useSession((state) => state.setAnonymous);

  useEffect(() => {
    let alive = true;
    void bootstrapSession().then((user) => {
      if (!alive) return;
      if (user) setUser(user);
      else setAnonymous();
    });
    return () => {
      alive = false;
    };
  }, [setUser, setAnonymous]);

  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider theme={flowgateTheme}>
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <Bootstrap>
            <App />
          </Bootstrap>
        </AntApp>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
