# PokerScoreTracker

A poker game scoring and statistics tracker for recording player scores and game results.

=======
# HoldemAccount · 德扑记账

多用户协作的德州扑克记账工具：客户端（uni-app + Vue 3）+ 服务端（Node.js + Fastify + SQLite）。

- **账号登录**（管理员预配置，首次登录强制改密）
- **账本协作**：创建账本生成 8 位序列号，朋友凭序列号加入自动添加 0 手玩家
- **买入审批流**：玩家申请 → 管理员批准；管理员给自己的自动批准（留审批流水）
- **公摊开销按盈利比例分配**（服务端权威数学，与客户端展示一致）
- **归档只读**：帐平时可归档，归档后全局只读，可删
- **个人中心 bankroll 曲线**：累计所有已归档账本的盈亏

---

## 目录结构

```
/
├── src/                     # uni-app 客户端（Vue 3 + TS + Pinia）
├── server/                  # Node.js 服务端（Fastify + Prisma + SQLite）
├── deploy/                  # 部署脚本与配置模板
│   ├── linux-setup.sh       # 首次 Linux 部署
│   ├── linux-update.sh      # 更新重启
│   ├── backup-sqlite.sh     # 每日备份（放到 /etc/cron.daily/）
│   ├── nginx.conf.template  # Nginx 反代 + H5 静态托管
│   ├── Dockerfile           # 服务端镜像
│   └── docker-compose.yml   # 一键容器化
├── EXPANSION_PLAN.md        # 设计文档（含数据模型、API、分阶段）
└── README.md                # 本文件
```

---

## 本地开发（快速上手）

### 前置
- Node.js 20+（建议 nvm）
- npm 10+

### 启动服务端

```bash
cd server
cp .env.example .env
# 生成真实密钥：
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# 把结果填到 .env 的 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
# 再把 ADMIN_INITIAL_PASSWORD 改成你自己的强密码

npm install
npx prisma migrate deploy        # 创建 data/holdem.db
npm run db:seed                   # 用 .env 里的 ADMIN_USERNAME 创建初始管理员
npm run dev                       # 监听 :3000，支持热重载
```

健康检查：
```bash
curl http://localhost:3000/api/health
```

用初始管理员账号登录（`mustChangePwd=true`，先改密）：
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"root","password":"ChangeMe!2026"}'
```

更多 CLI：见 [server/README.md](./server/README.md)。

### 启动客户端（H5）

```bash
# 回到仓库根
cd ..
npm install
VITE_API_BASE=http://localhost:3000/api npm run dev:h5
```

默认 H5 跑在 `http://localhost:5173/` 之类端口，按 Vite 提示打开即可。

### 客户端其他平台

```bash
# 微信小程序（开发）
npm run dev:mp-weixin
# 产物在 dist/dev/mp-weixin/，用微信开发者工具导入
```

---

## 生产部署

有两条路径：**Linux 原生**（PM2 + Nginx）或 **Docker**。普通个人部署推荐 Linux 原生，后续切 Docker 只要重起容器。

**共同前置：**
1. 一台 Ubuntu 22.04 服务器（1C2G 够用）
2. 一个 A 记录指向该服务器的域名（微信小程序必须 HTTPS）
3. SSH 可登录，root 或 sudoer

### 路径 A：Linux 原生（推荐）

```bash
# 在服务器上
git clone <你的仓库地址> /opt/holdem
cd /opt/holdem
sudo bash deploy/linux-setup.sh
```

脚本会：
1. 校验/安装 Node 20、nginx、certbot、pm2
2. 让你交互输入域名与 admin 初始密码
3. 在 `server/.env` 自动生成两个高强度 JWT 密钥
4. 运行 `prisma migrate deploy` + `db:seed`
5. 构建 H5 到 `dist/build/h5/`
6. 用你的域名渲染 `deploy/nginx.conf.template` 并激活站点
7. 用 certbot 签 HTTPS 证书
8. PM2 启动服务端并 `pm2 save` + 开机自启
9. 安装 `/etc/cron.daily/holdem-backup` 每日备份

完成后：
- 访问 `https://你的域名/` 看到登录页
- 用刚刚设置的 root 账号登录 → 强制改密 → 登录 → 账本列表

**更新部署**：
```bash
cd /opt/holdem
git pull
sudo bash deploy/linux-update.sh
```
脚本会：拉取依赖变更、跑迁移、重新构建 H5、重启 PM2 服务。

### 路径 B：Docker

```bash
cd /opt/holdem
cp server/.env.example server/.env
# 编辑 server/.env 填密钥和管理员密码

cd deploy
docker compose up -d
```

然后前置一层 Nginx 反代 443 → 容器的 3000，并让 `/` 指向宿主机上 `cd /opt/holdem && VITE_API_BASE=https://域名/api npm run build:h5` 的产物。

---

## 微信小程序发版

1. 在 `src/manifest.json` 把 `mp-weixin.appid` 填写你的真实 appid
2. 发版构建前把 `mp-weixin.setting.urlCheck` 改为 `true`（或直接删除该字段）
3. 在微信公众平台 → 开发 → 开发管理 → 服务器域名：
   - `request` 合法域名：`https://你的域名`
4. 构建产物：
   ```bash
   VITE_API_BASE=https://你的域名/api npm run build:mp-weixin
   ```
5. 用**微信开发者工具**打开 `dist/build/mp-weixin/` 导入
6. 上传 → 提交审核
7. **重要**：登录页必须放《用户服务协议》与《隐私政策》链接（审核要求）；本项目登录页已留出"账号由管理员分配，无注册"提示文案，您只需在 `src/pages/login/index.vue` 底部 `.hint` 区域补上协议链接即可

更细的发版 checklist 见 [deploy/MINI_PROGRAM_CHECKLIST.md](./deploy/MINI_PROGRAM_CHECKLIST.md)。

---

## 给用户发放账号

管理员在服务器上通过 CLI 创建：

```bash
cd /opt/holdem/server
npm run admin:create-user -- --username alice --password temp1234 --display "Alice"
```

告诉用户：
- 账号：alice
- 初始密码：temp1234
- **首次登录强制改密**，改完自动重新登录

其他 CLI：
```bash
npm run admin:list-users
npm run admin:reset-password -- --username alice --password newTemp
npm run admin:disable-user   -- --username alice            # 禁用
npm run admin:disable-user   -- --username alice --enable   # 恢复
```

---

## 故障排查

| 症状 | 排查 |
|---|---|
| `/api/health` 返回 502 | `pm2 status` 看服务是否在跑；`pm2 logs holdem` 看错误；`/opt/holdem/server/.env` JWT 密钥是否长度 ≥ 32 |
| 登录 401 | 账号密码核对；若 `USER_DISABLED` 则用 CLI `--enable` 恢复 |
| 客户端登录一直转圈 | 打开浏览器控制台看 network，多半是 `VITE_API_BASE` 拼错 / 未重新构建 |
| 微信小程序请求失败 | 公众平台的"服务器域名"是否加了你的域名；manifest.json `urlCheck` 是否为 true |
| H5 改密后永远提示改密 | 后端按设计每次改密吊销全部 refresh token；必须重新登录 |
| SQLite 锁 | 个位数 QPS 不会锁；若遇到请检查备份脚本是否在正常读取期间竞争——默认脚本用 `.backup` 命令，不会锁 |

---

## 路线图

- v1 已交付（当前）：账号鉴权 / 账本创建加入 / 买入审批 / 公摊分摊 / 归档 / bankroll 曲线
- v2 候选：WebSocket 实时、离线写队列、管理员转让、微信一键登录、i18n、管理后台 Web

详细设计：[EXPANSION_PLAN.md](./EXPANSION_PLAN.md)
>>>>>>> 1c01b38 (Initial Commit)
