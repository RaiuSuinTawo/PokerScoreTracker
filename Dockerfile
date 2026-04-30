# HoldemAccount server — Dockerfile
#
# 只打包后端。支持两种部署方式：
#   1. 微信云托管（推荐）：容器由平台管理，MySQL 由平台提供
#   2. 自有服务器：配合 docker-compose 运行
#
# 客户端 H5 建议由宿主 Nginx 直挂静态目录（构建时注入 VITE_API_BASE）。

FROM node:20-bookworm-slim AS builder
WORKDIR /app

# 安装 OpenSSL（Prisma 需要）
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# 依赖层（利用 layer cache）
COPY server/package.json server/package-lock.json* ./server/
WORKDIR /app/server
RUN npm ci --no-audit --no-fund

# 源码 & prisma
COPY server/ ./
RUN npx prisma generate
RUN npm run build

# ─── 运行时镜像 ───
FROM node:20-bookworm-slim AS runner
WORKDIR /app/server
ENV NODE_ENV=production

# 安装 OpenSSL（Prisma 运行时连接 MySQL 需要）
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# 只拷 runtime 必需
COPY --from=builder /app/server/node_modules /app/server/node_modules
COPY --from=builder /app/server/dist /app/server/dist
COPY --from=builder /app/server/prisma /app/server/prisma
COPY --from=builder /app/server/src /app/server/src
COPY --from=builder /app/server/package.json /app/server/package.json
COPY --from=builder /app/server/tsconfig.json /app/server/tsconfig.json

# 云托管默认监听 80
ENV PORT=80
EXPOSE 80

# 每次启动都 prisma migrate deploy（幂等），然后启服务
CMD sh -c "npx prisma migrate deploy && node dist/server.js"
