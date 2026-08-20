var test = require('node:test');
var assert = require('node:assert/strict');
var qwenVision = require('../services/qwenVision');

test('千问视觉响应被规范化为聊天证据块', async function () {
  var service = qwenVision.createService({
    request: async function (payload) {
      assert.equal(payload.model, 'qwen3.8-max');
      assert.equal(payload.messages[1].content[0].type, 'image_url');
      return { choices: [{ message: { content: '```json\n{"text":"你好","blocks":[{"text":"你好","speakerHint":"self","confidence":96}]}\n```' } }] };
    },
  });
  var result = await service.recognizeImage(Buffer.from('image').toString('base64'));
  assert.equal(result.text, '你好');
  assert.deepEqual(result.blocks[0], { text: '你好', speakerHint: 'self', confidence: 96 });
});

test('千问视觉会修正非法说话人和置信度', function () {
  var result = qwenVision.normalizeResult({ blocks: [{ text: '系统通知', speakerHint: 'nobody', confidence: 120 }] });
  assert.equal(result.blocks[0].speakerHint, 'system');
  assert.equal(result.blocks[0].confidence, 100);
});
