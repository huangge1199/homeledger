# ==============================================================
#  家账簿 HomeLedger —— 多阶段 Dockerfile
#  stage1: 构建前端 web/dist
#  stage2: 运行时镜像，仅含后端 + 构建产物
# ==============================================================

# ---------- 前端构建 ----------
FROM node:latest AS web-builder
WORKDIR /build

COPY web/package.json web/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY web/ ./
RUN npm run build

# ---------- 运行时 ----------
FROM node:latest

ENV TZ=Asia/Shanghai \
    NODE_ENV=production \
    PORT=5111 \
    DATA_DIR=/data

WORKDIR /app

# 后端依赖
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 拷贝后端源码
COPY --chown=node:node server.js ./
COPY --chown=node:node src ./src

# 拷贝前端构建产物
COPY --from=web-builder --chown=node:node /build/dist ./web/dist

# 数据卷
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node

EXPOSE 5111

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5111)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--no-warnings", "server.js"]
