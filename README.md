# LookBack 专业图片参考器

面向美术人士的专业图片收集与参考工具，类似于 PureRef，但集成了浏览器采集功能。

## 功能特性

*   **浏览器采集插件**：在网页图片上右键，一键收藏到本地。由本地 Python + CLIP 服务直接看图打 Tag（不依赖页面标题）。
*   **本地瀑布流图库**：所有收藏的图片以瀑布流形式展示，支持 Tag 搜索。
*   **无限画布 (Canvas)**：类似 PureRef 的操作体验。
    *   从左侧图库拖拽图片到画布。
    *   支持图片拖拽移动、缩放 (滚轮)、删除 (选中后按 Delete)。
*   **窗口控制**：
    *   **Always on Top**: 点击标题栏 Pin 图标，保持窗口置顶。
    *   **Ghost Mode**: 点击标题栏幽灵图标，半透明显示，方便临摹。

## 安装与运行

### 1. 启动本地应用 (Electron)

确保已安装 Node.js。

```bash
cd app
npm install
npm run dev
```

应用启动后，会运行在 `localhost:30001` 监听来自插件的请求，并通过本地 Python 服务为图片生成 Tag。

### 2. 安装浏览器插件

1.  打开 Chrome/Edge 浏览器，进入扩展程序管理页面 (`chrome://extensions`)。
2.  开启右上角的 **开发者模式**。
3.  点击 **加载已解压的扩展程序**。
4.  选择本项目下的 `extension` 目录。

## 使用说明

1.  启动 Electron 应用。
2.  在浏览器中浏览图片网站（如 Pinterest, ArtStation）。
3.  在喜欢的图片上右键 -> **Collect to LookBack**。
4.  回到 LookBack 应用，图片会自动出现在左侧列表。
5.  将图片拖入右侧画布，自由排版。

## 技术栈

*   **Electron**: 桌面应用框架
*   **React + Vite**: 前端 UI
*   **TailwindCSS**: 样式
*   **Konva (react-konva)**: 高性能 Canvas 渲染
*   **Valtio**: 状态管理
*   **Express**: 本地通信服务器
*   **Python + CLIP (torch + open_clip)**: 本地图片内容打 Tag

## Python 打 Tag 环境（使用 uv）

后端的图片 Tag 完全由本地 Python + CLIP 负责，依赖如下：

- 依赖由 [`uv`](https://docs.astral.sh/uv/) 统一管理（Python / 依赖 / 虚拟环境）
- 主要依赖：`torch`、`transformers`、`Pillow`

### 自动初始化（推荐）

首次启动 LookBack 时会自动完成以下初始化：

- 自动下载 uv（如系统未安装）
- 使用 uv 在 `app/backend/python` 下创建/同步运行环境（根据 lockfile）
- 自动下载搜索模型文件（会弹出进度窗口）

不需要手动执行 `uv pip install ...` 或手动维护 `.venv`。

### 4. 自定义 CLIP 标签（tag_config.json）

CLIP 标签的类别和候选值由 `app/electron/tag_config.json` 控制，结构示例：

```json
{
  "categories": [
    {
      "name": "style",
      "template": "style of {}",
      "labels": ["anime", "pixel", "cyberpunk", "ink"]
    },
    {
      "name": "element",
      "template": "a photo of {}",
      "labels": ["apple", "moon", "cat", "starry sky", "rose", "coffee"]
    }
  ]
}
```

- `name`：在 LookBack 中输出的前缀，例如 `style:anime`。
- `labels`：这一类下所有候选标签，支持自由增删。
- `template`：生成 CLIP 文本 prompt 的模板，占位符 `{}` 会被替换成 label 文本。

你可以：

- 新增类别，例如 `subject`、`material` 等，自由定义自己的标签空间。
- 修改或扩展 `labels` 数组，加入自己常用的 tag。

如果配置文件无效或缺失，后端会回退到内置的默认配置，保证打 Tag 功能仍然可用。
