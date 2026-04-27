# HoldemAccount server — Dockerfile
#
# 只打包后端。客户端 H5 建议仍由宿主 Nginx 直挂静态目录（构建时注入 VITE_API_BASE）。
# 如果需要把 H5 也放进镜像，可以再写一个多阶段镜像，这里保持最小化。

FROM node:20-bookworm-slim AS builder
WORKDIR /app

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

# 只拷 runtime 必需
COPY --from=builder /app/server/node_modules /app/server/node_modules
COPY --from=builder /app/server/dist /app/server/dist
COPY --from=builder /app/server/prisma /app/server/prisma
COPY --from=builder /app/server/package.json /app/server/package.json

# 数据卷挂载点
RUN mkdir -p /app/server/data
VOLUME ["/app/server/data"]

EXPOSE 3000

# 每次启动都 prisma migrate deploy（幂等），然后启服务
CMD sh -c "npx prisma migrate deploy && node dist/server.js"
