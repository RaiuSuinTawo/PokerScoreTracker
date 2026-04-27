#!/usr/bin/env bash
#
# HoldemAccount · 微信小程序构建脚本
#
# 用法：
#   # 默认读 .env.production 中的 VITE_API_BASE；也可直接传参
#   bash deploy/build-mp-weixin.sh https://holdem.example.com/api
#
# 发版前请先对照 deploy/MINI_PROGRAM_CHECKLIST.md 走一遍。

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

API_BASE="${1:-${VITE_API_BASE:-}}"
if [[ -z "$API_BASE" ]]; then
  echo "❌ 请传入 API 基址，例："
  echo "   bash deploy/build-mp-weixin.sh https://holdem.example.com/api"
  exit 1
fi

echo "📝 使用 API: $API_BASE"

# 读取 manifest.json，若 appid 为空 → 阻止构建
APPID=$(node -e "const m=require('./src/manifest.json'); process.stdout.write(m['mp-weixin']?.appid||'')")
if [[ -z "$APPID" ]]; then
  echo "❌ src/manifest.json → mp-weixin.appid 为空，无法发版构建"
  echo "   请填真实 appid 后重试"
  exit 1
fi
echo "📝 使用 appid: $APPID"

# 构建
VITE_API_BASE="$API_BASE" npm run build:mp-weixin

OUT="$REPO_DIR/dist/build/mp-weixin"
if [[ ! -d "$OUT" ]]; then
  echo "❌ 构建失败：未找到 $OUT"
  exit 1
fi

echo
echo "✅ 小程序构建完成"
echo "   目录: $OUT"
echo "   下一步：打开微信开发者工具 → 导入项目 → 选择上面的目录 → 上传"
echo "   发版 checklist: $REPO_DIR/deploy/MINI_PROGRAM_CHECKLIST.md"
