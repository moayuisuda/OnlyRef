# PicPin Release Guide

本文档说明 PicPin 的发布流程，确保应用内自动更新功能正常工作。

## 1. 准备版本号

发布前先更新 `app/package.json` 中的 `version` 字段。自动更新只会识别比当前安装版本更高的版本号。

## 2. 触发发布流水线

推荐通过 tag 触发当前仓库的 GitHub Actions：

```bash
git tag v1.0.5
git push origin v1.0.5
```

Windows 和 macOS 流水线会在当前仓库构建产物，并把自动更新所需文件上传到同一个 GitHub Release。

## 3. 自动更新资源清单

Windows Release 必须包含：

| 文件 | 用途 |
| :--- | :--- |
| `PicPin.Setup.x.x.x.exe` | 安装包 |
| `PicPin.Setup.x.x.x.exe.blockmap` | 增量更新校验文件 |
| `latest.yml` | Windows 更新元数据 |

macOS Release 必须包含：

| 文件 | 用途 |
| :--- | :--- |
| `PicPin-x.x.x.dmg` | 安装包 |
| `PicPin-x.x.x.dmg.blockmap` | 增量更新校验文件 |
| `PicPin-x.x.x-mac.zip` | 自动更新替换包 |
| `PicPin-x.x.x-mac.zip.blockmap` | 增量更新校验文件 |
| `latest-mac.yml` | macOS 更新元数据 |

不要手动改名构建产物，`latest.yml` / `latest-mac.yml` 中的 `path` 必须和实际文件名一致。Windows 自动更新资产名不要包含空格，避免 GitHub Release 上传后资产名被规范化，导致元数据下载地址 404。

## 4. 更新源

应用内自动更新读取当前仓库 Release 的下载地址：

```text
https://xget-5sd.pages.dev/gh/moayuisuda/OnlyRef/releases/latest/download
```

发布 Release 时需要确保该 Release 被标记为 latest，否则客户端可能检测不到新版本。

## 5. PiCaptain 用户升级

安装项目依赖后，退出 PiCaptain 和 PicPin，在仓库根目录手动运行迁移脚本。需要 Node.js 22.6 或更高版本。

```bash
node --experimental-strip-types scripts/migrate-picpin.ts --dry-run
node --experimental-strip-types scripts/migrate-picpin.ts
```

脚本从系统配置目录下的 PiCaptain 读取图库位置，向 PicPin 目录写入 `storage.json`。可通过 `--source` 和 `--target` 指定配置目录。重复运行时会检查目标配置，目标指向其他图库时停止。

图片、索引、标签、设置和模型继续使用原图库路径。PicPin 首次启动会初始化新配置目录内的 Python 运行环境。应用启动时只读取 PicPin 的配置。

打包时沿用已发布的应用标识 `com.picaptain.app` 和现有更新源，以便旧客户端识别升级包。
