# 账号管理命令速查

所有命令在云托管 WebShell 里执行，先进入目录：

```bash
cd /app/server
```

---

## 查看所有账号

```bash
npx tsx src/cli/list-users.ts
```

## 创建新账号

```bash
npx tsx src/cli/create-user.ts -- --username 用户名 --password 初始密码 --display "显示名"
```

示例：
```bash
npx tsx src/cli/create-user.ts -- --username zhangsan --password 123456abc --display "张三"
npx tsx src/cli/create-user.ts -- --username lisi --password abc123456 --display "李四"
```

> 用户首次登录会被**强制修改密码**，初始密码简单即可。

## 重置密码

```bash
npx tsx src/cli/reset-password.ts -- --username 用户名 --password 新临时密码
```

> 重置后用户所有设备会被踢下线，下次登录需输入新密码，并再次强制改密。

## 禁用账号

```bash
npx tsx src/cli/disable-user.ts -- --username 用户名
```

## 恢复账号

```bash
npx tsx src/cli/disable-user.ts -- --username 用户名 --enable
```

---

## 快速参考表

| 操作 | 命令 |
|---|---|
| 查看所有账号 | `npx tsx src/cli/list-users.ts` |
| 创建账号 | `npx tsx src/cli/create-user.ts -- --username X --password Y --display "Z"` |
| 重置密码 | `npx tsx src/cli/reset-password.ts -- --username X --password Y` |
| 禁用账号 | `npx tsx src/cli/disable-user.ts -- --username X` |
| 恢复账号 | `npx tsx src/cli/disable-user.ts -- --username X --enable` |
