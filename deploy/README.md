# deploy/

部署脚本与配置模板。

| 文件 | 用途 |
|---|---|
| `linux-setup.sh` | **首次**部署（Ubuntu/Debian，交互式，需要 sudo）。装 Node/nginx/certbot/pm2、生成 .env 与 JWT 密钥、migrate+seed、构建 H5、上 HTTPS、装每日备份。幂等可重跑。 |
| `linux-update.sh` | **后续**更新部署。拉新代码后执行：装依赖 → 迁移 → 重新构建 → 重启 PM2。 |
| `backup-sqlite.sh` | 每日 SQLite 热备份模板。setup 脚本会自动 install 到 `/etc/cron.daily/holdem-backup`。 |
| `nginx.conf.template` | Nginx 站点模板，`__DOMAIN__ __H5_DIR__ __SERVER_PORT__` 三个占位，由 setup 脚本替换。certbot 会在此基础上追加 443 块。 |
| `Dockerfile` | 服务端容器镜像（多阶段），产物 `holdem-server:latest`。 |
| `docker-compose.yml` | Docker 一键起服务，绑定本机 3000 端口；前面仍建议自己挂 Nginx 反代并托管 H5。 |
| `build-mp-weixin.sh` | 微信小程序构建包装，注入 `VITE_API_BASE`，校验 appid 已填。 |
| `MINI_PROGRAM_CHECKLIST.md` | 小程序发版前逐项 checklist + 预审自测剧本。 |

---

## 典型用法

### 首次部署（Linux 原生）

```bash
git clone <你的仓库地址> /opt/holdem
cd /opt/holdem
sudo bash deploy/linux-setup.sh
# 按提示输入：域名 / 证书邮箱 / 初始管理员账号 / 初始密码
```

一般 3-5 分钟完成。成功后访问 `https://你的域名/`。

### 更新发版

```bash
cd /opt/holdem
git pull
sudo bash deploy/linux-update.sh
```

### 小程序发版

```bash
cd /opt/holdem
bash deploy/build-mp-weixin.sh https://你的域名/api
# 用微信开发者工具打开 dist/build/mp-weixin/ 提交审核
```

### Docker 方案（备选）

```bash
cd /opt/holdem
cp server/.env.example server/.env
# 编辑 server/.env 填密钥与管理员密码

cd deploy
docker compose up -d --build
# 自行再起一层 Nginx 反代 443 → 容器 3000，并托管 H5 静态产物
```

---

## 重要运维

### 给用户开账号

```bash
cd /opt/holdem/server
npm run admin:create-user -- --username alice --password temp1234 --display "Alice"
```

### 手动触发备份（无需等到凌晨）

```bash
sudo /etc/cron.daily/holdem-backup
ls -lh /backups/holdem/
```

### 恢复某个备份

```bash
pm2 stop holdem
cp /backups/holdem/holdem-2026-04-20.db /opt/holdem/server/data/holdem.db
pm2 start holdem
```

### 查看日志

```bash
pm2 logs holdem --lines 100
pm2 monit
tail -f /var/log/nginx/error.log
```

### 证书续签

certbot 自带 systemd timer，每天自动尝试续签。手动：
```bash
sudo certbot renew
sudo systemctl reload nginx
```

### 彻底清库重装（危险）

```bash
pm2 stop holdem
rm -rf /opt/holdem/server/data/*.db* /opt/holdem/server/prisma/migrations
cd /opt/holdem
sudo bash deploy/linux-setup.sh   # 会重新生成 .env（如已存在会保留），重新 seed
```
