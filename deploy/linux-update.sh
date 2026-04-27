#!/usr/bin/env bash
#
# HoldemAccount · Linux 更新部署脚本
#
# 拉新代码后执行：应用新的依赖、跑迁移、重新构建 H5、重启 PM2 服务。
# 不会重写 .env，不会动 HTTPS 证书。
#
# 用法：
#   cd /opt/holdem && git pull
#   sudo bash deploy/linux-update.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "❌ 请用 sudo/root 运行"
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"
echo "📂 仓库路径: $REPO_DIR"

# 读出前次 setup 选定的域名（从已有 nginx 配置里抓）
DOMAIN=""
if [[ -f /etc/nginx/sites-available/holdem ]]; then
  DOMAIN="$(grep -m1 'server_name' /etc/nginx/sites-available/holdem | awk '{print $2}' | tr -d ';')"
fi
if [[ -z "$DOMAIN" ]]; then
  read -rp "👉 未检测到既有 Nginx 配置，请手动输入对外域名: " DOMAIN
fi
echo "🌐 使用域名: $DOMAIN"

# ─── 服务端 ───
cd "$REPO_DIR/server"
echo "📦 更新服务端依赖…"
npm ci --no-audit --no-fund

echo "🗃️  应用数据库迁移（如有）…"
npx prisma migrate deploy

echo "🔨 构建服务端…"
npm run build

# ─── 客户端 H5 ───
cd "$REPO_DIR"
echo "📦 更新客户端依赖…"
npm ci --no-audit --no-fund
echo "🔨 构建 H5（API = https://${DOMAIN}/api）…"
VITE_API_BASE="https://${DOMAIN}/api" npm run build:h5

# ─── 重启 PM2 ───
echo "♻️  重启 PM2 holdem…"
if pm2 describe holdem >/dev/null 2>&1; then
  pm2 restart holdem --update-env
else
  cd "$REPO_DIR/server"
  pm2 start dist/server.js --name holdem --update-env
  pm2 save
fi

# ─── Nginx reload（若模板有改动） ───
if [[ -f "$REPO_DIR/deploy/nginx.conf.template" ]]; then
  echo "🌐 检查 Nginx 模板是否更新…"
  TMP=$(mktemp)
  H5_DIR="$REPO_DIR/dist/build/h5"
  sed -e "s|__DOMAIN__|${DOMAIN}|g" \
      -e "s|__H5_DIR__|${H5_DIR}|g" \
      -e "s|__SERVER_PORT__|3000|g" \
      "$REPO_DIR/deploy/nginx.conf.template" > "$TMP"
  # certbot 会在原配置里插入 443 server 块，不能直接覆盖。只提示人工 diff。
  if ! diff -q "$TMP" /etc/nginx/sites-available/holdem >/dev/null 2>&1; then
    echo "ℹ️  deploy/nginx.conf.template 与现有 /etc/nginx/sites-available/holdem 不同；"
    echo "    如需套用新模板请手动合并（certbot 之前修改过 443 server 块，直接覆盖会丢失 HTTPS 配置）"
  fi
  rm "$TMP"
fi

nginx -t >/dev/null && systemctl reload nginx

echo
echo "══════════════════════════════════════════"
echo "✅ 更新完成"
echo "  https://${DOMAIN}"
echo "  pm2 status   查看进程"
echo "  pm2 logs holdem --lines 50   看日志"
echo "══════════════════════════════════════════"
