# HoldemAccount — 多用户服务端化扩展 Plan

**目标仓库：** `/g/CCWorkSpace/Item-HoldemAccount`
**Plan 日期：** 2026-04-20
**阅读者：** 无上下文的 future-self（新会话从零开始执行）

---

## 1. Context（为什么做这件事）

当前应用是**单用户本地德州扑克记账工具**：uni-app + Vue 3 + TS + Pinia + Vite，数据通过 `uni.setStorageSync('POKER_APP_DATA')` 同步存储在单设备上。不支持多人协作、不支持历史记录、不支持账号。

用户希望把它改造为**多用户协作系统**：
1. 服务端托管数据；无自助注册，账号由管理员预配置，首次登录强制改密
2. "账本"概念：一个用户创建账本成为该账本管理员并获得8位序列号；其他用户按序列号加入，自动成为玩家（0手带入）
3. 账本详情页复用当前 index.vue 主界面；根据角色 / 归档状态差异化可写性
4. buy-in（带入）改为**申请-审批**消息流；所有人（含管理员）的 buy-in 都要走审批，管理员自己的申请自动批准
5. cashout（chipAmount，最终筹码量）由**管理员统一录入所有玩家**
6. 游戏结束后帐平状态下管理员可**归档**，归档后账本全局只读
7. 个人中心：参与过的所有账本列表 + 基于已归档账本聚合的 bankroll 曲线

此改动是从"单机工具"向"服务端+客户端"架构的根本性转变，影响面覆盖：数据模型重写、新增鉴权层、12 个 `_persist()` 调用点全部重构为 API 调用、组件引入角色/归档态 gating、页面数量翻倍、新增服务端工程。

**预期结果：** 一个可部署到个人 VPS 的小型 SaaS 化德扑记账工具，支持多用户同局协作记账与历史盈亏追踪。

---

## 2. 已确认的关键决策（用户 2026-04-20 回复）

| # | 决策点 | 选择 |
|---|---|---|
| D1 | 管理员是否默认为玩家 | **是**，创建账本时自动生成管理员的 Player 行；可删除变为纯裁判 |
| D2 | chipAmount（cashout）录入权 | **管理员可录入所有玩家的 chipAmount** |
| D3 | 所有 buy-in 是否都走审批 | **是**，包括管理员自己；管理员给自己的申请**自动批准** |
| D4 | 服务端技术栈 | Node.js 20 + **Fastify** + **SQLite** + **Prisma** + argon2 + jsonwebtoken |
| D5 | 实时通知方案 | **HTTP 轮询 5 秒**，5 次空轮询后退避到 10 秒；用户操作时立即重置间隔 |
| D6 | 玩家 nickname 修改权 | 玩家自己任意时间可改；归档后全部锁定 |
| D7 | 本地数据迁移 | **不迁移**，首次启动弹一次性导出提示后清空 |
| D8 | 账号删除 | v1 **不实现**，仅 CLI 可禁用登录 |
| D9 | 管理员转让 | v1 **不实现** |

---

## 3. 当前代码关键事实（开工前 5 分钟必须验证）

开工前 `cd /g/CCWorkSpace/Item-HoldemAccount` 确认以下仍成立；若不符，必须重新探索再动手：

- 单一 Pinia store `src/stores/sessionStore.ts`，12 个 `_persist()` 调用点在以下行号：
  - 132 (setChipValue), 137 (setChipMultiplier), 150 (addPlayer), 155 (removePlayer), 165 (updatePlayer), 172 (incrementBuyIn), 178 (decrementBuyIn), 187 (addSharedExpense), 195 (updateSharedExpense), 200 (removeSharedExpense), 206 (clearSession), 254 (importData)
- `src/composables/useStorage.ts` 的 `StorageAdapter` 接口**是同步的**（`load(): AppData|null`, `save(data): void`），这正是 `src/pages/index/index.vue:21` 能在 `<script setup>` 顶层直接 `store.hydrate()` 的原因。改为网络层后**必须异步化**并把调用点下移到 `onLoad/onLaunch`
- 仅两个页面：`pages/index/index.vue`（534 行）、`pages/shared-expense/index.vue`
- 三个关键组件 `PlayerRow.vue` / `EditPlayerModal.vue` / `ChipValueInput.vue` **没有任何 readonly/canEdit 类 prop**，所有编辑是无条件的
- `src/components/EditChipModal.vue`、`src/components/EditNicknameModal.vue` 存在但未被引用，可删除
- `package.json` 依赖中 `vue-i18n` 未被使用；无 HTTP 客户端、无 WS 库、无 crypto 库
- `src/manifest.json` mp-weixin 块：`appid` 为空、`urlCheck: false`、无任何请求域配置
- `#HOLDEM#...#END#` 导出格式不含 `Session.id` 且导入时重新 `generateId()`，**不可复用为加入序列号**
- `Session.isSettled` 字段定义在 `src/types/index.ts` 但从未被设为 true；归档态用**新字段 status** 表达，此字段废弃
- `generateId()` 产出 UUID，不适合做人眼识别的序列号；需单独的 Crockford base32 生成器

---

## 4. 架构

### 4.1 客户端/服务端职责切分

| 关注点 | 位置 |
|---|---|
| UI、输入校验、乐观更新、格式化 | 客户端 |
| Token 存储、请求签名 | 客户端 (`uni.setStorageSync`) |
| Ledger/Player/Expense/BuyInRequest 权威数据 | 服务端 |
| 序列号生成与唯一性 | 服务端 |
| 角色/权限校验 | 服务端（客户端仅作 UI 提示） |
| 归档时的平衡校验 | 服务端权威；客户端预检仅用于按钮态 |
| bankroll 聚合 | 服务端 SQL |
| settlement 数学（盈亏/公摊） | **服务端实现一份权威版本**；客户端显示通过 `GET /ledgers/:id/settlement` 拉取，避免两端公式漂移 |

### 4.2 鉴权

- **密码哈希：** argon2id，memory=64MB、time=3、parallelism=1
- **Access Token：** JWT HS256，15 分钟 TTL，claims `{ sub: userId, username, iat, exp }`
- **Refresh Token：** 不透明 256-bit 随机值，DB 只存 SHA-256 哈希；TTL 30 天；每次使用**轮换**（revoke 旧的，签发新的）
- **请求头：** `Authorization: Bearer <access>`；401 + `code=TOKEN_EXPIRED` 时 `http.ts` 做一次 single-flight 刷新并重放原请求；其他 401 直接 `authStore.logout()` + `uni.reLaunch('/pages/login/index')`
- **首次改密：** `User.mustChangePwd=true` 时所有受保护接口返回 `409 MUST_CHANGE_PASSWORD`，客户端跳到 `change-password` 页

### 4.3 传输

- **REST** 承担全部 CRUD 和审批动作
- **轮询：** 账本详情页与管理员收件箱页前台可见期间，`GET /ledgers/:id/events?since=<iso>` **每 5 秒**一次；连续 5 次空事件后退避到 10 秒；用户任何写操作后立即重置为 5 秒；页面 `onHide` 停止，`onShow` 恢复
- **WebSocket：** v1 不做，留作 Phase 8

### 4.4 错误处理

- `http.ts` 区分：
  - 无响应 → Toast "网络连接失败，请重试"，不清态
  - 5xx → Toast "服务器错误"，展示 `errorId`（服务端返回的 ULID）
  - 4xx → 展示服务端的中文 `message`
- **不做离线写队列**：失败就直接报错让用户重试；乐观更新仅用于低风险操作（公摊新增、chipValue 编辑），失败回滚

---

## 5. 数据模型（Prisma schema）

关键关系：`User —(Membership)— Ledger`；`Membership.playerId` 把用户的 Player 行挂回来；buy-in 走独立的 `BuyInRequest` 实体。

```prisma
// server/prisma/schema.prisma
generator client { provider = "prisma-client-js" }
datasource db    { provider = "sqlite"; url = env("DATABASE_URL") }

model User {
  id            String   @id @default(cuid())
  username      String   @unique
  passwordHash  String
  mustChangePwd Boolean  @default(true)
  displayName   String
  disabled      Boolean  @default(false)
  createdAt     DateTime @default(now())

  memberships   Membership[]
  refreshTokens RefreshToken[]
}

model Ledger {
  id              String       @id @default(cuid())
  serial          String       @unique  // 8-char Crockford base32
  title           String
  chipValue       Float        @default(200)
  chipMultiplier  Float        @default(1)
  status          LedgerStatus @default(ACTIVE)
  createdById     String
  createdAt       DateTime     @default(now())
  archivedAt      DateTime?

  memberships   Membership[]
  players       Player[]
  expenses      SharedExpense[]
  buyInRequests BuyInRequest[]
  events        LedgerEvent[]

  @@index([status])
}
enum LedgerStatus { ACTIVE ARCHIVED }

model Membership {
  id       String @id @default(cuid())
  userId   String
  ledgerId String
  role     Role   @default(PLAYER)
  playerId String? @unique
  joinedAt DateTime @default(now())

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  ledger Ledger  @relation(fields: [ledgerId], references: [id], onDelete: Cascade)
  player Player? @relation(fields: [playerId], references: [id])

  @@unique([userId, ledgerId])
  @@index([ledgerId])
}
enum Role { ADMIN PLAYER }

model Player {
  id         String @id @default(cuid())
  ledgerId   String
  nickname   String
  buyInCount Int    @default(0)
  chipAmount Float  @default(0)
  order      Int    @default(0)
  createdAt  DateTime @default(now())

  ledger        Ledger       @relation(fields: [ledgerId], references: [id], onDelete: Cascade)
  membership    Membership?
  buyInRequests BuyInRequest[]

  @@index([ledgerId])
}

model SharedExpense {
  id        String @id @default(cuid())
  ledgerId  String
  label     String
  amount    Float
  createdAt DateTime @default(now())

  ledger Ledger @relation(fields: [ledgerId], references: [id], onDelete: Cascade)
  @@index([ledgerId])
}

model BuyInRequest {
  id            String    @id @default(cuid())
  ledgerId      String
  playerId      String
  requestedById String
  hands         Int       // 正整数增量
  status        ReqStatus @default(PENDING)
  decidedById   String?
  decidedAt     DateTime?
  note          String?
  rejectReason  String?
  createdAt     DateTime  @default(now())

  ledger Ledger @relation(fields: [ledgerId], references: [id], onDelete: Cascade)
  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@index([ledgerId, status])
}
enum ReqStatus { PENDING APPROVED REJECTED CANCELED }

model LedgerEvent {
  id        String   @id @default(cuid())
  ledgerId  String
  type      String   // BUY_IN_REQUESTED | BUY_IN_DECIDED | PLAYER_JOINED | EXPENSE_CHANGED | PLAYER_UPDATED | LEDGER_UPDATED | LEDGER_ARCHIVED
  payload   String   // JSON
  createdAt DateTime @default(now())
  ledger    Ledger   @relation(fields: [ledgerId], references: [id], onDelete: Cascade)
  @@index([ledgerId, createdAt])
}

model RefreshToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

### 序列号生成 `server/src/services/serial.ts`

- 字母表 Crockford base32：`0123456789ABCDEFGHJKMNPQRSTVWXYZ`（无 I L O U）
- 长度 8 → 32⁸≈1.1×10¹² 空间；碰撞概率可忽略
- `crypto.randomBytes(5)` 取 40 bit → 映射为 8 字符；UNIQUE 冲突最多重试 5 次

### 本地数据迁移（D7）

不迁移。客户端首次启动如果检测到 `POKER_APP_DATA` 存在：
1. 弹一次性对话框："旧版本本地数据可导出后删除；新版本使用云端账本"
2. 按钮"导出到剪贴板"复用现有 `#HOLDEM#...#END#` 文本格式
3. 用户确认后 `uni.removeStorageSync('POKER_APP_DATA')`

---

## 6. API 设计

全部 `/api` 前缀，JSON 交互。错误体：`{ error: { code, message, errorId? } }`。

### 6.1 鉴权

| Method | Path | Body | Response | 备注 |
|---|---|---|---|---|
| POST | `/auth/login` | `{username,password}` | `{access,refresh,user}` | `mustChangePwd` 在 user 中返回 |
| POST | `/auth/refresh` | `{refresh}` | `{access,refresh}` | 轮换 refresh |
| POST | `/auth/logout` | `{refresh}` | 204 | revoke refresh |
| POST | `/auth/change-password` | `{oldPassword,newPassword}` | 204 | 清 `mustChangePwd` |
| GET  | `/auth/me` | — | `{user}` | |

### 6.2 账本

| Method | Path | Body | Response | 权限 |
|---|---|---|---|---|
| GET | `/ledgers` | — | `{active:[...],archived:[...]}` 摘要 | 登录 |
| POST | `/ledgers` | `{title}` | `{ledger}` | 登录；自动创建 Admin Membership + Admin 的 Player 行（D1） |
| POST | `/ledgers/join` | `{serial}` | `{ledger}` | 登录；自动创建 Player Membership + 0 手 Player 行 |
| GET | `/ledgers/:id` | — | `{ledger}` 完整 | 成员 |
| GET | `/ledgers/:id/settlement` | — | `{totalUp,totalDown,balanceDiff,isBalanced,perPlayer:[{playerId,rawProfit,expenseShare,finalProfit}]}` | 成员；客户端展示此接口，**不自行计算** |
| PATCH | `/ledgers/:id` | `{title?,chipValue?,chipMultiplier?}` | `{ledger}` | Admin，非归档 |
| DELETE | `/ledgers/:id` | — | 204 | Admin |
| POST | `/ledgers/:id/archive` | — | `{ledger}` | Admin；`isBalanced=true` 才通过 |

### 6.3 玩家与公摊

| Method | Path | Body | 权限 |
|---|---|---|---|
| PATCH | `/ledgers/:id/players/:pid` | `{nickname?,chipAmount?,order?}` | nickname：本人或Admin；chipAmount：**Admin**（D2）；order：Admin |
| DELETE | `/ledgers/:id/players/:pid` | — | Admin |
| POST | `/ledgers/:id/expenses` | `{label,amount}` | Admin |
| PATCH | `/ledgers/:id/expenses/:eid` | `{label?,amount?}` | Admin |
| DELETE | `/ledgers/:id/expenses/:eid` | — | Admin |

**注：** 所有接口对 `status=ARCHIVED` 的账本直接返回 `409 LEDGER_ARCHIVED`

### 6.4 Buy-in 请求（D3）

| Method | Path | Body | 权限与行为 |
|---|---|---|---|
| POST | `/ledgers/:id/buy-in-requests` | `{hands,note?}` | 任意成员为自己的 Player 行发起；**如果 requester 是 Admin，同事务内自动 approve 并增加 buyInCount** |
| GET | `/ledgers/:id/buy-in-requests?status=PENDING` | — | Admin 见全部；Player 见本人 |
| POST | `/buy-in-requests/:rid/approve` | — | Admin；事务内更新请求状态 + `player.buyInCount += hands` + 写事件 |
| POST | `/buy-in-requests/:rid/reject` | `{reason?}` | Admin |
| POST | `/buy-in-requests/:rid/cancel` | — | 发起人；仅 PENDING |

### 6.5 事件轮询（D5）

- `GET /ledgers/:id/events?since=<iso>` → `{events:[...],serverTime}`
- `type ∈ { BUY_IN_REQUESTED, BUY_IN_DECIDED, PLAYER_JOINED, PLAYER_UPDATED, EXPENSE_CHANGED, LEDGER_UPDATED, LEDGER_ARCHIVED }`
- 客户端轮询间隔 5s；连续 5 次空返回后退避到 10s；任何用户写操作立即重置到 5s

### 6.6 个人中心

| Method | Path | Response |
|---|---|---|
| GET | `/profile/ledgers` | `{ledgers:[{id,serial,title,status,myNet,archivedAt,role}]}` 覆盖全部参与过的 |
| GET | `/profile/bankroll` | `{points:[{at,perLedgerNet,cumulative}]}` 按 `archivedAt` 升序仅含 ARCHIVED |

### 6.7 Admin CLI（非 HTTP）

- `npm run admin:create-user -- --username alice --display "Alice" --password temp1234`
- `npm run admin:reset-password -- --username alice --password temp5678`
- `npm run admin:disable-user -- --username alice`
- `npm run admin:list-users`

---

## 7. 客户端重构

### 7.1 Store 拆分

删除 `src/stores/sessionStore.ts` 与 `src/composables/useStorage.ts`，新增：

| Store | 职责 |
|---|---|
| `src/stores/authStore.ts` | user、access/refresh token、mustChangePwd、login/logout/refresh/changePassword |
| `src/stores/ledgerListStore.ts` | 账本列表缓存；create / joinBySerial / 刷新 |
| `src/stores/ledgerStore.ts` | 当前打开的账本：ledger、role、myPlayerId、pendingRequests、events since、pollTimer |
| `src/stores/profileStore.ts` | 参与账本列表 + bankroll 曲线数据 |

### 7.2 `src/utils/http.ts` 接口签名

```ts
export interface ApiError { code: string; message: string; errorId?: string; status: number }
export type Method = 'GET'|'POST'|'PATCH'|'DELETE'

interface RequestOpts {
  method?: Method
  data?: unknown
  query?: Record<string, string|number|undefined>
  skipAuth?: boolean        // 用于 /auth/login /auth/refresh
  signal?: AbortSignal      // 轮询取消
}

export async function request<T>(path: string, opts?: RequestOpts): Promise<T>
// 行为：
//  - 从 authStore 读 access token；无则 401 直接 reject
//  - baseURL 取自 import.meta.env.VITE_API_BASE
//  - 401 & code=TOKEN_EXPIRED：single-flight 调 /auth/refresh，重放原请求一次
//  - 401 & code=MUST_CHANGE_PASSWORD：reLaunch 到 change-password 页
//  - 其他 401：authStore.logout() + reLaunch 到 login
//  - 非 2xx 抛 ApiError
export const api = {
  get:   <T>(p: string, q?: Record<string, any>) => request<T>(p, {method:'GET', query:q}),
  post:  <T>(p: string, d?: unknown) => request<T>(p, {method:'POST', data:d}),
  patch: <T>(p: string, d?: unknown) => request<T>(p, {method:'PATCH', data:d}),
  del:   <T>(p: string) => request<T>(p, {method:'DELETE'}),
}
```

### 7.3 12 个 `_persist()` 调用点 → API 映射

| 原 sessionStore.ts 行号 | 原方法 | 新 ledgerStore 方法 | 新 API |
|---|---|---|---|
| 132 | setChipValue | `setChipValue(v)` | PATCH `/ledgers/:id` `{chipValue}` (Admin) |
| 137 | setChipMultiplier | `setChipMultiplier(v)` | PATCH `/ledgers/:id` `{chipMultiplier}` (Admin) |
| 150 | addPlayer | **移除** — 玩家通过 join 自动添加 | — |
| 155 | removePlayer | `removePlayer(pid)` | DELETE `/ledgers/:id/players/:pid` (Admin) |
| 165 | updatePlayer | `updatePlayer(pid, patch)` | PATCH `/ledgers/:id/players/:pid`（字段级权限见 §6.3） |
| 172 | incrementBuyIn | `requestBuyIn(hands=1)` | POST `/ledgers/:id/buy-in-requests`；Admin 自动批准（服务端） |
| 178 | decrementBuyIn | **移除** — 错录通过 reject / cancel / 新的反向申请处理 |
| 187 | addSharedExpense | `addExpense({label,amount})` | POST `/ledgers/:id/expenses` |
| 195 | updateSharedExpense | `updateExpense(eid,patch)` | PATCH `/ledgers/:id/expenses/:eid` |
| 200 | removeSharedExpense | `removeExpense(eid)` | DELETE `/ledgers/:id/expenses/:eid` |
| 206 | clearSession | `deleteLedger()` | DELETE `/ledgers/:id` → reLaunch 到 list |
| 254 | importData | **移除** — 导入功能废弃 |

### 7.4 ledgerStore 形状（sketch）

```ts
interface LedgerState {
  ledger: Ledger | null
  role: 'ADMIN' | 'PLAYER' | null
  myPlayerId: string | null
  pendingRequests: BuyInRequest[]  // Admin 见全部 PENDING，Player 见自己的
  settlement: Settlement | null    // 来自 GET /ledgers/:id/settlement
  lastEventAt: string | null       // ISO；下次轮询 ?since=
  pollTimer: number | null
  isLoading: boolean
  error: string | null
}

// getters
isArchived          = ledger?.status === 'ARCHIVED'
canEditLedger       = role === 'ADMIN' && !isArchived
canEditOwnNickname  = (pid) => (pid === myPlayerId || role === 'ADMIN') && !isArchived
canEditChipAmount   = role === 'ADMIN' && !isArchived        // D2
canDeleteLedger     = role === 'ADMIN'                        // 归档后仍可删
canArchive          = role === 'ADMIN' && !isArchived && settlement?.isBalanced

// actions (全部 async)
load(id)  refresh()  startPolling()  stopPolling()
setChipValue(v)  setChipMultiplier(v)
updatePlayer(pid, patch)  removePlayer(pid)
requestBuyIn(hands, note?)
approveRequest(rid)  rejectRequest(rid, reason?)  cancelRequest(rid)
addExpense(e)  updateExpense(eid, patch)  removeExpense(eid)
archive()  deleteLedger()
```

### 7.5 组件 prop 修改（gating）

| 组件 | 新增 prop |
|---|---|
| `PlayerRow.vue` | `canEditNickname: boolean`, `canAdjustBuyIn: 'direct'\|'request'\|'none'`, `canEditChipAmount: boolean`, `isMyRow: boolean` |
| `EditPlayerModal.vue` | `readonlyFields: Array<'nickname'\|'buyInCount'\|'chipAmount'>`, `showDelete: boolean` |
| `ChipValueInput.vue` | `readonly: boolean` |

`PlayerRow` 的 `+` 按钮行为分支：
- `canAdjustBuyIn='direct'`（Admin 给任何人）→ 直接 PATCH（其实也要走请求流以记录；Admin 自己时自动批准）
- `canAdjustBuyIn='request'`（Player 给自己）→ 打开 `RequestBuyInModal`
- `canAdjustBuyIn='none'`（Player 给他人 / 归档态）→ 不渲染按钮

### 7.6 页面清单（新的 `pages.json`）

```
pages/login/index.vue                  新增
pages/change-password/index.vue        新增（mustChangePwd 时强制进入）
pages/ledger-list/index.vue            新增（tabBar-1 "账本"）
pages/index/index.vue                  保留；改为账本详情页，接收 ?id= 参数
pages/shared-expense/index.vue         保留；按 canEditLedger gating
pages/buy-in-requests/index.vue        新增（Admin 收件箱；Player 历史）
pages/profile/index.vue                新增（tabBar-2 "我的"）
```

添加 2 项 tabBar：账本、我的。登录/改密/账本详情/公摊/收件箱不在 tabBar 中。

### 7.7 生命周期接入

- `App.vue onLaunch`：`authStore.hydrate()` 读本地 token；有效 → `/auth/me` → reLaunch 到 ledger-list；无效且 refresh 可用 → 静默刷新；全部失败 → reLaunch 到 login
- `pages/index/index.vue`：**删除 `<script setup>` 顶层的 `store.hydrate()` 调用（当前第 21 行）**；改为 `onLoad((q)=>ledgerStore.load(q.id))` + `onShow(()=>{ ledgerStore.refresh(); ledgerStore.startPolling(); })` + `onHide(()=>ledgerStore.stopPolling())` + `onUnload(()=>ledgerStore.reset())`
- `ledger-list`、`profile` 在 `onShow` 里刷新各自列表
- 新增 `src/utils/requireAuth.ts` 路由守卫工具，包装任何页面的 `onLoad`

### 7.8 新增客户端文件清单

```
src/utils/http.ts
src/utils/polling.ts              createPoller({ intervalMs, fn, onError, visibility })
src/utils/requireAuth.ts
src/stores/authStore.ts
src/stores/ledgerListStore.ts
src/stores/ledgerStore.ts
src/stores/profileStore.ts
src/pages/login/index.vue
src/pages/change-password/index.vue
src/pages/ledger-list/index.vue
src/pages/buy-in-requests/index.vue
src/pages/profile/index.vue
src/components/LedgerCard.vue
src/components/BuyInRequestItem.vue
src/components/RequestBuyInModal.vue
src/components/BankrollChart.vue
```

删除：`src/composables/useStorage.ts`、`src/stores/sessionStore.ts`、`src/components/EditChipModal.vue`、`src/components/EditNicknameModal.vue`

### 7.9 图表方案

用 `@qiun/ucharts` + `qiun-data-charts` 组件：canvas 渲染、兼容小程序与 H5、零配置；约 80KB gzip。如果 Phase 7 阶段 bundle 评估超标则改为自写 `<canvas>` 折线图（约 120 行）。

---

## 8. 分阶段实施路线图

共 7 个 Phase，每个都可独立验收并可选择发布 H5 演练。

### Phase 1 — 服务端脚手架 + 鉴权

**目标：** 服务能通过 CLI 创建用户、登录返回 JWT

**新增文件：**
```
server/
  package.json                    (fastify, @fastify/cors, prisma, @prisma/client, argon2, jsonwebtoken, zod, tsx)
  tsconfig.json
  prisma/schema.prisma            (§5)
  prisma/seed.ts                  (从 env 创建初始 admin 用户)
  src/server.ts                   (Fastify 启动、CORS、路由注册、错误处理)
  src/db.ts                       (Prisma 单例)
  src/auth/password.ts            (argon2 hash/verify)
  src/auth/jwt.ts                 (sign/verify access + refresh)
  src/auth/middleware.ts          (requireAuth preHandler)
  src/routes/auth.ts              (login/refresh/logout/change-password/me)
  src/cli/create-user.ts
  src/cli/reset-password.ts
  src/cli/disable-user.ts
  src/cli/list-users.ts
  .env.example
```

**验收：**
- `npm run admin:create-user -- --username alice --password p1 --display Alice` 落库
- `curl -XPOST /api/auth/login -d '{"username":"alice","password":"p1"}'` 返回 `{access,refresh,user:{mustChangePwd:true}}`
- `curl /api/auth/me -H "Authorization: Bearer <access>"` 返回 user
- `POST /api/auth/change-password` 成功后 `mustChangePwd=false`
- access token 15 分钟过期后，`/auth/refresh` 返回新对；旧 refresh revoke 后不再可用

### Phase 2 — 客户端鉴权 + 登录页 + 清除旧本地数据

**目标：** 客户端跑通登录、改密、刷新；旧的本地数据流彻底下线（账本页暂时是空壳）

**修改/新增：**
- 新建 `src/utils/http.ts`、`src/stores/authStore.ts`、`src/pages/login/index.vue`、`src/pages/change-password/index.vue`、`src/utils/requireAuth.ts`
- `App.vue onLaunch` 接入 `authStore.hydrate()` + 路由分派
- **删除** `src/composables/useStorage.ts`
- `src/pages/index/index.vue` 暂时挂个占位 "从列表进入" 提示（下阶段再接线）
- 首次启动检测 `POKER_APP_DATA` 弹导出对话框（§5 本地数据迁移）
- `manifest.json` 中先保持 `urlCheck:false`（开发期）

**验收：**
- 冷启动无 token → 登录页
- seed 账号登录成功 → 落地到 ledger-list（空壳 OK）
- `mustChangePwd=true` 强制进入改密页，改完流回
- 手动把 access token 改坏，触发静默 refresh
- 旧本地数据对话框出现一次，确认后清空 `POKER_APP_DATA`

### Phase 3 — 账本 CRUD + 列表页

**目标：** 创建、加入、列表、删除账本跑通

**服务端新增：**
```
server/src/routes/ledgers.ts             (POST / POST-join / GET list / GET one / PATCH / DELETE)
server/src/services/serial.ts            (Crockford base32 + 唯一性重试)
server/src/middleware/ledgerAccess.ts    (注入 req.role / req.membership)
```
创建账本时事务内：新建 Ledger + 新建 Admin Membership + 新建 Admin Player + 生成序列号（D1）。

**客户端新增：**
```
src/stores/ledgerListStore.ts
src/pages/ledger-list/index.vue
src/components/LedgerCard.vue
```
列表顶部两个按钮：创建 / 加入（输入序列号）。

**验收：**
- A 创建账本 → 卡片显示 8 位序列号
- B 输入序列号加入 → A/B 列表都出现该账本，B 自动有 Player 行（0 手，nickname 默认为 displayName）
- A 删除账本 → A/B 列表都消失
- 序列号大小写不敏感、输入框自动去除空格

### Phase 4 — sessionStore → ledgerStore 重构 + 详情页接线

**目标：** 账本详情页端到端跑通；这是最大的一阶段

**服务端新增：**
```
server/src/routes/players.ts         (PATCH 字段级权限、DELETE)
server/src/routes/expenses.ts        (POST/PATCH/DELETE)
server/src/routes/events.ts          (GET /ledgers/:id/events)
server/src/routes/settlement.ts      (GET /ledgers/:id/settlement)
server/src/services/settlement.ts    (权威数学：从客户端 sessionStore.ts 的 finalProfits 逻辑与 utils/calculator.ts 翻译过来；务必 diff 验证两端公式一致)
server/src/events/emit.ts            (写 LedgerEvent 的辅助)
```

**客户端改动：**
- 删除 `src/stores/sessionStore.ts`
- 新建 `src/stores/ledgerStore.ts`、`src/utils/polling.ts`
- 更新 `PlayerRow.vue` / `EditPlayerModal.vue` / `ChipValueInput.vue` 增 gating prop（§7.5）
- 重写 `src/pages/index/index.vue`：
  - 去掉顶层 `hydrate()` 调用
  - `onLoad` 读 `id` query → `ledgerStore.load(id)`
  - `onShow` 刷新 + 启动 5s 轮询
  - 移除 `#HOLDEM#...#END#` 导入/导出 UI（handleExport / fallbackCopy 相关函数全部删除）
  - 归档/删除按钮暂时隐藏（Phase 5/6 再加）
- `src/pages/shared-expense/index.vue`：按 `canEditLedger` gating

**验收：**
- 两个浏览器 tab 打开同一账本：A 改 chipValue，B 在 5s 内看到更新
- Admin 能改 chipValue / chipMultiplier / 公摊；Player 不能
- nickname：本人或 Admin 可改，其他人不能
- chipAmount：只有 Admin 能改（D2）
- 通过手动 DB 改 `status=ARCHIVED` 测试只读：所有输入置灰、所有按钮禁用
- settlement 数值与本地原版完全一致（对照测试样例）

### Phase 5 — Buy-in 申请流

**目标：** 所有 buy-in 走申请；Admin 自己的自动批准；收件箱能用

**服务端新增：**
```
server/src/routes/buyInRequests.ts   (POST / GET / approve / reject / cancel)
```
- POST 检查：requester 必须是该 Player 对应 membership 的 user
- **如果 requester.role=ADMIN 且 target player = 自己**（即 `membership.playerId === player.id`），在同一事务内直接置为 APPROVED 并 `player.buyInCount += hands`（D3）
- approve：Admin 执行；事务内 update request + increment buyInCount + LedgerEvent

**客户端新增：**
```
src/pages/buy-in-requests/index.vue
src/components/BuyInRequestItem.vue
src/components/RequestBuyInModal.vue
```
- `PlayerRow` 的 `+` 按钮分支：
  - Admin 给任何人（含自己）：实际也调 POST /buy-in-requests（自己那条自动批准）→ UI 无缝
  - Player 给自己：打开 RequestBuyInModal 填 hands / note
  - Player 给他人：按钮隐藏
- 账本详情页顶栏显示 Admin 待处理请求数徽章（来自 events 流）
- `-` 按钮保留仅 Admin 可见，直接 PATCH（用于纠错）

**验收：**
- Player 点 + → 弹框 → 提交 → Admin 收件箱在 5s 内出现
- Admin 批准 → 两端 5s 内 buyInCount +1
- Admin 拒绝 + 原因 → Player 下次刷新看到 toast
- Admin 自己点 + → 不弹框，直接生效（后台有一条 APPROVED 记录可追溯）
- Player cancel 自己 PENDING 请求 → Admin 收件箱该条消失

### Phase 6 — 归档流

**目标：** 帐平时 Admin 可归档；归档后全局只读

**服务端改动：**
- `POST /ledgers/:id/archive` → 服务端 `settlement` 计算；`|balanceDiff| < 0.01` 才通过；置 `status=ARCHIVED` + `archivedAt=now`；写 LEDGER_ARCHIVED 事件
- `ledgerAccess` 中间件：所有 mutation 路由在 status=ARCHIVED 时直接返回 409

**客户端：**
- 账本详情页增"归档"按钮（Admin + 未归档 + `settlement.isBalanced=true` 才 enabled）
- 归档后整页横幅"账本已归档"，所有输入 readonly
- ledger-list 的"已归档"tab 展示归档账本，点击进入只读视图

**验收：**
- 不平时点归档 → 服务端 409 带差值
- 平时点归档 → 成功 → UI 立即进入只读态
- 归档后 A/B 所有写 API 都返回 409
- 已归档账本可从列表进入查看

### Phase 7 — 个人中心 + bankroll 曲线

**目标：** 我的页面展示参与的账本与累计盈亏曲线

**服务端新增：**
```
server/src/routes/profile.ts         (GET /profile/ledgers, GET /profile/bankroll)
```
- `/profile/bankroll`：仅 ARCHIVED 账本；对每个账本取当前 user 的 player，用权威 settlement 公式算 myNet；按 archivedAt 升序输出 `{at, perLedgerNet, cumulative}` 数组

**客户端新增：**
```
src/stores/profileStore.ts
src/pages/profile/index.vue
src/components/BankrollChart.vue        (qiun-data-charts 包装)
```

**验收：**
- 曲线终值 = 各已归档账本 myNet 之和
- 进行中账本不计入曲线但出现在列表中
- 无归档账本时展示空态
- 点列表项进入对应账本（已归档则只读，进行中则可交互）

### 未来（Phase 8+）

v1 **不做**：WebSocket 升级、离线写队列、管理员转让、账号删除、管理后台 Web、微信登录、i18n

---

## 9. 部署指南

### 9.1 主机选择（推荐）

- 腾讯云轻量应用服务器 / 阿里云 ECS 1C2G，Ubuntu 22.04，约 ¥60/月
- 或本地 Docker + frp 穿透（开发期）

### 9.2 Linux 部署步骤

```bash
# 1. Node 20
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
nvm install 20 && nvm use 20

# 2. 取代码 + 安装
git clone <repo> /opt/holdem
cd /opt/holdem/server
npm ci

# 3. 准备 env
cp .env.example .env
# 编辑 DATABASE_URL=file:./data/holdem.db
#     JWT_ACCESS_SECRET=$(openssl rand -hex 64)
#     JWT_REFRESH_SECRET=$(openssl rand -hex 64)
#     PORT=3000
#     CORS_ORIGIN=https://holdem.example.com,http://localhost:5173
#     ADMIN_USERNAME=root
#     ADMIN_INITIAL_PASSWORD=<临时强密码>

# 4. DB 初始化 + 种子账号
mkdir -p data
npx prisma migrate deploy
npx prisma db seed

# 5. 构建并启动（PM2）
npm run build
npm i -g pm2
pm2 start dist/server.js --name holdem
pm2 save && pm2 startup

# 6. Nginx + HTTPS
apt install nginx certbot python3-certbot-nginx
# /etc/nginx/sites-available/holdem：
#   server { listen 80; server_name holdem.example.com;
#     location /api { proxy_pass http://127.0.0.1:3000; }
#     location /    { root /opt/holdem/dist/build/h5; try_files $uri /index.html; }
#   }
certbot --nginx -d holdem.example.com  # 自动签发并改写配置为 443

# 7. 客户端 H5 构建
cd /opt/holdem
VITE_API_BASE=https://holdem.example.com/api npm run build:h5
# 产物在 dist/build/h5/ 下；Nginx 已挂载

# 8. 每日 SQLite 备份
cat >/etc/cron.daily/holdem-backup <<'EOF'
#!/bin/bash
mkdir -p /backups/holdem
sqlite3 /opt/holdem/server/data/holdem.db ".backup /backups/holdem/holdem-$(date +%F).db"
find /backups/holdem -type f -mtime +30 -delete
EOF
chmod +x /etc/cron.daily/holdem-backup
```

### 9.3 微信小程序配置

1. `src/manifest.json` 中 `mp-weixin.appid` 填真实 appid
2. 生产构建前把 `mp-weixin.setting.urlCheck` 改回 `true`（或移除）
3. 微信公众平台 → 开发 → 开发管理 → 服务器域名：
   - `request` 合法域名：`https://holdem.example.com`
4. 登录页放《用户协议》和《隐私政策》链接（审核要求）
5. `VITE_API_BASE` 指向同一域名 `/api`

### 9.4 环境变量清单

| 变量 | 作用 |
|---|---|
| `DATABASE_URL` | `file:./data/holdem.db`；切 Postgres 仅改此行 |
| `JWT_ACCESS_SECRET` | 64 字节 hex 随机 |
| `JWT_REFRESH_SECRET` | 同上，与 access 不同 |
| `PORT` | 服务监听端口，建议 3000 |
| `CORS_ORIGIN` | 逗号分隔白名单 |
| `ADMIN_USERNAME` | seed 初始管理员账号 |
| `ADMIN_INITIAL_PASSWORD` | seed 初始密码，首次登录强制改 |
| `ARGON_MEMORY` / `ARGON_TIME` | 可选；默认 65536 / 3 |
| `VITE_API_BASE`（客户端构建时） | `https://holdem.example.com/api` |

---

## 10. 可复用的现有实现

| 复用对象 | 路径 |
|---|---|
| 序列号/ID 生成降级 fallback 写法 | `src/utils/id.ts`（仅参考，不直接复用；序列号用独立 Crockford 生成器） |
| `generateId()` | 客户端生成临时 key 时保留，服务端返回后替换 |
| `calcPlayerProfit` / `calcTotalUp` / `calcTotalDown` | `src/utils/calculator.ts`：**作为服务端 `settlement.ts` 的蓝本** 端到端翻译成 Node 版本；两端必须数字完全一致 |
| `StatsBar.vue` / `ConfirmDialog.vue` | 完全无写动作，零改动直接复用 |
| `PlayerRow.vue` / `EditPlayerModal.vue` / `ChipValueInput.vue` | 保留结构，新增 gating prop |
| `#HOLDEM#...#END#` 导出格式 | 仅用于首次启动的旧本地数据导出对话框 |

---

## 11. 验证方案（端到端）

Phase 完工时至少跑以下剧本：

1. **双端协作：** 两浏览器 tab 登录 A (Admin) / B (Player)；A 创建账本 → B 用序列号加入 → B 请求 buy-in 2 手 → A 在 5s 内看到红点 → A 批准 → 两端 buyInCount 同步
2. **权限矩阵：** B 尝试改 chipValue → 前端禁用；绕过 UI 直接 `curl` PATCH → 服务端 403
3. **chipAmount 权限（D2）：** A 能改任一 Player 的 chipAmount；B 改自己或他人的 chipAmount → 403
4. **自己 buy-in（D3）：** A 请求 1 手 → 无需手动批准，1 次 API 后 buyInCount 已更新，后台 DB 有一条 APPROVED 记录
5. **归档：** 故意不平 → 归档按钮 disabled；人为让平 → 成功归档 → A/B 所有写操作被拒
6. **Bankroll 曲线：** 归档 3 个账本，曲线终点 = 三局 myNet 之和；人工算盘校对
7. **Token 过期：** 把 access token 的 `exp` 手改成过去 → 下一次请求自动静默刷新，无感
8. **断网：** 关闭服务 → 客户端操作显示"网络连接失败"，不清态；恢复后重试成功
9. **WeChat MP 域名：** 切 `urlCheck:true` 构建 → 未白名单时 `uni.request` 直接失败；配置后通过
10. **本地数据迁移：** 升级前有 `POKER_APP_DATA` 的设备，启动后弹一次性对话框，导出 + 清空

---

## 12. 风险与已知限制

- **SQLite 单写者瓶颈：** 个位数 QPS 无影响；规模起来切 Postgres 改一行 `DATABASE_URL`
- **JWT 密钥轮换：** 无规划；个人用无妨，记入 README
- **无离线写队列：** 网络抖动时必须重试；未来 Phase 8 再设计
- **两端 settlement 数学漂移：** 客户端不自算，全部走 `/settlement` 接口；`server/src/services/settlement.ts` 在 Phase 4 开始前必须从客户端翻译一份并写单测
- **轮询 5s 对电量影响：** mini-program onHide 必须停止轮询；后台切回 onShow 恢复
- **小程序无安全存储：** token 明文 `setStorageSync`；属于业界普遍方案，可接受
- **qiun-data-charts 体积：** ~80KB gzip；若超小程序包大小 2MB 上限再评估自写 canvas

---

## 13. 首次开工 Checklist（给 future-self）

1. `cd /g/CCWorkSpace/Item-HoldemAccount`
2. 打开本 Plan 通读一遍，确认已理解 §2 的决策与 §3 的关键事实
3. 用 Grep / Read 核对 `src/stores/sessionStore.ts` 12 个 `_persist()` 行号是否仍与 §3 吻合；不符则重新探索再动手
4. 在仓库根目录新建 `server/` 目录（与 `src/` 并列；**不要**嵌入 `src/`）
5. 开始 Phase 1；每 Phase 完工用 §11 对应剧本验收；过了才进下一 Phase
6. `src/` 下客户端代码在 Phase 2 之前保持不动
7. 仓库根 `package.json` 是客户端的，`server/package.json` 是服务端的，暂不合并为 monorepo
8. 任何 "文档未覆盖" 的新决策，回头先更新本 Plan 再写代码

**关键易错点提醒：**
- `StorageAdapter` 是同步的这件事让现在的 `hydrate()` 能在 `<script setup>` 顶层跑；新的 async 版本必须下移到 `onLoad`/`onLaunch`，否则 mini-program 会白屏
- `generateId()` 产 UUID，服务端用 cuid，不要混用；仅服务端返回的 id 才能持久化
- `urlCheck:false` 开发方便但会掩盖生产域名白名单 bug，发版前必须切 true 测一次
- `isSettled` 这个死字段**不要**复活，归档态用 `status === 'ARCHIVED'`
- 所有数学计算走 `GET /ledgers/:id/settlement`，**客户端不自算**

---

*Plan 结束*
