#!/usr/bin/env bash
# HoldemAccount — MySQL daily backup (via mysqldump)
#
# 用法：由 linux-setup.sh 安装到 /etc/cron.daily/holdem-backup
# 也可手动执行：sudo bash deploy/backup-mysql.sh
#
# 占位符 __DB_HOST__ __DB_USER__ __DB_PASS__ __DB_NAME__ 在安装时由 sed 替换。
#
# 微信云托管用户无需此脚本——平台自带 MySQL 自动备份。

set -euo pipefail

DB_HOST="__DB_HOST__"
DB_USER="__DB_USER__"
DB_PASS="__DB_PASS__"
DB_NAME="__DB_NAME__"

BACKUP_DIR="/backups/holdem"
DATE=$(date +%Y-%m-%d)
OUT="${BACKUP_DIR}/${DB_NAME}-${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" \
  --single-transaction --routines --triggers \
  "$DB_NAME" | gzip > "$OUT"

chmod 600 "$OUT"

# 保留 30 天
find "$BACKUP_DIR" -name "${DB_NAME}-*.sql.gz" -mtime +30 -delete

echo "[$(date)] backup → $OUT"
