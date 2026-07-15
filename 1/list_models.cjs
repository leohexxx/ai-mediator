// 列出 DeepSeek 账号可用模型 ID
// 用法: node --env-file=server/.env 1/list_models.cjs
var https = require('https');
var key = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '';

var req = https.request({
  hostname: 'api.deepseek.com',
  path: '/v1/models',
  method: 'GET',
  headers: { 'Authorization': 'Bearer ' + key },
}, function (res) {
  var chunks = [];
  res.on('data', function (c) { chunks.push(c); });
  res.on('end', function () {
    var txt = Buffer.concat(chunks).toString('utf8');
    try {
      var j = JSON.parse(txt);
      var ids = (j.data || []).map(function (m) { return m.id; });
      console.log('可用模型 (' + ids.length + '):');
      ids.forEach(function (id) { console.log('  - ' + id); });
    } catch (e) {
      console.log('status', res.statusCode, txt.substring(0, 500));
    }
  });
});
req.on('error', function (e) { console.error('ERR', e.message); });
req.end();
