#!/usr/bin/env bash
#
# HoldemAccount · Linux 一键首次部署脚本
#
# 目标机器：Ubuntu 22.04 / Debian 12，需要 sudo 或 root。
# 幂等：失败后可重跑；已装的组件会跳过。
#
# 用法：
#   git clone <repo> /opt/holdem
#   cd /opt/holdem
#   sudo bash deploy/linux-setup.sh

set -euo pipefail

# ─────────────────────────────────────────────
# 0. 预检 & 输入
# ─────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "❌ 请用 sudo/root 运行"
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"
echo "📂 仓库路径: $REPO_DIR"

read -rp "👉 输入对外域名（例 holdem.example.com）: " DOMAIN
if [[ -z "${DOMAIN}" ]]; then
  echo "❌ 域名不能为空"
  exit 1
fi
read -rp "👉 证书联系邮箱（Let's Encrypt 用，例 you@mail.com）: " EMAIL
if [[ -z "${EMAIL}" ]]; then
  echo "❌ 邮箱不能为空"
  exit 1
fi
read -rp "👉 管理员登录名（默认 root）: " ADMIN_USER
ADMIN_USER="${ADMIN_USER:-root}"
read -rsp "👉 管理员初始密码（首次登录强制改）: " ADMIN_PWD
echo
if [[ -z "${ADMIN_PWD}" || ${#ADMIN_PWD} -lt 8 ]]; then
  echo "❌ 初始密码至少 8 位"
  exit 1
fi
read -rp "👉 显示名（默认 Root）: " ADMIN_DISPLAY
ADMIN_DISPLAY="${ADMIN_DISPLAY:-Root}"

SERVER_PORT=3000

# ─────────────────────────────────────────────
# 1. 系统依赖
# ─────────────────────────────────────────────
echo "📦 安装系统依赖 (git, curl, build-essential, nginx, certbot, sqlite3)…"
apt-get update -qq
apt-get install -yq git curl ca-certificates build-essential nginx certbot python3-certbot-nginx sqlite3

# ─────────────────────────────────────────────
# 2. Node 20（若未安装）
# ─────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  echo "📦 安装 Node.js 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -yq nodejs
else
  echo "✅ Node $(node -v) 已安装"
fi

# ─────────────────────────────────────────────
# 3. PM2
# ─────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  echo "📦 安装 PM2…"
  npm install -g pm2
else
  echo "✅ PM2 已安装"
fi

# ─────────────────────────────────────────────
# 4. 服务端依赖 & .env
# ─────────────────────────────────────────────
cd "$REPO_DIR/server"
echo "📦 安装服务端依赖…"
npm ci --no-audit --no-fund

ENV_FILE="$REPO_DIR/server/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "ℹ️  检测到已有 server/.env，保留不覆盖；如需重置请手动删除"
else
  echo "🔐 生成 server/.env …"
  ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  cat > "$ENV_FILE" <<EOF
DATABASE_URL="file:./data/holdem.db"

JWT_ACCESS_SECRET="${ACCESS_SECRET}"
JWT_REFRESH_SECRET="${REFRESH_SECRET}"
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000

PORT=${SERVER_PORT}
HOST=127.0.0.1
CORS_ORIGIN="https://${DOMAIN}"

ADMIN_USERNAME=${ADMIN_USER}
ADMIN_INITIAL_PASSWORD=${ADMIN_PWD}
ADMIN_DISPLAY_NAME=${ADMIN_DISPLAY}

ARGON_MEMORY=65536
ARGON_TIME=3
ARGON_PARALLELISM=1
EOF
  chmod 600 "$ENV_FILE"
fi

echo "🗃️  初始化数据库 & 种子账号…"
mkdir -p "$REPO_DIR/server/data"
npx prisma migrate deploy
npm run db:seed || echo "ℹ️  seed 可能因为用户已存在而跳过，无碍"

echo "🔨 构建服务端 TS…"
npm run build

# ─────────────────────────────────────────────
# 5. 客户端 H5 构建
# ─────────────────────────────────────────────
cd "$REPO_DIR"
echo "📦 安装客户端依赖…"
npm ci --no-audit --no-fund
echo "🔨 构建 H5（API = https://${DOMAIN}/api）…"
VITE_API_BASE="https://${DOMAIN}/api" npm run build:h5

H5_DIR="$REPO_DIR/dist/build/h5"
if [[ ! -d "$H5_DIR" ]]; then
  echo "❌ H5 构建失败：未找到 $H5_DIR"
  exit 1
fi

# ─────────────────────────────────────────────
# 6. Nginx 配置（HTTP 先起，供 certbot 校验）
# ─────────────────────────────────────────────
NGX_SITE="/etc/nginx/sites-available/holdem"
NGX_ENABLED="/etc/nginx/sites-enabled/holdem"
echo "🌐 写入 Nginx 配置…"
TEMPLATE="$REPO_DIR/deploy/nginx.conf.template"
sed -e "s|__DOMAIN__|${DOMAIN}|g" \
    -e "s|__H5_DIR__|${H5_DIR}|g" \
    -e "s|__SERVER_PORT__|${SERVER_PORT}|g" \
    "$TEMPLATE" > "$NGX_SITE"
ln -sf "$NGX_SITE" "$NGX_ENABLED"

# 关闭默认站点，避免 80 端口被占
if [[ -L /etc/nginx/sites-enabled/default ]]; then
  rm /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl reload nginx

# ─────────────────────────────────────────────
# 7. 启 PM2 服务
# ─────────────────────────────────────────────
cd "$REPO_DIR/server"
if pm2 describe holdem >/dev/null 2>&1; then
  echo "♻️  PM2 已有 holdem 进程，执行 restart"
  pm2 restart holdem --update-env
else
  echo "🚀 启动 PM2 holdem…"
  pm2 start dist/server.js --name holdem --update-env
fi
pm2 save
# 开机自启：仅第一次需要
pm2 startup systemd -u root --hp /root >/tmp/pm2-startup.out 2>&1 || true

# ─────────────────────────────────────────────
# 8. Certbot HTTPS
# ─────────────────────────────────────────────
echo "🔒 使用 certbot 签发证书…"
if ! certbot certificates 2>/dev/null | grep -q "Domains:.*${DOMAIN}"; then
  certbot --nginx -d "${DOMAIN}" --email "${EMAIL}" --agree-tos --non-interactive --redirect
else
  echo "✅ 证书已存在，跳过签发"
fi

nginx -t
systemctl reload nginx

# ─────────────────────────────────────────────
# 9. 安装每日备份
# ─────────────────────────────────────────────
echo "💾 安装每日 SQLite 备份 cron…"
install -m755 "$REPO_DIR/deploy/backup-sqlite.sh" /etc/cron.daily/holdem-backup
# 让脚本知道 DB 路径
sed -i "s|__DB_PATH__|${REPO_DIR}/server/data/holdem.db|g" /etc/cron.daily/holdem-backup

# ─────────────────────────────────────────────
# 10. 完成
# ─────────────────────────────────────────────
echo
echo "══════════════════════════════════════════"
echo "✅ 部署完成"
echo "  访问: https://${DOMAIN}"
echo "  登录: ${ADMIN_USER} / <你刚刚输入的初始密码>"
echo "  首次登录会强制改密。"
echo
echo "常用：给用户开账号"
echo "  cd ${REPO_DIR}/server"
echo "  npm run admin:create-user -- --username alice --password temp1234 --display Alice"
echo
echo "更新发版："
echo "  cd ${REPO_DIR} && git pull && sudo bash deploy/linux-update.sh"
echo "══════════════════════════════════════════"
