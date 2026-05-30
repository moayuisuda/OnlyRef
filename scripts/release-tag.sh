#!/usr/bin/env bash
# 用法: ./scripts/release-tag.sh <版本号>
# 示例: ./scripts/release-tag.sh 1.0.5 或 ./scripts/release-tag.sh v1.0.5
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法: ./scripts/release-tag.sh <版本号>" >&2
  echo "示例: ./scripts/release-tag.sh 1.0.5 或 ./scripts/release-tag.sh v1.0.5" >&2
  exit 1
fi

INPUT_VERSION="$1"
if [[ "$INPUT_VERSION" == v* ]]; then
  TAG="$INPUT_VERSION"
  SEMVER="${INPUT_VERSION#v}"
else
  TAG="v$INPUT_VERSION"
  SEMVER="$INPUT_VERSION"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_JSON="$ROOT_DIR/app/package.json"

cd "$ROOT_DIR"

# ── 校验工作区干净 ────────────────────────────────────────────
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "当前有已跟踪文件的未提交改动，请先提交或清理后再执行。" >&2
  exit 1
fi

# ── 检查 tag 是否已存在 ───────────────────────────────────────
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "本地 tag 已存在：$TAG" >&2
  exit 1
fi

# ── 更新 app/package.json version ────────────────────────────
if [[ ! -f "$PACKAGE_JSON" ]]; then
  echo "找不到 package.json：$PACKAGE_JSON" >&2
  exit 1
fi

# 用环境变量传路径，避免 bash 在 Windows 上转义路径
OLD_VERSION="$(PACKAGE_FILE="$PACKAGE_JSON" node -e "
const fs = require('fs');
const json = JSON.parse(fs.readFileSync(process.env.PACKAGE_FILE, 'utf8'));
process.stdout.write(json.version);
")"

PACKAGE_FILE="$PACKAGE_JSON" NEW_VERSION="$SEMVER" node -e "
const fs = require('fs');
const json = JSON.parse(fs.readFileSync(process.env.PACKAGE_FILE, 'utf8'));
json.version = process.env.NEW_VERSION;
fs.writeFileSync(process.env.PACKAGE_FILE, JSON.stringify(json, null, 2) + '\n', 'utf8');
"

echo "已更新 app/package.json: $OLD_VERSION -> $SEMVER"

# ── git commit + tag + push ───────────────────────────────────
git add "$PACKAGE_JSON"
git commit -m "chore(release): bump version to $TAG"
git tag "$TAG"
git push origin "$TAG"

echo ""
echo "✅ 发布完成：$TAG"
echo "   GitHub Actions 将自动构建并发布 Release。"