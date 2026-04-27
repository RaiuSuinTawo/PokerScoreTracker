#!/usr/bin/env bash
#
# HoldemAccount · 每日 SQLite 热备份
#
# linux-setup.sh 会把本脚本 install 到 /etc/cron.daily/holdem-backup，
# 并把 __DB_PATH__ 替换成真实 DB 路径。
#
# 默认保留 30 天，备份文件形如
#   /backups/holdem/holdem-2026-04-21.db
#
# SQLite 的 `.backup` 命令走独占只读事务，几毫秒完成，不会影响写入。

set -euo pipefail

DB_PATH="__DB_PATH__"
BACKUP_DIR="/backups/holdem"
RETAIN_DAYS=30

if [[ ! -f "$DB_PATH" ]]; then
  echo "[holdem-backup] DB not found: $DB_PATH" >&2
  exit 0
fi

mkdir -p "$BACKUP_DIR"

DATE=$(date +%F)
OUT="${BACKUP_DIR}/holdem-${DATE}.db"

# 使用 sqlite3 的 .backup 做热备份
sqlite3 "$DB_PATH" ".backup '${OUT}'"
chmod 600 "$OUT"

# 清理旧备份
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'holdem-*.db' -mtime +${RETAIN_DAYS} -delete

echo "[holdem-backup] wrote ${OUT}"
