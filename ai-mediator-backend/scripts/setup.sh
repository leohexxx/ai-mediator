#!/usr/bin/env bash
# ═══════════════════════════════════════════════
# 初始化脚本 — 本地开发环境 + 数据库初始化
# ═══════════════════════════════════════════════
set -e
cd "$(dirname "$0")/../cloudrun"

echo "=== 检查 Node.js ==="
node -v || { echo "请安装 Node.js >= 18"; exit 1; }

echo "=== 检查 ffmpeg ==="
ffmpeg -version 2>/dev/null || { echo "⚠️  ffmpeg 未安装，视频抽帧功能不可用"; }

echo "=== 安装依赖 ==="
npm install

echo ""
echo "=== 配置 ==="
if [ ! -f .env ]; then
  cp .env.example .env
  echo "已从 .env.example 创建 .env，请编辑填入你的 API Key"
else
  echo ".env 已存在"
fi

echo ""
echo "=== 启动（本地模式）==="
echo "npm run dev"
echo ""
echo "服务启动后:"
echo "  curl http://localhost:9000/api/health"
