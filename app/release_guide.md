# LookBack Release Guide

本文档详细说明了 LookBack 应用的发布流程，确保自动更新（Auto Update）功能正常工作。

## 1. 准备工作

确保 `package.json` 中的 `version` 字段已更新。

```json
{
  "version": "0.0.1" // 每次发布必须递增版本号
}
```

## 2. 构建应用

在项目根目录 (`app/`) 执行构建命令：

### Windows
```bash
npm run build:win
```

### macOS
```bash
npm run build:mac
```

构建完成后，产物会生成在 `app/dist/` 目录下。

## 3. GitHub Release 上传清单

每次在 GitHub 创建新 Release 时，**必须**上传以下文件，否则自动更新将失效。

### Windows 必需文件
| 文件名示例 | 说明 | 必须性 |
| :--- | :--- | :--- |
| `LookBack-Setup-x.x.x.exe` | 安装包 | ✅ 必须 |
| `LookBack-Setup-x.x.x.exe.blockmap` | 增量更新校验文件 | ✅ 必须 |
| `latest.yml` | Windows 版本索引文件 | ✅ 必须 |

### macOS 必需文件
| 文件名示例 | 说明 | 必须性 |
| :--- | :--- | :--- |
| `LookBack-x.x.x.dmg` | 安装包 | ✅ 必须 |
| `LookBack-x.x.x.dmg.blockmap` | 增量更新校验文件 | ✅ 必须 |
| `LookBack-x.x.x-mac.zip` | 自动更新替换包 | ✅ 必须 |
| `latest-mac.yml` | macOS 版本索引文件 | ✅ 必须 |

> **注意**：请直接上传构建生成的原文件名，不要手动修改文件名。

## 4. 自动更新原理说明

我们配置了国内镜像加速源（`mirror.ghproxy.com`），更新流程如下：

1. 应用启动，请求 `https://mirror.ghproxy.com/https://github.com/anhaohui/RroRef/releases/latest/download/latest.yml`。
2. 即使你在 GitHub 还没有标记 `latest`，只要 Release 链接正确，镜像源通常能通过重定向找到最新版。
3. **最佳实践**：在 GitHub Release 页面发布时，勾选 **"Set as the latest release"**。

## 5. 常见问题

- **Q: 为什么更新下载很慢？**
  - A: 检查是否漏传了 `.blockmap` 文件。如果没有它，应用会下载完整的 `.exe` / `.dmg` 包，而不是几 KB 的差异包。

- **Q: 为什么检测不到更新？**
  - A: 检查 `latest.yml` 是否上传，以及 `package.json` 里的 `version` 是否真的比当前安装的版本号大。
