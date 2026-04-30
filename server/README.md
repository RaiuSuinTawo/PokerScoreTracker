# HoldemAccount Server

Fastify + Prisma + MySQL 后端。详细设计见仓库根 [`EXPANSION_PLAN.md`](../EXPANSION_PLAN.md)，快速部署见仓库根 [`README.md`](../README.md)。

---

## 目录

```
server/
├── package.json
├── tsconfig.json
├── .env.example          # 复制为 .env 后填写
├── prisma/
│   ├── schema.prisma     # 数据模型（User/Ledger/Membership/Player/Expense/BuyInRequest/LedgerEvent/RefreshToken）
│   ├── seed.ts           # 从 .env 创建初始管理员
│   └── migrations/       # prisma 生成，勿手改
├── data/                 # 运行时数据（holdem.db 将在此）
└── src/
    ├── server.ts         # Fastify bootstrap + /api
    ├── db.ts             # Prisma 单例
    ├── types.ts          # 与 SQLite String 列配套的伪枚举
    ├── auth/
    │   ├── password.ts   # argon2id
    │   ├── jwt.ts        # HS256 access + 轮换 opaque refresh
    │   └── middleware.ts # requireAuth
    ├── middleware/
    │   └── ledgerAccess.ts  # 注入 req.membership / req.ledger；角色 / 归档 gating
    ├── events/emit.ts    # 写 LedgerEvent
    ├── services/
    │   ├── serial.ts     # 8-char Crockford base32 唯一序列号
    │   └── settlement.ts # 权威盈亏/公摊数学（客户端不自算）
    ├── routes/
    │   ├── auth.ts
    │   ├── ledgers.ts
    │   ├── players.ts
    │   ├── expenses.ts
    │   ├── events.ts
    │   ├── settlement.ts
    │   ├── buyInRequests.ts
    │   └── profile.ts
    └── cli/
        ├── _args.ts
        ├── create-user.ts
        ├── reset-password.ts
        ├── disable-user.ts
        └── list-users.ts
```

---

## 安装 & 迁移

```bash
npm install
npx prisma migrate deploy      # 生产用，不改 schema
# 或开发：npx prisma migrate dev --name <change>
npm run db:seed                # 首次，创建 .env 里的 ADMIN_USERNAME
```

> 本项目使用 MySQL 数据库。本地开发可用 `docker compose up mysql -d` 快速起一个 MySQL 8 实例（见 `deploy/docker-compose.yml`）。

---

## 运行

```bash
# 开发（tsx watch）
npm run dev

# 生产（tsc 编译后运行）
npm run build
npm run start
```

健康检查：
```bash
curl http://localhost:3000/api/health
```

---

## 管理员 CLI

所有命令在 `server/` 目录下运行。`--` 后面是参数。

```bash
npm run admin:create-user   -- --username alice --password temp1234 --display "Alice"
npm run admin:reset-password -- --username alice --password newTemp
npm run admin:disable-user  -- --username alice
npm run admin:disable-user  -- --username alice --enable
npm run admin:list-users
```

**行为：**
- `create-user`：新用户 `mustChangePwd=true`
- `reset-password`：重置密码后 `mustChangePwd=true`，**自动吊销全部 refresh token**（用户设备会被踢）
- `disable-user`：禁用登录（现有 access token 下次刷新失败）；`--enable` 恢复
- `list-users`：打印表格

---

## 环境变量（`server/.env`）

| 变量 | 作用 | 备注 |
|---|---|---|
| `DATABASE_URL` | MySQL 连接串 | `mysql://user:pass@host:3306/holdem`（云托管由平台注入） |
| `JWT_ACCESS_SECRET` | access 签名密钥 | **必填，长度≥32**，用 `openssl rand -hex 64` 生成 |
| `JWT_REFRESH_SECRET` | refresh 签名密钥 | 同上，**与 access 不同** |
| `JWT_ACCESS_TTL_SECONDS` | access 有效期 | 默认 900（15 分钟） |
| `JWT_REFRESH_TTL_SECONDS` | refresh 有效期 | 默认 2592000（30 天） |
| `PORT` | 监听端口 | 默认 3000 |
| `HOST` | 监听地址 | 默认 `0.0.0.0` |
| `CORS_ORIGIN` | 允许源，逗号分隔 | 生产：`https://你的域名` |
| `ADMIN_USERNAME` | seed 初始管理员 | 登录名 |
| `ADMIN_INITIAL_PASSWORD` | seed 初始密码 | 首次登录必改 |
| `ADMIN_DISPLAY_NAME` | 显示名 | 默认同 username |
| `ARGON_MEMORY` | argon2 memoryCost | 默认 65536 |
| `ARGON_TIME` | argon2 timeCost | 默认 3 |
| `ARGON_PARALLELISM` | argon2 并行 | 默认 1 |

---

## API 速查

前缀全部 `/api`；错误体 `{ error: { code, message, errorId? } }`。

| Method | Path | 权限 |
|---|---|---|
| POST | `/auth/login` | - |
| POST | `/auth/refresh` | - |
| POST | `/auth/logout` | - |
| GET  | `/auth/me` | 登录 |
| POST | `/auth/change-password` | 登录 |
| GET  | `/ledgers` | 登录 |
| POST | `/ledgers` | 登录 → 自动 ADMIN |
| POST | `/ledgers/join` | 登录 → 自动 PLAYER |
| GET  | `/ledgers/:id` | 成员 |
| PATCH | `/ledgers/:id` | ADMIN + 非归档 |
| DELETE | `/ledgers/:id` | ADMIN（归档也可删） |
| POST | `/ledgers/:id/archive` | ADMIN + 已平 |
| GET  | `/ledgers/:id/settlement` | 成员 |
| GET  | `/ledgers/:id/events?since=` | 成员 |
| PATCH | `/ledgers/:id/players/:pid` | nickname 本人或ADMIN / chipAmount ADMIN / order ADMIN |
| DELETE | `/ledgers/:id/players/:pid` | ADMIN |
| POST | `/ledgers/:id/expenses` | ADMIN |
| PATCH | `/ledgers/:id/expenses/:eid` | ADMIN |
| DELETE | `/ledgers/:id/expenses/:eid` | ADMIN |
| POST | `/ledgers/:id/buy-in-requests` | 成员（自己发；ADMIN 自请求自动批准） |
| GET  | `/ledgers/:id/buy-in-requests?status=` | ADMIN 见全部 / 玩家见自己 |
| POST | `/buy-in-requests/:rid/approve` | ADMIN |
| POST | `/buy-in-requests/:rid/reject`  | ADMIN |
| POST | `/buy-in-requests/:rid/cancel`  | 发起人 |
| GET  | `/profile/ledgers` | 登录 |
| GET  | `/profile/bankroll` | 登录 |

---

## 运维

### 备份

**微信云托管**：平台自带 MySQL 自动备份，无需手动操作。

**自有服务器**：每日用 mysqldump 热备。推荐装到 `/etc/cron.daily/`：
```bash
sudo install -m755 deploy/backup-mysql.sh /etc/cron.daily/holdem-backup
```
脚本会把数据库备份到 `/backups/holdem/holdem-YYYY-MM-DD.sql.gz` 并保留 30 天。

### 恢复

停服 → 恢复 → 启服：
```bash
pm2 stop holdem
gunzip < /backups/holdem/holdem-2026-04-20.sql.gz | mysql -h localhost -u holdem -p holdem
pm2 start holdem
```

### 升级 Prisma schema

1. 改 `prisma/schema.prisma`
2. 本地：`npx prisma migrate dev --name <描述>`（会生成 migration sql）
3. 生产：拉代码后 `npx prisma migrate deploy`（不会交互）

### 重放迁移到别的机器

`prisma/migrations/` 里的每个 `.sql` 是幂等的；只要 `DATABASE_URL` 指向新库，`prisma migrate deploy` 就会把它们依次跑完。

---

## Phase 1 端到端自测

> 前置：确保 MySQL 已运行，`DATABASE_URL` 已配置，已执行 `prisma migrate deploy` + `db:seed`。

```bash
# 1. 创建用户
npm run admin:create-user -- --username alice --password p1-very-long-pw --display Alice

# 2. 登录拿 token
ACCESS=$(curl -sX POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"alice","password":"p1-very-long-pw"}' \
  | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).access)")

# 3. /auth/me 应返回 mustChangePwd:true
curl -s http://localhost:3000/api/auth/me -H "authorization: Bearer $ACCESS"

# 4. 改密
curl -sX POST http://localhost:3000/api/auth/change-password \
  -H "authorization: Bearer $ACCESS" -H 'content-type: application/json' \
  -d '{"oldPassword":"p1-very-long-pw","newPassword":"newSecurePass99"}'
```

更多自测（账本 / buy-in / 归档 / 个人中心）：见根 [`EXPANSION_PLAN.md`](../EXPANSION_PLAN.md) §11。
