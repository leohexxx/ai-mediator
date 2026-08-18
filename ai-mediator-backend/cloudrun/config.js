// ═══════════════════════════════════════════════
// 配置加载 — 从环境变量读取，提供默认值
// ═══════════════════════════════════════════════
require('dotenv').config();

var config = {
  port: parseInt(process.env.PORT || '9000', 10),

  // CloudBase 环境
  cloudbase: {
    envId: process.env.CLOUDBASE_ENV_ID || '',
    secretId: process.env.CLOUDBASE_SECRET_ID || '',
    secretKey: process.env.CLOUDBASE_SECRET_KEY || '',
  },

  // LLM
  llm: {
    apiKeys: (process.env.LLM_API_KEYS || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
    provider: process.env.LLM_PROVIDER || 'deepseek',
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    deepModel: process.env.DEEP_LLM_MODEL || 'deepseek-v4-pro',
    // 基础 URL，按 provider 自动选择
    baseUrl: (function () {
      if (process.env.LLM_BASE_URL) return process.env.LLM_BASE_URL;
      if (process.env.LLM_PROVIDER === 'anthropic') return 'https://api.anthropic.com/v1';
      if (process.env.LLM_PROVIDER === 'openai') return 'https://api.openai.com/v1';
      return 'https://api.deepseek.com/v1'; // deepseek 默认
    })(),
  },

  // OCR
  ocr: {
    provider: process.env.OCR_PROVIDER || 'ocrspace',
    ocrSpaceKey: process.env.OCR_SPACE_API_KEY || '',
    tencentSecretId: process.env.TENCENT_OCR_SECRET_ID || '',
    tencentSecretKey: process.env.TENCENT_OCR_SECRET_KEY || '',
  },

  // 视频
  video: {
    maxFrames: parseInt(process.env.VIDEO_MAX_FRAMES || '30', 10),
    fps: parseFloat(process.env.VIDEO_FPS || '0.5'),
  },

  analysisJobs: {
    pollIntervalMs: parseInt(process.env.ANALYSIS_JOB_POLL_MS || '5000', 10),
    leaseMs: parseInt(process.env.ANALYSIS_JOB_LEASE_MS || '600000', 10),
    maxAttempts: parseInt(process.env.ANALYSIS_JOB_MAX_ATTEMPTS || '3', 10),
  },

  // 本地模式
  localMode: process.env.LOCAL_MODE === 'true',
};

module.exports = config;
