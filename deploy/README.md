# deploy/

部署脚本与配置模板。

| 文件 | 用途 |
|---|---|
| **`cloudrun-setup.md`** | **微信云托管部署指南**（推荐新手，免域名免备案） |
| `linux-setup.sh` | 自有服务器首次部署（Ubuntu/Debian，交互式）。装 Node/nginx/certbot/pm2、生成 .env、migrate+seed、构建 H5、上 HTTPS。 |
| `linux-update.sh` | 自有服务器后续更新。拉新代码后：装依赖 → 迁移 → 重新构建 → 重启 PM2。 |
| `backup-mysql.sh` | MySQL 每日备份模板（mysqldump + gzip，保留 30 天）。 |
| `backup-sqlite.sh` | [已弃用] SQLite 热备份，仅为旧部署保留。 |
| `nginx.conf.template` | Nginx 站点模板，`__DOMAIN__ __H5_DIR__ __SERVER_PORT__` 三个占位符。 |
| `Dockerfile` | 服务端容器镜像（多阶段），适用于云托管和 Docker 部署。 |
| `docker-compose.yml` | 本地开发 / 自有服务器容器化（含 MySQL 8 服务）。 |
| `build-mp-weixin.sh` | 微信小程序构建包装，注入 `VITE_API_BASE`，校验 appid 已填。 |
| `MINI_PROGRAM_CHECKLIST.md` | 小程序发版前逐项 checklist + 预审自测剧本。 |

---

## 典型用法

### 微信云托管部署（推荐新手）

详见 **[cloudrun-setup.md](./cloudrun-setup.md)**——10 步完成，不需要域名和服务器。

### 首次部署（自有 Linux 服务器）

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

**云托管方案**：
```bash
VITE_CLOUD_ENV=你的环境ID VITE_CLOUD_SERVICE=holdem npm run build:mp-weixin
# 用微信开发者工具打开 dist/build/mp-weixin/ 提交审核
```

**自有服务器方案**：
```bash
bash deploy/build-mp-weixin.sh https://你的域名/api
```

### Docker 方案（本地开发 / 自有服务器备选）

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

**云托管**：在服务 WebShell 里执行：
```bash
cd /app/server
npx tsx src/cli/create-user.ts -- --username alice --password temp1234 --display "Alice"
```

**自有服务器**：
```bash
cd /opt/holdem/server
npm run admin:create-user -- --username alice --password temp1234 --display "Alice"
```

### 手动触发备份（自有服务器）

```bash
sudo /etc/cron.daily/holdem-backup
ls -lh /backups/holdem/
```

### 恢复备份（自有服务器）

```bash
pm2 stop holdem
gunzip < /backups/holdem/holdem-2026-04-20.sql.gz | mysql -h localhost -u holdem -p holdem
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
