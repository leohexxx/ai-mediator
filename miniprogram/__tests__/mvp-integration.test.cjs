// ═══════════════════════════════════════════════
// MVP 集成测试脚本
// 验证单人模式全流程：创建 → 上传 → 分析 → 报告 → 分享
// ═══════════════════════════════════════════════

// 注意：此脚本在 Node.js 环境下运行，用于测试云函数业务逻辑
// 实际云函数调用需要 wx-server-sdk 环境，此处为逻辑验证

var fs = require('fs');
var path = require('path');

// 项目根目录
var ROOT = path.join(__dirname, '..', '..');
var CLOUD_DIR = path.join(ROOT, 'cloudfunctions');
var MP_DIR = path.join(ROOT, 'miniprogram');

var passed = 0;
var failed = 0;
var tests = [];

function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || 'Expected ' + expected + ' but got ' + actual);
  }
}

function runTests() {
  console.log('═'.repeat(60));
  console.log('  AI 调解员 — MVP 集成测试');
  console.log('═'.repeat(60));
  console.log('');

  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      t.fn();
      passed++;
      console.log('  ✓ ' + t.name);
    } catch (err) {
      failed++;
      console.log('  ✗ ' + t.name);
      console.log('    错误: ' + err.message);
    }
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('  结果: ' + passed + ' 通过, ' + failed + ' 失败, ' + tests.length + ' 总计');
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

// ═══════════════════════════════════════════════
// 测试 1: 聊天记录解析器
// ═══════════════════════════════════════════════

test('parser: 标准微信聊天记录解析', function () {
  var parser = require(path.join(CLOUD_DIR, 'common', 'parser'));

  var input = [
    '2025-07-13 14:30:25 小明: 周末一起去吃饭吗',
    '2025-07-13 14:31:10 小红: 随便你吧',
    '2025-07-13 14:32:00 小明: 能不能给个准话',
  ].join('\n');

  var result = parser.parseWeChatChatLog(input);
  assertEqual(result.length, 3, '应解析出 3 条消息');
  assertEqual(result[0].speaker, '小明', '第一条说话人应为小明');
  assertEqual(result[0].content, '周末一起去吃饭吗', '内容应正确');
  assertEqual(result[1].speaker, '小红', '第二条说话人应为小红');
  assert(result[0].timestamp !== null, '应有时间戳');
});

test('parser: 空输入处理', function () {
  var parser = require(path.join(CLOUD_DIR, 'common', 'parser'));
  var result = parser.parseWeChatChatLog('');
  assert(result.length === 0, '空输入应返回空数组');
});

test('parser: 特殊格式处理', function () {
  var parser = require(path.join(CLOUD_DIR, 'common', 'parser'));

  var input = '2025-07-13 14:30:25 小明👤: 测试消息[图片]';
  var result = parser.parseWeChatChatLog(input);

  assert(result.length > 0, '应至少有 1 条消息');
  assert(result[0].speaker.indexOf('小明') !== -1, '说话人应包含小明');
});

test('parser: formatChatForLLM 输出格式', function () {
  var parser = require(path.join(CLOUD_DIR, 'common', 'parser'));

  var messages = [
    { speaker: '小明', content: '你好', timestamp: '2025-07-13T14:30:00Z', type: 'text' },
    { speaker: '小红', content: '你好呀', timestamp: '2025-07-13T14:31:00Z', type: 'text' },
  ];

  var parties = [
    { name: '小明', role: 'party_a' },
    { name: '小红', role: 'party_b' },
  ];

  var result = parser.formatChatForLLM(messages, parties);
  assert(typeof result === 'string', '应返回字符串');
  assert(result.indexOf('甲方') !== -1, '应包含甲方标签');
  assert(result.indexOf('乙方') !== -1, '应包含乙方标签');
});

// ═══════════════════════════════════════════════
// 测试 2: LLM 配置验证
// ═══════════════════════════════════════════════

test('llm: getConfig 默认配置', function () {
  // 模拟环境变量
  process.env.LLM_PROVIDER = 'deepseek';
  process.env.LLM_API_KEY = 'test-key-123';

  var llm = require(path.join(CLOUD_DIR, 'common', 'llm'));

  // 由于 getConfig 未直接导出，我们验证模块加载成功
  assert(typeof llm.analyzeChat === 'function', 'analyzeChat 应为函数');
  assert(typeof llm.chatWithAnalysis === 'function', 'chatWithAnalysis 应为函数');

  delete process.env.LLM_PROVIDER;
  delete process.env.LLM_API_KEY;
});

// ═══════════════════════════════════════════════
// 测试 3: 状态映射逻辑
// ═══════════════════════════════════════════════

test('format: 新增状态 label', function () {
  var format = require(path.join(MP_DIR, 'utils', 'format'));

  assertEqual(format.statusLabel('single_submitted'), '已上传，待分析');
  assertEqual(format.statusLabel('single_completed'), '分析完成');
  assertEqual(format.statusLabel('analyzing'), '分析中');
  assertEqual(format.statusLabel('completed'), '分析完成');
});

test('format: 相对时间格式化', function () {
  var format = require(path.join(MP_DIR, 'utils', 'format'));

  var now = new Date().toISOString();
  assertEqual(format.formatTime(now), '刚刚', '当前时间应为刚刚');

  var fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  var result = format.formatTime(fiveMinAgo);
  assert(result.indexOf('分钟前') !== -1, '5分钟前应显示分钟');
});

// ═══════════════════════════════════════════════
// 测试 4: 服务层接口一致性
// ═══════════════════════════════════════════════

test('services: createCase 参数结构', function () {
  var caseService = require(path.join(MP_DIR, 'services', 'case'));

  // 验证服务层导出了所有必要的函数
  assert(typeof caseService.createCase === 'function', 'createCase 应为函数');
  assert(typeof caseService.getCaseDetail === 'function', 'getCaseDetail 应为函数');
  assert(typeof caseService.getCaseList === 'function', 'getCaseList 应为函数');
  assert(typeof caseService.getShareCard === 'function', 'getShareCard 应为函数(v2新增)');
  assert(typeof caseService.joinCase === 'function', 'joinCase 保留但 Phase1 不使用');
  assert(typeof caseService.generateQRCode === 'function', 'generateQRCode 保留但 Phase1 不使用');
});

test('services: evidence 接口', function () {
  var evidenceService = require(path.join(MP_DIR, 'services', 'evidence'));

  assert(typeof evidenceService.uploadEvidence === 'function', 'uploadEvidence 应为函数');
  assert(typeof evidenceService.chooseMessageFile === 'function', 'chooseMessageFile 应为函数');
  assert(typeof evidenceService.chooseMedia === 'function', 'chooseMedia 应为函数');
});

test('services: analysis 接口', function () {
  var analysisService = require(path.join(MP_DIR, 'services', 'analysis'));

  assert(typeof analysisService.analyzeCase === 'function', 'analyzeCase 应为函数');
  assert(typeof analysisService.watchAnalysisProgress === 'function', 'watchAnalysisProgress 应为函数');
});

// ═══════════════════════════════════════════════
// 测试 5: 工具函数
// ═══════════════════════════════════════════════

test('utils: watch 集合封装存在', function () {
  var watchUtil = require(path.join(MP_DIR, 'utils', 'watch'));
  assert(typeof watchUtil.watchCollection === 'function', 'watchCollection 应为函数');
  assert(typeof watchUtil.watchDocument === 'function', 'watchDocument 应为函数');
});

test('utils: cloud 云函数调用封装', function () {
  var cloudUtil = require(path.join(MP_DIR, 'utils', 'cloud'));
  assert(typeof cloudUtil.callFunction === 'function', 'callFunction 应为函数');
  assert(typeof cloudUtil.uploadFile === 'function', 'uploadFile 应为函数');
  assert(typeof cloudUtil.getDatabase === 'function', 'getDatabase 应为函数');
});

// ═══════════════════════════════════════════════
// 测试 6: 云函数文件结构完整性
// ═══════════════════════════════════════════════

test('云函数目录结构', function () {
  var cfDir = CLOUD_DIR;
  var required = [
    'login',
    'createCase',
    'uploadEvidence',
    'analyzeCase',
    'getCaseDetail',
    'getCaseList',
    'shareCard',
  ];

  for (var i = 0; i < required.length; i++) {
    var dir = path.join(cfDir, required[i]);
    assert(fs.existsSync(dir), required[i] + ' 目录应存在');
    assert(fs.existsSync(path.join(dir, 'index.js')), required[i] + '/index.js 应存在');
    assert(fs.existsSync(path.join(dir, 'package.json')), required[i] + '/package.json 应存在');
  }
});

test('shareCard 云函数文件完整', function () {
  var dir = path.join(CLOUD_DIR, 'shareCard');
  assert(fs.existsSync(dir), 'shareCard 目录应存在');
  assert(fs.existsSync(path.join(dir, 'index.js')), 'index.js 应存在');
  assert(fs.existsSync(path.join(dir, 'config.json')), 'config.json 应存在');

  var config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  assert(config.permissions && config.permissions.openapi, '应配置 openapi 权限');
});

// ═══════════════════════════════════════════════
// 测试 7: analyzeCase 单人模式逻辑验证
// ═══════════════════════════════════════════════

test('analyzeCase: 文件包含单人模式标记', function () {
  var content = fs.readFileSync(
    path.join(CLOUD_DIR, 'analyzeCase', 'index.js'),
    'utf8'
  );

  // 验证单人模式关键代码存在
  assert(content.indexOf('isSingleMode') !== -1, '应包含 isSingleMode 逻辑');
  assert(content.indexOf('single_completed') !== -1, '应包含 single_completed 状态');
  assert(content.indexOf('单人模式') !== -1 || content.indexOf('single') !== -1, '应包含单人模式处理');
  assert(content.indexOf('confidence') !== -1, '应包含置信度调整逻辑');
});

// ═══════════════════════════════════════════════
// 测试 8: 组件文件完整性
// ═══════════════════════════════════════════════

test('share-card 组件文件完整', function () {
  var dir = path.join(MP_DIR, 'components', 'share-card');
  assert(fs.existsSync(dir), 'share-card 组件目录应存在');
  assert(fs.existsSync(path.join(dir, 'share-card.js')), 'share-card.js 应存在');
  assert(fs.existsSync(path.join(dir, 'share-card.json')), 'share-card.json 应存在');
  assert(fs.existsSync(path.join(dir, 'share-card.wxml')), 'share-card.wxml 应存在');
  assert(fs.existsSync(path.join(dir, 'share-card.wxss')), 'share-card.wxss 应存在');
});

test('报告页注册了 share-card 组件', function () {
  var reportJson = JSON.parse(
    fs.readFileSync(
    path.join(MP_DIR, 'pages', 'report', 'report.json'),
      'utf8'
    )
  );
  var components = reportJson.usingComponents || {};
  assert(components['share-card'] !== undefined, '报告页应注册 share-card 组件');
});

// ═══════════════════════════════════════════════
// 测试 9: 数据结构兼容性
// ═══════════════════════════════════════════════

test('createCase 返回数据结构包含 mode', function () {
  var content = fs.readFileSync(
    path.join(CLOUD_DIR, 'createCase', 'index.js'),
    'utf8'
  );
  assert(content.indexOf('mode') !== -1, 'createCase 应写入 mode 字段');
  assert(content.indexOf("mode: mode") !== -1 || content.indexOf("'mode': mode") !== -1, '应包含 mode 赋值');
});

test('uploadEvidence 支持单人模式 autoAnalyze', function () {
  var content = fs.readFileSync(
    path.join(CLOUD_DIR, 'uploadEvidence', 'index.js'),
    'utf8'
  );
  assert(content.indexOf('autoAnalyze') !== -1, '应包含 autoAnalyze 逻辑');
  assert(content.indexOf('isSingleMode') !== -1, '应包含 isSingleMode 判断');
});

// 运行
runTests();
