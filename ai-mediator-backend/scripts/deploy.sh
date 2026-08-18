#!/usr/bin/env bash
# ═══════════════════════════════════════════════
# 部署脚本 — 构建 Docker → 推送到 CloudRun
# ═══════════════════════════════════════════════
set -e
cd "$(dirname "$0")/../cloudrun"

# 1. 构建镜像
IMAGE_NAME="ai-mediator-backend"
echo "=== Building Docker image ==="
docker build -t $IMAGE_NAME .

echo ""
echo "=== 部署到 CloudRun（腾讯云托管） ==="
echo "请先在云开发控制台开通 CloudRun，然后执行："
echo ""
echo "  # 推送镜像到腾讯云容器镜像服务"
echo "  docker tag $IMAGE_NAME ccr.ccs.tencentyun.com/<your-namespace>/$IMAGE_NAME"
echo "  docker push ccr.ccs.tencentyun.com/<your-namespace>/$IMAGE_NAME"
echo ""
echo "  # 或使用 tcb 命令行部署"
echo "  cd ../../app"
echo "  tcb cloudrun deploy --name ai-mediator-backend --image ccr.ccs.tencentyun.com/<your-namespace>/$IMAGE_NAME"
echo ""
echo "详情见 cloudbaserc.json 中的 CloudRun 配置。"
