# Extension Directory Agents

本目录包含 Chrome 浏览器插件源码。

## 职责
- **Manifest V3**: 定义插件权限和配置。
- **Background Script (`background.js`)**:
    - 简单的 Service Worker，目前仅记录安装事件。
- **Content Script (`content.js`)**:
  - 监听网页图片的 `dragstart` 事件（根据站点策略初始化：Pinterest 用 `requestAnimationFrame` 轮询等待 DOM 标志以避开水合影响，默认等待 `window.load`）。
  - 针对 Pinterest 的 hover overlay，支持从卡片容器反查真实图片元素。
  - Pinterest 额外提取 Pin 标题作为 `name`（优先详情页 closeup title 的 h1，其次卡片 footer title；获取不到则传空字符串）。
  - 使用 Ghost Image 优化拖拽视觉效果。
  - 按站点（Twitter/X、Pinterest 等）使用 collector map 决定最终图片 URL。
  - 动态创建悬浮菜单（Floating Menu），显示默认文件夹和 Tag 文件夹。
    - 菜单根据图片位置自动定位（优先左侧，其次右侧）。
    - 支持将图片拖入菜单项进行采集。
    - 采集时附带选中的 Tag（如果有）。
    - Pinterest 优先从 `srcset` 选择最大档图片链接，并升级 pinimg 尺寸路径到 `originals`。
    - 样式适配暗色主题。

## 交互流程
1. 用户拖拽网页图片。
2. 插件显示悬浮菜单。
3. 用户将图片拖入菜单项。
4. 插件发送 HTTP POST 请求到 Electron 本地服务器（端口由扩展内 `API_PORT` 常量指定，例如 `http://localhost:30001/api/import`）。
5. Electron 服务下载图片、保存 Tag 并通知前端更新。
6. 插件在网页显示采集结果提示。
