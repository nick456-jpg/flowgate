import type { ReactNode } from "react";
import {
  ApiOutlined,
  BranchesOutlined,
  FlagOutlined,
  FunctionOutlined,
  MessageOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";

export const NODE_ICONS: Record<string, ReactNode> = {
  play: <PlayCircleOutlined />,
  message: <MessageOutlined />,
  function: <FunctionOutlined />,
  branch: <BranchesOutlined />,
  api: <ApiOutlined />,
  flag: <FlagOutlined />,
};
