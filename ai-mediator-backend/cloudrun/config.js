// ═══════════════════════════════════════════════
// 配置加载 — 从环境变量读取，提供默认值
// ═══════════════════════════════════════════════
require('dotenv').config();
var packageMeta = require('./package.json');

var config = {
  port: parseInt(process.env.PORT || '9000', 10),
  release: process.env.APP_RELEASE || packageMeta.version,

  // CloudBase 环境
  cloudbase: {
    envId: process.env.CLOUDBASE_ENV_ID || '',
    apiKey: process.env.CLOUDBASE_APIKEY || '',
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
    provider: process.env.OCR_PROVIDER || 'tencent',
    tencentSecretId: process.env.TENCENT_OCR_SECRET_ID || '',
    tencentSecretKey: process.env.TENCENT_OCR_SECRET_KEY || '',
    region: process.env.TENCENT_OCR_REGION || 'ap-guangzhou',
    maxConcurrent: parseInt(process.env.OCR_MAX_CONCURRENT || '4', 10),
    maxImagesPerBatch: parseInt(process.env.OCR_MAX_IMAGES_PER_BATCH || '9', 10),
    maxImagesPerCase: parseInt(process.env.OCR_MAX_IMAGES_PER_CASE || '100', 10),
    maxImageBytes: parseInt(process.env.OCR_MAX_IMAGE_BYTES || String(10 * 1024 * 1024), 10),
    tileHeight: parseInt(process.env.OCR_TILE_HEIGHT || '1800', 10),
    tileOverlap: parseInt(process.env.OCR_TILE_OVERLAP || '120', 10),
    lowConfidenceThreshold: parseFloat(process.env.OCR_LOW_CONFIDENCE || '88'),
  },

  qwenVision: {
    apiKey: process.env.QWEN_VISION_API_KEY || '',
    model: process.env.QWEN_VISION_MODEL || 'qwen3.8-max',
    baseUrl: process.env.QWEN_VISION_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    requestTimeoutMs: parseInt(process.env.QWEN_VISION_TIMEOUT_MS || '120000', 10),
    pollIntervalMs: parseInt(process.env.OCR_JOB_POLL_MS || '2000', 10),
    leaseMs: parseInt(process.env.OCR_JOB_LEASE_MS || '600000', 10),
    maxAttempts: parseInt(process.env.OCR_JOB_MAX_ATTEMPTS || '2', 10),
    maxConcurrent: parseInt(process.env.OCR_JOB_MAX_CONCURRENT || '1', 10),
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
    maxConcurrent: parseInt(process.env.ANALYSIS_JOB_MAX_CONCURRENT || '2', 10),
    perUserStartsPerMinute: parseInt(process.env.ANALYSIS_USER_STARTS_PER_MINUTE || '5', 10),
  },

  metrics: {
    structuredLogIntervalMs: parseInt(process.env.METRICS_LOG_INTERVAL_MS || '60000', 10),
  },

  miniprogramState: ['developer', 'trial', 'formal'].indexOf(process.env.MINIPROGRAM_STATE) !== -1
    ? process.env.MINIPROGRAM_STATE : 'developer',
  notificationInternalToken: process.env.NOTIFICATION_INTERNAL_TOKEN || '',

  // 本地模式
  localMode: process.env.LOCAL_MODE === 'true',
};

module.exports = config;
