#!/usr/bin/env bash
# ═══════════════════════════════════════════════
# 一键部署脚本 — 部署云函数 + 配置环境变量
# 前提: cloudbase MCP 已认证(已 READY)。运行: bash deploy.sh
# ═══════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

# LLM_API_KEYS 必须由本机环境或 CI 密钥注入，禁止写入仓库。
if [ -z "${LLM_API_KEYS:-}" ]; then
  echo "缺少 LLM_API_KEYS；请通过环境变量或 CI Secret 注入。" >&2
  exit 1
fi

echo ""
echo "=== 1/8 部署 analyzeCase 代码 (timeout=120s) ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionCode\",\"functionRootPath\":\"D:/4.开发工具/code/app/cloudfunctions\",\"functionName\":\"analyzeCase\",\"runtime\":\"Nodejs20.19\",\"handler\":\"index.main\",\"timeout\":120}"

echo ""
echo "=== 2/8 部署 chatWithAnalysis 代码 (timeout=60s) ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionCode\",\"functionRootPath\":\"D:/4.开发工具/code/app/cloudfunctions\",\"functionName\":\"chatWithAnalysis\",\"runtime\":\"Nodejs20.19\",\"handler\":\"index.main\",\"timeout\":60}"

echo ""
echo "=== 3/8 部署 ocrImage 代码 (timeout=60s) ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionCode\",\"functionRootPath\":\"D:/4.开发工具/code/app/cloudfunctions\",\"functionName\":\"ocrImage\",\"runtime\":\"Nodejs20.19\",\"handler\":\"index.main\",\"timeout\":60}"

echo "=== 等待 ocrImage 就绪 ==="
sleep 8

npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"ocrImage\",\"timeout\":60,\"permissions\":{\"openapi\":[\"ocr.printedText\"]}}"

echo ""
echo "=== 4/8 部署 ocrBatch 代码 (timeout=120s) ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionCode\",\"functionRootPath\":\"D:/4.开发工具/code/app/cloudfunctions\",\"functionName\":\"ocrBatch\",\"runtime\":\"Nodejs20.19\",\"handler\":\"index.main\",\"timeout\":120}"

echo "=== 等待 ocrBatch 就绪 ==="
sleep 8

npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"ocrBatch\",\"timeout\":120,\"permissions\":{\"openapi\":[\"ocr.printedText\"]}}"

echo ""
echo "=== 5/7 创建 compressText 函数(如已存在会报错忽视) ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"createFunction\",\"func\":{\"name\":\"compressText\"},\"functionRootPath\":\"D:/4.开发工具/code/app/cloudfunctions/compressText\",\"runtime\":\"Nodejs20.19\",\"handler\":\"index.main\",\"timeout\":120}" 2>/dev/null || true

echo ""
echo "=== 6/7 部署 compressText 代码 (timeout=120s) ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionCode\",\"functionRootPath\":\"D:/4.开发工具/code/app/cloudfunctions\",\"functionName\":\"compressText\",\"runtime\":\"Nodejs20.19\",\"handler\":\"index.main\",\"timeout\":120}"

echo ""
echo "=== 等待 compressText 就绪 ==="
sleep 8

echo ""
echo "=== 7/8 配置 compressText 环境变量 ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"compressText\",\"envVariables\":{\"LLM_API_KEYS\":\"$LLM_API_KEYS\",\"LLM_PROVIDER\":\"deepseek\",\"LLM_MODEL\":\"deepseek-v4-flash\",\"LLM_BASE_URL\":\"https://api.deepseek.com/v1\"}}"

echo ""
echo "=== 8/8 配置 analyzeCase + chatWithAnalysis 环境变量 ==="
# ⚠️ LLM_BASE_URL 必须显式设置，避免 CloudBase 残留旧值
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"analyzeCase\",\"envVariables\":{\"LLM_API_KEYS\":\"$LLM_API_KEYS\",\"LLM_PROVIDER\":\"deepseek\",\"LLM_MODEL\":\"deepseek-v4-flash\",\"DEEP_LLM_MODEL\":\"deepseek-v4-pro\",\"LLM_BASE_URL\":\"https://api.deepseek.com/v1\"}}"

npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"chatWithAnalysis\",\"envVariables\":{\"LLM_API_KEYS\":\"$LLM_API_KEYS\",\"LLM_PROVIDER\":\"deepseek\",\"LLM_MODEL\":\"deepseek-v4-flash\",\"LLM_BASE_URL\":\"https://api.deepseek.com/v1\"}}"

echo ""
echo "══════════════════════════════════════"
echo "=== 云函数部署完成 ==="
echo "  已部署: analyzeCase, chatWithAnalysis, ocrImage, ocrBatch, compressText"
echo "  已配置环境变量: analyzeCase, chatWithAnalysis, compressText"
echo "══════════════════════════════════════"
echo "下一步: 微信开发者工具上传小程序代码"
echo ""
echo "当前环境变量:"
echo "  LLM_API_KEYS = 5 个 key 轮询 (逗号分隔)"
echo "  LLM_PROVIDER = deepseek"
echo "  LLM_MODEL    = deepseek-v4-flash"
echo "  LLM_BASE_URL = https://api.deepseek.com/v1"
echo "  DEEP_LLM_MODEL = deepseek-v4-pro (仅 analyzeCase)"
