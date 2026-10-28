import { Spin } from "antd";
import { Brand } from "./Brand";

export function Splash({ label = "正在载入工作区" }: { label?: string }) {
  return (
    <div className="splash">
      <Brand large />
      <Spin size="small" />
      <div className="splash__text">{label}</div>
    </div>
  );
}
