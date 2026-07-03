# NextChat 阿里云轻量部署标准文档

本文件是 `NextChat` 后续服务器部署的标准依据，面向资源较小的 Linux 服务器。服务器只负责拉取固定 tag 镜像、启动容器、Nginx HTTPS 反代、健康检查和有限清理，不负责构建。

## 部署原则

- 部署域名固定为 `nextchat.zyspeed.xyz`。
- 服务器角色固定为“只 pull 镜像、只 up 容器、只做健康检查”，不在服务器构建。
- 构建、打包、推镜像必须在 GitHub Actions 或本地开发机器完成。
- 生产环境必须使用固定镜像 tag，禁止使用 `latest`。
- NextChat 容器只绑定宿主机本地端口 `127.0.0.1:33000`，公网入口只走 Nginx HTTPS。
- 部署前必须确认本次 tag 镜像已经发布成功，并保留上一版可回滚 tag。
- 小服务器上禁止执行高负载构建命令，避免 CPU、内存、磁盘被打满。

## 服务器禁止事项

禁止在服务器执行以下命令：

```bash
docker compose up -d --build
docker build .
npm install
npm ci
yarn install
yarn build
npm run build
next build
docker system prune -a
```

`docker system prune -a` 会删除其他服务镜像或回滚镜像，不能作为常规清理命令。

## 固定变量约定

每次部署前先确认以下变量。`IMAGE_TAG` 必须改成已审核通过的固定发布 tag，不能写 `latest`。

```bash
export DEPLOY_DIR=/opt/nextchat
export CONTAINER_NAME=nextchat
export DOMAIN=nextchat.zyspeed.xyz
export LOCAL_PORT=33000
export IMAGE_REPO=ghcr.io/ywainzh/nextchat
export IMAGE_TAG=2026.07.03-1
export PREV_IMAGE_TAG=
export APP_IMAGE=${IMAGE_REPO}:${IMAGE_TAG}
export PREV_APP_IMAGE=
export RELEASE_DOC=releases/RELEASE-${IMAGE_TAG}.md
```

日常升级时把 `PREV_IMAGE_TAG` 设置为上一版可回滚 tag。

## 发布前本地检查

这些命令在本地开发机或 CI 执行，不在服务器执行：

```bash
cd /path/to/NextChat
yarn install --frozen-lockfile
yarn build
git status
git tag 2026.07.03-1
git push origin 2026.07.03-1
```

本机 GitHub 凭据如果同时存在多个账号，必须使用 `~/.ssh/config` 中的 `github-ywainzh` Host 推送，避免 HTTPS 凭据被识别成其他账号：

```bash
ssh -T github-ywainzh
git remote set-url origin github-ywainzh:ywainzh/NextChat.git
git push origin main
git push origin 2026.07.03-1
```

认证成功时，`ssh -T github-ywainzh` 会显示 `Hi ywainzh!`。如果出现 `Permission denied` 或 GitHub 提示其他账号，先修正 SSH Host 或密钥，不能继续发布。

推送 tag 后必须打开 GitHub Actions 确认 `Publish GHCR image` 出现对应 run：

```text
https://github.com/ywainzh/NextChat/actions/workflows/docker.yml
```

如果页面仍显示 `This workflow has no runs yet`，说明 tag push 没有触发 Actions。此时先在 GitHub 网页确认仓库 Actions 已启用，必要时用网页上的 `Run workflow` 手动触发，或用有权限的 Personal Access Token / GitHub App token 重新推送 tag。不要在 GHCR 镜像不存在时继续服务器部署。

手动触发时推荐选择 `main` 分支，并在 `image_tag` 输入固定发布 tag，例如：

```text
2026.07.03-3
```

`platforms` 默认填写 `linux/amd64`，适合当前阿里云 x86_64 服务器，也能显著缩短构建时间。这样 GHCR 会生成 `ghcr.io/ywainzh/nextchat:2026.07.03-3`，仍然满足固定 tag 部署要求。`image_tag` 禁止填写 `latest`。

镜像发布后检查固定 tag 是否存在：

```bash
docker manifest inspect ghcr.io/ywainzh/nextchat:2026.07.03-1
```

如果本机没有 Docker，可用 GitHub Actions 页面确认 `Publish GHCR image` 成功，再到服务器执行 `docker manifest inspect` 做最终确认。镜像未确认成功前，不允许部署。

## 服务器文件准备

服务器部署目录固定为 `/opt/nextchat`。目录内只需要以下文件：

```text
/opt/nextchat
├── docker-compose.yml
├── .env
└── releases/
```

首次准备：

```bash
sudo mkdir -p /opt/nextchat/releases
cd /opt/nextchat
```

将项目根目录的 `docker-compose.yml` 上传到 `/opt/nextchat/docker-compose.yml`。将 `.env.template` 复制为服务器的 `.env`，然后至少填写：

```bash
APP_IMAGE=ghcr.io/ywainzh/nextchat:2026.07.03-1
HOST_PORT=127.0.0.1:33000
OPENAI_API_KEY=replace-with-openai-key
CODE=your-password
TAVILY_API_KEY=replace-with-tavily-key
```

按需填写 `BASE_URL`、`DEEPSEEK_API_KEY`、`GOOGLE_API_KEY`、`ANTHROPIC_API_KEY` 等业务变量。真实密钥只写服务器 `.env`，不能提交到 Git。不要把宿主机端口写到 `PORT`，Next.js 会把 `PORT` 当作容器内部监听端口；宿主机端口统一使用 `HOST_PORT`。

## 部署前检查

```bash
cd "$DEPLOY_DIR"
pwd
ls -lah
docker version
docker compose version
free -h
df -h /
docker system df
ss -lntp | grep -E ':(80|443|33000)\b' || true
test -f docker-compose.yml
test -f .env
test -f "$RELEASE_DOC"
grep '^APP_IMAGE=' .env
grep '^HOST_PORT=127.0.0.1:33000$' .env
grep -q ':latest$' .env && echo 'ERROR: latest is forbidden' && exit 1 || echo 'APP_IMAGE tag ok'
docker compose config
docker manifest inspect "$APP_IMAGE"
docker compose ps
docker ps --filter name="$CONTAINER_NAME"
```

如果 `RELEASE_DOC` 不存在，或者 `APP_IMAGE` 使用了 `latest`，立即停止。

## 首次部署

以下步骤只在确认固定 tag 镜像已存在后执行：

```bash
export DEPLOY_DIR=/opt/nextchat
export CONTAINER_NAME=nextchat
export DOMAIN=nextchat.zyspeed.xyz
export LOCAL_PORT=33000
export IMAGE_REPO=ghcr.io/ywainzh/nextchat
export IMAGE_TAG=2026.07.03-1
export PREV_IMAGE_TAG=
export APP_IMAGE=${IMAGE_REPO}:${IMAGE_TAG}
export PREV_APP_IMAGE=
export RELEASE_DOC=releases/RELEASE-${IMAGE_TAG}.md

cd "$DEPLOY_DIR"
df -h /
docker system df
test -f docker-compose.yml
test -f .env
test -f "$RELEASE_DOC"
grep '^APP_IMAGE=' .env
grep '^HOST_PORT=127.0.0.1:33000$' .env
grep -q ':latest$' .env && echo 'ERROR: latest is forbidden' && exit 1 || echo 'APP_IMAGE tag ok'
docker compose config
docker manifest inspect "$APP_IMAGE"
sed -i "s#^APP_IMAGE=.*#APP_IMAGE=${APP_IMAGE}#" .env
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 "$CONTAINER_NAME"
docker stats --no-stream "$CONTAINER_NAME"
curl -f "http://127.0.0.1:${LOCAL_PORT}/api/health"
docker inspect "$CONTAINER_NAME" --format 'Memory={{.HostConfig.Memory}} MemoryReservation={{.HostConfig.MemoryReservation}} NanoCpus={{.HostConfig.NanoCpus}}'
df -h /
docker system df
```

健康检查期望返回包含 `"ok":true` 的 JSON；Compose healthcheck 使用 `wget -qO- http://$$HOSTNAME:3000/api/health >/dev/null`。这里必须写 `$$HOSTNAME`，让 Docker Compose 保留 `$HOSTNAME` 给容器内 shell 展开。Next standalone 在容器内绑定到容器 hostname，不能用 `127.0.0.1` 做容器内健康检查。

## Nginx HTTPS

新增 `/etc/nginx/sites-available/nextchat.zyspeed.xyz.conf`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name nextchat.zyspeed.xyz;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:33000;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用并申请证书：

```bash
sudo ln -sf /etc/nginx/sites-available/nextchat.zyspeed.xyz.conf /etc/nginx/sites-enabled/nextchat.zyspeed.xyz.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d nextchat.zyspeed.xyz
sudo nginx -t
sudo systemctl reload nginx
curl -I https://nextchat.zyspeed.xyz
```

## 日常升级部署

日常升级只改 `.env` 中的 `APP_IMAGE`，然后 pull/up，不在服务器构建。

```bash
export DEPLOY_DIR=/opt/nextchat
export CONTAINER_NAME=nextchat
export IMAGE_REPO=ghcr.io/ywainzh/nextchat
export IMAGE_TAG=2026.07.03-1
export PREV_IMAGE_TAG=2026.07.02-1
export APP_IMAGE=${IMAGE_REPO}:${IMAGE_TAG}
export PREV_APP_IMAGE=${IMAGE_REPO}:${PREV_IMAGE_TAG}
export RELEASE_DOC=releases/RELEASE-${IMAGE_TAG}.md

cd "$DEPLOY_DIR"
df -h /
docker system df
test -f docker-compose.yml
test -f .env
test -f "$RELEASE_DOC"
grep '^HOST_PORT=127.0.0.1:33000$' .env
grep -q ':latest$' .env && echo 'ERROR: latest is forbidden' && exit 1 || echo 'APP_IMAGE tag ok'
docker compose config
docker manifest inspect "$APP_IMAGE"
cp .env ".env.bak.${IMAGE_TAG}"
sed -i "s#^APP_IMAGE=.*#APP_IMAGE=${APP_IMAGE}#" .env
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 "$CONTAINER_NAME"
docker stats --no-stream "$CONTAINER_NAME"
curl -f http://127.0.0.1:33000/api/health
curl -I https://nextchat.zyspeed.xyz
```

如果健康检查失败，不要清理旧镜像，先按故障排查或回滚处理。

## 回滚步骤

回滚只切回上一版已验证固定 tag：

```bash
export DEPLOY_DIR=/opt/nextchat
export CONTAINER_NAME=nextchat
export IMAGE_REPO=ghcr.io/ywainzh/nextchat
export PREV_IMAGE_TAG=2026.07.02-1
export PREV_APP_IMAGE=${IMAGE_REPO}:${PREV_IMAGE_TAG}

cd "$DEPLOY_DIR"
cp .env ".env.rollback.$(date +%Y%m%d%H%M%S)"
sed -i "s#^APP_IMAGE=.*#APP_IMAGE=${PREV_APP_IMAGE}#" .env
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 "$CONTAINER_NAME"
curl -f http://127.0.0.1:33000/api/health
curl -I https://nextchat.zyspeed.xyz
```

## 日志和状态检查

```bash
cd /opt/nextchat
docker compose ps
docker ps --filter name=nextchat
docker inspect nextchat --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
docker inspect nextchat --format 'Memory={{.HostConfig.Memory}} MemoryReservation={{.HostConfig.MemoryReservation}} NanoCpus={{.HostConfig.NanoCpus}}'
docker compose logs --tail=200 nextchat
docker stats --no-stream nextchat
free -h
df -h
docker system df
```

持续看日志：

```bash
cd /opt/nextchat
docker compose logs -f nextchat
```

## 健康检查

容器内检查：

```bash
cd /opt/nextchat
docker compose exec -T nextchat wget -qO- http://127.0.0.1:3000/api/health
```

宿主机检查：

```bash
curl -f http://127.0.0.1:33000/api/health
```

浏览器访问：

```text
https://nextchat.zyspeed.xyz
```

## 安全清理旧镜像

清理只能在新版本健康检查成功后执行。只删除 `ghcr.io/ywainzh/nextchat:*` 的旧镜像，保留当前版本和上一版回滚版本。

```bash
cd "$DEPLOY_DIR"
df -h /
docker system df

docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}}' \
  | while read -r image image_id; do
      case "$image" in
        "${IMAGE_REPO}:"*)
          if [ "$image" != "$APP_IMAGE" ] && { [ -z "${PREV_APP_IMAGE:-}" ] || [ "$image" != "$PREV_APP_IMAGE" ]; }; then
            echo "remove old image: $image"
            docker image rm "$image" || true
          fi
          ;;
      esac
    done

df -h /
docker system df
docker image ls --format '{{.Repository}}:{{.Tag}} {{.Size}}' | grep 'ghcr.io/ywainzh/nextchat' || true
```

## 故障排查顺序

1. 先看容器是否运行：`docker compose ps`。
2. 再看日志：`docker compose logs --tail=200 nextchat`。
3. 再看本机服务：`curl -f http://127.0.0.1:33000/api/health`。
4. 再看 Nginx：`sudo nginx -t`、`sudo tail -n 100 /var/log/nginx/error.log`。
5. 再看资源：`free -h`、`df -h`、`docker stats --no-stream nextchat`。
6. 再检查 `.env`：`grep -E '^(APP_IMAGE|HOST_PORT|OPENAI_API_KEY|CODE|BASE_URL|DEEPSEEK_API_KEY|TAVILY_API_KEY)=' .env`。
7. 如果新版本无法恢复，按回滚步骤切回上一版固定 tag。

## 标准部署结果回报

每次部署完成后，需要记录并回报：

- 本次部署的 `APP_IMAGE`。
- `docker compose ps` 状态。
- 最近 200 行日志是否有明显错误。
- 本机 `/api/health` 是否返回 `"ok":true`。
- `https://nextchat.zyspeed.xyz` 是否可访问且证书有效。
- `docker stats --no-stream nextchat` 的资源占用。
- 清理前后 `df -h /` 和 `docker system df` 的磁盘占用。
- 是否保留了上一版可回滚镜像。
