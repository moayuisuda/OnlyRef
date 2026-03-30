# Server Directory Agents

本目录包含应用的“后端”代码（本地 API 服务与向量服务），由 Electron 主进程启动。

## 职责
- **Local API (`server.ts`)**
  - 启动本地 Express 服务（默认端口 `30001`），为前端与插件提供 REST API。
-  - 管理本地数据存储：图片文件、元数据、画布数据与图库排序字段（SQLite）。
  - 提供 settings 聚合接口 `/settings`，用于一次性读取 settings.json。
  - 开发阶段不做旧数据兼容；存储格式不兼容时返回错误并提示重置数据目录。
  - 当前判定为“不兼容”的情况：
    - `image` 路径不是 `images/` 开头
    - `tags` / `vector` / `dominantColor` 的类型不合法（例如 tags 不是数组）
  - 新增字段缺失不视为不兼容：例如 `name` 通常会从 `image` 文件名推导并在读/索引时补齐；但对 x.com/twitter.com 与 pinterest.* 页面来源的采集，如果扩展未解析到 `name`，服务端会保持为空，前端据此不展示 name。
  - 提供索引相关 API：重新索引、批量索引缺失向量（`/api/index-missing`）。
-  - 检索 API 统一为 `/api/images`，文本与向量通过 `mode` 切换，返回结果带 `isVectorResult` 标记。
-  - 搜索响应策略：文本结果先返回，向量结果异步请求后合并展示。
  - **搜索优化**：CLIP 向量检索前，会自动调用免费翻译 API 将搜索词转换为英文，以提高非英文搜索的匹配准确度。
-  - 颜色/色调过滤在 SQL 内完成，分页游标与过滤条件一致。
-  - 颜色相似度使用 OKLCH 距离，OKLCH 分量持久化并建索引。
  - 提供元数据更新 API：Tag 更新、主体色（dominantColor）更新、名称（name）更新（用于右键菜单编辑与文件名搜索）。
  - **并发控制**：通过 `fileLock.ts` 的 `KeyedMutex`/`lockedFs` 将本地文件读写串行化。
  - 异步的颜色/色调处理使用独立错误捕获，避免未处理拒绝中断主流程。
  - 模型目录 `model/` 与 `images/`、`canvas_temp/`、`canvases/` 同级，位于 storage 根目录下。
  - images 路由统一游标解析与 nextCursor 生成，减少分页分支重复。
- **Database (`db.ts`)**
  - 所有更新语句使用完整命名参数绑定，避免遗漏导致运行时错误。
  - 向量写入与检索使用 `Float32Array` 绑定，确保 sqlite-vec 参数类型稳定。
  - 向量写入前保证 rowid 为整数，vss 查询候选量设置上限避免大 offset 开销。
-  - 文本检索与向量检索使用游标分页（createdAt/rowid 与 distance/rowid），颜色过滤在 SQL 内执行。
- **Python Vector Service (`python/tagger.py`)**
  - 常驻加载 CLIP 模型，提供图片/文本向量生成能力。
  - 提供图片主体色提取能力（偏向高色彩像素聚合），用于颜色过滤。
  - 通过 stdio 与 Node 侧队列请求进行通信。
  - **日志机制**：
    - Python 侧部分信息会写到 stderr（例如 uv 的输出）。
    - Node 侧解析 stderr，按 INFO/WARN/ERROR 前缀与关键字归类，避免将普通信息误记为错误。
  - 默认使用 `CLIPModel`/`CLIPProcessor`，处理器固定 `use_fast=True`，当前模型为 `openai/clip-vit-large-patch14`。
  - uv 由主进程统一自动下载到 `userData/uv` 并注入环境变量；服务侧支持通过 `PROREF_UV_PATH` 覆盖路径。
  - 使用 `PROREF_MODEL_DIR` 指定模型目录；启动时可触发下载并输出进度事件。
  - 权重下载支持字节级进度事件（`file-progress`），用于大文件进度展示。

## 命令行使用
- **下载/准备模型**
  - `cd app/backend/python && PROREF_MODEL_DIR=/abs/storage/model uv run python tagger.py --download-model`
- **提取图片主体色（dominantColor）**
  - `echo '{"mode":"dominant-color","arg":"/abs/path/to/image.png"}' | (cd app/backend/python && PROREF_MODEL_DIR=/abs/storage/model uv run python tagger.py)`
- **生成图片向量**
  - `echo '{"mode":"encode-image","arg":"/abs/path/to/image.png"}' | (cd app/backend/python && PROREF_MODEL_DIR=/abs/storage/model uv run python tagger.py)`
- **生成文本向量**
  - `echo '{"mode":"encode-text","arg":"blue line on off-white background"}' | (cd app/backend/python && PROREF_MODEL_DIR=/abs/storage/model uv run python tagger.py)`
