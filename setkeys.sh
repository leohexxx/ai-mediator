#!/usr/bin/env bash
# 设置多 Key 环境变量到云函数
cd "$(dirname "$0")"

# 5 个 DeepSeek API Key（逗号分隔，轮询+故障切换用）
KEYS="sk-23bd49439b414f57befed541eb8ed185,sk-e34f919b70034cbaa9cd36d65fcb4deb,sk-5a4d075c50c74ed9b5d303b3e28750b1,sk-e0cd4608c3344e11ac176636924bd020,sk-e9fe7aead96441f3bafbcfd480e0f4a2"

echo "=== 设置 analyzeCase 环境变量（5 key + 模型 + 显式 baseUrl）==="
# ⚠️ LLM_BASE_URL 必须显式设置为 api.deepseek.com/v1
# 避免 CloudBase 上残留旧值（如 api.tokenhub.market 等错误 proxy）
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"analyzeCase\",\"envVariables\":{\"LLM_API_KEYS\":\"$KEYS\",\"LLM_PROVIDER\":\"deepseek\",\"LLM_MODEL\":\"deepseek-v4-flash\",\"DEEP_LLM_MODEL\":\"deepseek-v4-pro\",\"LLM_BASE_URL\":\"https://api.deepseek.com/v1\"}}"

echo ""
echo "=== 设置 chatWithAnalysis 环境变量（5 key + 模型 + 显式 baseUrl）==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"chatWithAnalysis\",\"envVariables\":{\"LLM_API_KEYS\":\"$KEYS\",\"LLM_PROVIDER\":\"deepseek\",\"LLM_MODEL\":\"deepseek-v4-flash\",\"LLM_BASE_URL\":\"https://api.deepseek.com/v1\"}}"

echo ""
echo "=== 部署完成 ==="
echo "LLM_API_KEYS = 5 个 key 轮询 (逗号分隔)"
echo "LLM_PROVIDER = deepseek"
echo "LLM_MODEL    = deepseek-v4-flash"
echo "DEEP_LLM_MODEL = deepseek-v4-pro (仅 analyzeCase)"
