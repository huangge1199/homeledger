# 部署说明（v2.0 Vue 3 重构后）

> 适用于家账簿 HomeLedger **v2.0+**（Vue 3 + Naive UI 重构版）。  
> 部署目标：单容器运行、单数据库文件、可自托管。

## 1. 三种部署方式

### 方式 A：Docker（推荐，零依赖）

**前置**：Docker 24+

```bash
# 1. 克隆/拉取镜像（开发者构建后发布到 GHCR / Docker Hub）
docker pull ghcr.io/yourname/homeledger:latest

# 2. 准备数据目录
mkdir -p /srv/homeledger/data

# 3. 启动
docker run -d \
  --name homeledger \
  -p 5111:5111 \
  -v /srv/homeledger/data:/data \
  -e TZ=Asia/Shanghai \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_PASSWORD='YourStrong!Pass' \
  ghcr.io/yourname/homeledger:latest

# 4. 访问
# http://localhost:5111
```

环境变量见 [§ 配置项](#3-配置项)。

### 方式 B：Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  homeledger:
    image: ghcr.io/yourname/homeledger:latest
    container_name: homeledger
    ports:
      - "5111:5111"
    volumes:
      - ./data:/data
    environment:
      - TZ=Asia/Shanghai
      - SESSION_SECRET=${SESSION_SECRET:?Set a random 32-byte hex}
      - ADMIN_USER=admin
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:?Set initial admin password}
      - PORT=5111
    restart: unless-stopped
```

```bash
export SESSION_SECRET="$(openssl rand -hex 32)"
export ADMIN_PASSWORD='YourStrong!Pass'
docker compose up -d
```

### 方式 C：直接 Node 运行

```bash
# 1. 拉代码
git clone <repo> /opt/homeledger
cd /opt/homeledger

# 2. 安装后端依赖
npm install --production

# 3. 构建前端（生成 web/dist）
cd web && npm install && npm run build && cd ..

# 4. 配置 .env
cp .env.example .env
# 编辑 .env

# 5. 启动（建议用 pm2 / systemd）
node --no-warnings --env-file=.env server.js
```

**systemd 单元示例**：

```ini
# /etc/systemd/system/homeledger.service
[Unit]
Description=HomeLedger
After=network.target

[Service]
Type=simple
User=homeledger
WorkingDirectory=/opt/homeledger
EnvironmentFile=/opt/homeledger/.env
ExecStart=/usr/bin/node --no-warnings server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now homeledger
```

## 2. 升级 / 重新部署

```bash
# 拉新镜像
docker pull ghcr.io/yourname/homeledger:latest

# 停旧容器（数据在 /srv/homeledger/data，不会丢）
docker stop homeledger
docker rm homeledger

# 重新启动（同命令）
docker run -d --name homeledger \
  -p 5111:5111 \
  -v /srv/homeledger/data:/data \
  -e SESSION_SECRET="..." \
  -e ADMIN_PASSWORD='...' \
  ghcr.io/yourname/homeledger:latest
```

数据库迁移由 server.js 启动时自动执行（建表 / 加列），无需手动干预。

## 3. 配置项

通过环境变量（`.env` 文件或 Docker `-e`）：

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `PORT` | 否 | `5111` | HTTP 端口 |
| `TZ` | 否 | `Asia/Shanghai` | 时区（影响"今天"边界） |
| `DATA_DIR` | 否 | `/data` | 数据库和附件存储路径 |
| `SESSION_SECRET` | **是** | `change-me...` | Cookie 签名密钥，**必须**改成长随机 |
| `ADMIN_USER` | 否 | `admin` | 首次启动自动创建的管理员 |
| `ADMIN_PASSWORD` | 否 | `admin888` | 首次启动自动创建的管理员密码 |
| `ALLOW_REGISTER` | 否 | `false` | 是否允许自助注册（家庭用建议关闭） |

## 4. 数据备份

```bash
# 备份数据库（容器内）
docker exec homeledger node -e "
  const db = require('better-sqlite3')('/data/homeledger.db');
  require('fs').writeFileSync('/data/backup-\$(date +%F).db',
    Buffer.from(db.serialize()));
"

# 或直接拷贝文件（SQLite 备份前最好先停容器）
docker stop homeledger
cp /srv/homeledger/data/homeledger.db /backup/homeledger-$(date +%F).db
docker start homeledger
```

应用内也提供 Web 端备份入口：**设置 → 备份 → 下载数据库备份**。

## 5. 反向代理（Nginx / Caddy）

### Nginx

```nginx
server {
  listen 80;
  server_name finance.example.com;
  client_max_body_size 50M;        # 附件上传

  location / {
    proxy_pass http://127.0.0.1:5111;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

### Caddy

```caddyfile
finance.example.com {
  reverse_proxy 127.0.0.1:5111
  encode zstd gzip
}
```

## 6. HTTPS

强烈建议用反向代理加 HTTPS（Let's Encrypt / Caddy 自动证书）。  
**不要**直接对外暴露 5111。

## 7. 监控

```bash
# 健康检查端点
curl http://localhost:5111/healthz

# 实时日志
docker logs -f homeledger
```

## 8. 故障排查

| 现象 | 排查 |
|---|---|
| 启动失败：`Permission denied` | `chown -R 1000:1000 /srv/homeledger/data`（容器内 UID 1000） |
| 登录后跳回登录页 | 检查 `SESSION_SECRET` 是否改动（每次改动会失效所有 session） |
| 附件上传失败 | `client_max_body_size` 不够，或 DATA_DIR 空间不足 |
| 端口占用 | 改 `PORT` 环境变量 |
| 时区不对 | 确认 `TZ=Asia/Shanghai` 注入到容器内 |
| AI 不可用 | 在 **设置 → AI 设置** 填 Base URL + API Key（OpenAI 兼容） |

## 9. 迁移到 v2.0（从 v1 EJS 旧版本）

v1 升级到 v2 的数据库结构兼容，**直接替换镜像/代码即可**：

```bash
# 1. 备份
cp /srv/homeledger/data/homeledger.db /backup/

# 2. 拉新版本（web/dist 已经在镜像内）
docker pull ghcr.io/yourname/homeledger:v2.0

# 3. 启动（同 v1 数据目录）
docker run -d --name homeledger ... ghcr.io/yourname/homeledger:v2.0

# 4. 访问，自动启用新前端
# http://localhost:5111
```

旧的 EJS 路由会被 SPA fallback 接管（保留 `GET /login` / `GET /setup` 用于兼容性）。

## 10. 系统要求

| 资源 | 最低 | 推荐 |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| 内存 | 256 MB | 512 MB |
| 磁盘 | 1 GB | 10 GB（带附件） |
| Node | 20+ | 22 LTS |

## 11. 端口

| 端口 | 用途 |
|---|---|
| 5111 | Web UI + API（`/api/v1/*` + `/api/open/*`） |
| 5111/healthz | 健康检查 |

## 12. 技术栈

- **前端**：Vue 3.5 + TypeScript 5.5 + Vite 5 + Naive UI 2.40 + Pinia 3 + ECharts 5
- **后端**：Node.js 22 + Express 4 + better-sqlite3 11
- **存储**：SQLite 3（单文件）
- **AI**（可选）：OpenAI 兼容 API
