# FlowGate Showcase

作品集展示页：真实界面截图、系统架构图、2 分钟演示录屏，以及编排放/运行/回放/分叉的产品说明。

## 本地打开

在仓库根目录：

```bash
node showcase/server.mjs
```

打开 <http://localhost:4173>。服务器带正确的 `text/vtt` / `video/mp4` MIME 与 Range 支持，视频章节和字幕可以正常定位。

也可以直接双击 `showcase/index.html`，但部分浏览器在 `file://` 下会限制字幕或视频 seek，建议使用上面的静态服务器。

## 素材

| 文件 | 说明 |
|---|---|
| `assets/architecture.svg` | FlowGate v1 架构图，由 `scripts/build-architecture.mjs` 生成 |
| `assets/login.png` / `workspace.png` / `editor.png` / `run.png` / `replay.png` / `fork.png` | 本地实例的真实截图（1600×925 CSS 视口，高 DPI 输出） |
| `assets/demo.mp4` | 1:55 的真实运行录屏，1920×1080，静音，带中文字幕 |
| `assets/demo.vtt` | 录屏字幕，共 11 条，与页面章节按钮对应 |
| `assets/poster.png` | 视频封面（回放到 seq 11 的画面） |

重新生成架构图：

```bash
node showcase/scripts/build-architecture.mjs
```

录屏流程与章节时间见 `index.html` 的 chapters 和 `assets/demo.vtt`。

## 章节

| 时间 | 章节 |
|---|---|
| 0:00 | 登录与工作区 |
| 0:22 | 打开管道 |
| 0:44 | 节点配置 |
| 0:54 | 发起运行 |
| 1:02 | 取消与恢复 |
| 1:26 | 回放 |
| 1:40 | 从步骤分叉 |
| 1:48 | 完成 |

录屏覆盖：登录 → 工作区 → 项目与运行历史 → 画布 → 提示词配置 → 运行 → 取消（保留已成功的 prompt）→ 恢复 → 按 seq 回放 → 从 prompt 分叉 → 分叉运行完成。模型调用使用 `LLM_MOCK`，提示词延迟 2.5s、HTTP 延迟 0.8s。

## 说明

- 按作品集需要，本项目**不提供在线 demo、不做页面托管**；页面中的“演示”是录屏。
- 录屏使用本地演示数据与 `LLM_MOCK` 演示模型，不调用真实模型 API。
- 页面、架构图、截图和视频均由本项目独立制作；参考项目仅用于产品结构参考，未复制其代码、素材或文案。
- 页面中的 GitHub 链接指向本仓库。
