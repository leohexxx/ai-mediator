#!/usr/bin/env bash
# ═══════════════════════════════════════════════
# 一键部署脚本 — 部署云函数 + 配置环境变量
# 前提: cloudbase MCP 已认证(已 READY)。运行: bash deploy.sh
# ═══════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

# 5 个 DeepSeek API Key（逗号分隔，轮询+故障切换用）
KEYS="sk-23bd49439b414f57befed541eb8ed185,sk-e34f919b70034cbaa9cd36d65fcb4deb,sk-5a4d075c50c74ed9b5d303b3e28750b1,sk-e0cd4608c3344e11ac176636924bd020,sk-e9fe7aead96441f3bafbcfd480e0f4a2"

echo ""
echo "=== 1/4 部署 analyzeCase 代码 (timeout=120s) ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionCode\",\"functionRootPath\":\"D:/4.开发工具/code/app/cloudfunctions\",\"functionName\":\"analyzeCase\",\"runtime\":\"Nodejs20.19\",\"handler\":\"index.main\",\"timeout\":120}"

echo ""
echo "=== 2/4 部署 chatWithAnalysis 代码 (timeout=60s) ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionCode\",\"functionRootPath\":\"D:/4.开发工具/code/app/cloudfunctions\",\"functionName\":\"chatWithAnalysis\",\"runtime\":\"Nodejs20.19\",\"handler\":\"index.main\",\"timeout\":60}"

echo ""
echo "=== 3/4 配置 analyzeCase 环境变量 (5 key + 模型 + baseUrl) ==="
# ⚠️ LLM_BASE_URL 必须显式设置，避免 CloudBase 残留旧值
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"analyzeCase\",\"envVariables\":{\"LLM_API_KEYS\":\"$KEYS\",\"LLM_PROVIDER\":\"deepseek\",\"LLM_MODEL\":\"deepseek-v4-flash\",\"DEEP_LLM_MODEL\":\"deepseek-v4-pro\",\"LLM_BASE_URL\":\"https://api.deepseek.com/v1\"}}"

echo ""
echo "=== 4/4 配置 chatWithAnalysis 环境变量 (5 key + 模型 + baseUrl) ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"chatWithAnalysis\",\"envVariables\":{\"LLM_API_KEYS\":\"$KEYS\",\"LLM_PROVIDER\":\"deepseek\",\"LLM_MODEL\":\"deepseek-v4-flash\",\"LLM_BASE_URL\":\"https://api.deepseek.com/v1\"}}"

echo ""
echo "══════════════════════════════════════"
echo "  ✅ 云函数部署 + 环境变量配置完成"
echo "══════════════════════════════════════"
echo "下一步: 微信开发者工具上传小程序代码"
echo ""
echo "当前环境变量:"
echo "  LLM_API_KEYS = 5 个 key 轮询 (逗号分隔)"
echo "  LLM_PROVIDER = deepseek"
echo "  LLM_MODEL    = deepseek-v4-flash"
echo "  LLM_BASE_URL = https://api.deepseek.com/v1"
echo "  DEEP_LLM_MODEL = deepseek-v4-pro (仅 analyzeCase)"
