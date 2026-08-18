#!/usr/bin/env bash
# 设置多 Key 环境变量到云函数
cd "$(dirname "$0")"

# LLM_API_KEYS 必须由本机环境或 CI 密钥注入，禁止写入仓库。
if [ -z "${LLM_API_KEYS:-}" ]; then
  echo "缺少 LLM_API_KEYS；请通过环境变量或 CI Secret 注入。" >&2
  exit 1
fi

echo "=== 设置 analyzeCase 环境变量（5 key + 模型 + 显式 baseUrl）==="
# ⚠️ LLM_BASE_URL 必须显式设置为 api.deepseek.com/v1
# 避免 CloudBase 上残留旧值（如 api.tokenhub.market 等错误 proxy）
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"analyzeCase\",\"envVariables\":{\"LLM_API_KEYS\":\"$LLM_API_KEYS\",\"LLM_PROVIDER\":\"deepseek\",\"LLM_MODEL\":\"deepseek-v4-flash\",\"DEEP_LLM_MODEL\":\"deepseek-v4-pro\",\"LLM_BASE_URL\":\"https://api.deepseek.com/v1\"}}"

echo ""
echo "=== 设置 chatWithAnalysis 环境变量（5 key + 模型 + 显式 baseUrl）==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"chatWithAnalysis\",\"envVariables\":{\"LLM_API_KEYS\":\"$LLM_API_KEYS\",\"LLM_PROVIDER\":\"deepseek\",\"LLM_MODEL\":\"deepseek-v4-flash\",\"LLM_BASE_URL\":\"https://api.deepseek.com/v1\"}}"

echo ""
echo "=== 设置 ocrBatch 环境变量 ==="
npx mcporter call cloudbase manageFunctions --args "{\"action\":\"updateFunctionConfig\",\"functionName\":\"ocrBatch\"}"

echo ""
echo "=== 部署完成 ==="
echo "LLM_API_KEYS = 5 个 key 轮询 (逗号分隔)"
echo "LLM_PROVIDER = deepseek"
echo "LLM_MODEL    = deepseek-v4-flash"
echo "DEEP_LLM_MODEL = deepseek-v4-pro (仅 analyzeCase)"
