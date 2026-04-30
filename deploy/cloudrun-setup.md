# 微信云托管 · 部署指南

本指南面向**零服务器经验**用户，手把手完成 HoldemAccount 在微信云托管上的部署。

**优势：** 免域名、免备案、免服务器、免 HTTPS 证书配置。

---

## 准备清单

| # | 东西 | 说明 |
|---|---|---|
| 1 | 微信小程序账号 | [mp.weixin.qq.com](https://mp.weixin.qq.com) 注册，拿到 AppID |
| 2 | 微信开发者工具 | [下载安装](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) |
| 3 | 本项目代码 | `git clone` 到你的电脑上 |

> 不需要买域名、不需要买服务器、不需要做 ICP 备案。

---

## 第一步：开通微信云托管

1. 登录 [微信云托管控制台](https://cloud.weixin.qq.com/)
2. 用你的**小程序管理员微信**扫码登录
3. 选择你的小程序 → 点击「**开通云托管**」
4. 选择地域（推荐 **上海**）
5. 等待环境创建完成（约 1-2 分钟）
6. 记录你的**环境 ID**（形如 `prod-xxxxxxx`），后面要用

---

## 第二步：创建 MySQL 数据库

1. 在云托管控制台左侧 → 「**数据库**」→ 「**新建**」
2. 选择 **MySQL**（TDSQL-C Serverless）
3. 设置数据库密码（**记住它**）
4. 等待创建完成（约 2-3 分钟）
5. 点击数据库实例 → 记录以下信息：

```
内网地址：xxx.sql.tencentcbs.com （或类似）
端口：3306
用户名：root
密码：（你设置的）
```

6. 进入数据库管理 → 创建一个数据库，名称填 `holdem`

---

## 第三步：创建云托管服务

1. 控制台左侧 → 「**服务管理**」→ 「**新建服务**」
2. 服务名称填：`holdem`
3. 备注可以写：德扑记账后端
4. 点击创建

---

## 第四步：配置环境变量

在刚创建的 `holdem` 服务页面 → 「**服务设置**」→ 「**环境变量**」，添加以下变量：

| 变量名 | 值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `mysql://root:你的密码@内网地址:3306/holdem` | 用第二步记录的信息拼接 |
| `JWT_ACCESS_SECRET` | （随机字符串，至少 32 位） | 在电脑终端运行 `openssl rand -hex 32` 生成 |
| `JWT_REFRESH_SECRET` | （另一个随机字符串） | 同上再生成一个 |
| `ADMIN_USERNAME` | `root` | 超级管理员用户名 |
| `ADMIN_INITIAL_PASSWORD` | `ChangeMe2026!` | 初始密码（首次登录强制修改） |
| `PORT` | `80` | 云托管默认端口 |
| `HOST` | `0.0.0.0` | 监听所有地址 |

> 💡 `openssl rand -hex 32` 会生成 64 位十六进制字符串，类似 `a3b1f9e2d4...`。

---

## 第五步：上传代码并部署

### 方式 A：通过 Git 仓库自动部署（推荐）

1. 在服务页面 → 「**部署**」→ 「**代码来源**」→ 选择 **Git 仓库**
2. 授权你的 GitHub / Gitee 仓库
3. 选择分支（通常是 `main`）
4. Dockerfile 路径填：`Dockerfile`（仓库根目录下）
5. 构建目录填：`.`（仓库根目录）
6. 点击「**部署**」

之后每次 git push 都会自动重新部署。

### 方式 B：本地构建上传

如果你的代码不在 Git 仓库里：

```bash
# 在项目根目录
docker build -t holdem-server .
# 然后在云托管控制台选择"镜像上传"方式
```

---

## 第六步：初始化数据库 & Seed 管理员

部署成功后，进入服务 → 「**WebShell**」（在线终端），执行：

```bash
cd /app/server
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

如果看到 `[seed] created user "root"` 就说明成功了。

---

## 第七步：验证服务是否正常

在 WebShell 里执行：

```bash
curl http://localhost/api/health
```

应返回：

```json
{"ok":true,"time":"2026-..."}
```

---

## 第八步：构建并上传小程序

回到你的电脑上，在项目根目录执行：

```bash
# 替换 prod-xxxxxxx 为你的环境 ID
# 替换 holdem 为你的服务名
VITE_CLOUD_ENV=prod-xxxxxxx VITE_CLOUD_SERVICE=holdem npm run build:mp-weixin
```

> **Windows 用户**如果上面命令报错，改用：
> ```powershell
> $env:VITE_CLOUD_ENV="prod-xxxxxxx"; $env:VITE_CLOUD_SERVICE="holdem"; npm run build:mp-weixin
> ```

构建产物在 `dist/build/mp-weixin/`。

---

## 第九步：微信开发者工具上传

1. 打开微信开发者工具 → **导入项目** → 选择 `dist/build/mp-weixin/`
2. 确认 AppID 已填写正确
3. **预览**（扫码在手机上测试一遍完整流程）
4. 测试通过后点 **上传** → 填版本号 + 备注
5. 回到微信公众平台 → 版本管理 → **提交审核**
6. 审核通过后 → **提交发布**

---

## 第十步：开账号给牌友

在云托管 WebShell 里执行：

```bash
cd /app/server

# 每个人执行一次
npx tsx src/cli/create-user.ts -- --username zhangsan --password 123456abc --display "张三"
npx tsx src/cli/create-user.ts -- --username lisi    --password 123456abc --display "李四"

# 查看所有账号
npx tsx src/cli/list-users.ts
```

用户首次登录会被强制修改密码。

---

## 后续更新

代码改动后：

1. **服务端更新**：如果用了 Git 自动部署，直接 `git push` 即可
2. **小程序更新**：
   ```bash
   VITE_CLOUD_ENV=prod-xxxxxxx VITE_CLOUD_SERVICE=holdem npm run build:mp-weixin
   ```
   → 微信开发者工具上传 → 提审 → 发布

---

## 费用参考

| 项目 | 费用 |
|---|---|
| 新用户资源包 | **免费** 400 元额度（3 个月有效） |
| 免费体验环境 | 每月 3000 资源点（约 3 元额度） |
| 超出后 CPU | 0.055 元/核·小时 |
| 超出后内存 | 0.032 元/GB·小时 |
| MySQL Serverless | 闲时自动缩容至 0，按用量计费 |

牌局记账 app 用量极小（几个人偶尔用），**前几个月基本免费**。

---

## 故障排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 小程序显示"网络连接失败" | VITE_CLOUD_ENV 或 VITE_CLOUD_SERVICE 未设置 | 重新构建小程序，确保环境变量正确 |
| 小程序显示"服务器错误" | 后端未部署或 MySQL 连接失败 | 检查云托管服务日志、MySQL 是否创建了 holdem 数据库 |
| WebShell 里 `prisma migrate` 报错 | DATABASE_URL 格式不对 | 检查环境变量里的数据库连接字符串 |
| 首次登录没反应 | 忘记执行 seed | 在 WebShell 执行 `npx tsx prisma/seed.ts` |
| 审核被拒 | 缺少隐私协议 / 类目不对 | 见 `deploy/MINI_PROGRAM_CHECKLIST.md` 提审注意事项 |
