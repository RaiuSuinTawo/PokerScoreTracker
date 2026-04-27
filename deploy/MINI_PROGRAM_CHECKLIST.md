# 微信小程序 · 发版 Checklist

发版前逐项勾选。本清单对应 `EXPANSION_PLAN.md §9.3`。

---

## 一次性准备（首次发版）

- [ ] 拥有微信小程序 appid（公众平台 → 小程序 → 设置 → 开发设置）
- [ ] 域名已完成 ICP 备案（微信要求）
- [ ] 服务器已按 `README.md` 部署完成，`https://你的域名/api/health` 在浏览器能访问
- [ ] **服务器域名白名单**（公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名）
  - `request` 合法域名：`https://你的域名`
  - 一次最多改 5 次 / 月，想好再加
- [ ] 安装了**微信开发者工具**（Windows/macOS）

---

## 代码改动清单（每次发版都检查）

- [ ] `src/manifest.json` → `mp-weixin.appid` = 你的真实 appid（不能留空）
- [ ] `src/manifest.json` → `mp-weixin.setting.urlCheck` 删除该键（默认 true），或显式写 `"urlCheck": true`
- [ ] `src/pages/login/index.vue` 底部 `.hint` 区域追加：
  - 《用户服务协议》链接
  - 《隐私政策》链接
  - （小程序审核要求；H5 非必需但建议一起加）
- [ ] 版本号更新：`src/manifest.json` → `versionName` / `versionCode`

---

## 构建

仓库根执行（或用 `deploy/build-mp-weixin.sh`）：

```bash
VITE_API_BASE=https://你的域名/api npm run build:mp-weixin
```

产物在 `dist/build/mp-weixin/`。

---

## 用微信开发者工具上传

1. 打开微信开发者工具 → 导入项目 → 选 `dist/build/mp-weixin/` 目录
2. 工具栏 **详情 → 本地设置**：
   - ☑ 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书 → **生产发版前必须取消勾选**
   - ☑ ES6 转 ES5（兼容低版本基础库）
   - ☑ 上传代码时样式自动补全
3. 预览（在你微信上扫码试一遍全流程：登录 → 改密 → 创建账本 → 加入 → buy-in → 批准 → 归档）
4. **上传**（输入版本号 + 备注）
5. 回到微信公众平台 → 版本管理 → 提交审核
6. 审核通过后"提交发布"即上线

---

## 预审核自测剧本（按此走一遍再提审）

用真机小程序 + 微信开发者工具两台同时登录，账号管理员在 CLI 上预先开好：

- [ ] 账号 `alice`（首次登录强制改密通过）
- [ ] 账号 `bob`（同上）

1. **登录与改密**
   - [ ] alice 首次登录 → 自动跳改密页 → 改完 → 登录列表（空）
2. **创建/加入账本**
   - [ ] alice 创建账本「周末小局」→ 看到 8 位序列号
   - [ ] bob 用序列号加入 → 账本在两人列表里都出现，bob 是 PLAYER
3. **买入审批**
   - [ ] bob 在账本中点自己那行 `+` → 请求 2 手
   - [ ] alice 收件箱 5s 内出现红点
   - [ ] alice 批准 → 两端 bob 行手数变 2
   - [ ] alice 自己点 `+` 1 手 → 无需审批直接生效（查收件箱历史能看到 APPROVED）
4. **公摊 & 权限**
   - [ ] alice 添加公摊 50
   - [ ] bob 尝试打开公摊页 → 只读横幅显示"仅管理员可管理"
   - [ ] bob 尝试编辑自己的 chipAmount → 应被前端禁用且后端返 403
5. **归档**
   - [ ] alice 录入 cashout 让账本平（如 alice 600 / bob 200，各 2 手 chipValue=200）
   - [ ] 底部归档按钮变蓝可点 → 归档
   - [ ] 账本整体进入"账本已归档"横幅状态
   - [ ] 两端任何写入尝试均 409
   - [ ] 账本移到"已归档"tab，点进去只读
6. **个人中心**
   - [ ] alice 个人中心显示 1 点 bankroll（+200），累计 200
   - [ ] bob 个人中心显示 -200 累计
7. **异常**
   - [ ] 断网后再操作 → 显示"网络连接失败，请重试"；恢复后重试成功
   - [ ] 在开发者工具里把 access token 的 `exp` 改到过去 → 下一次请求自动静默刷新

---

## 提审注意

- 类目需选"效率"或"工具"
- 隐私协议需写明：
  - 账号密码、账本数据存储于开发者服务器
  - 不收集任何用户位置、通讯录、相机权限
- 首次提审可能被要求补充"账号来源"说明（本项目是邀请制，管理员 CLI 发放账号）

---

## 回滚

- 如果线上发现问题：公众平台 → 版本管理 → 回退到上一版本（秒级）
- 服务端回滚：`pm2 stop holdem && git checkout <old> && sudo bash deploy/linux-update.sh`
- SQLite 回滚：停服 → `cp /backups/holdem/holdem-YYYY-MM-DD.db server/data/holdem.db` → 启服
