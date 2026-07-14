// 连通性测试 v2 — 调用 DeepSeek API 看是否通
var https = require('https');
exports.main = async function () {
  var raw = process.env.LLM_API_KEYS || '';
  var key = raw.split(',')[0].trim();
  var results = [];

  // Step 1: DNS
  var t = Date.now();
  try {
    await new Promise(function(r,rej){require('dns').lookup('api.deepseek.com',function(e,a){if(e)rej(e);else{r(a);}});});
  } catch(e) { return {code:-1,data:{step:'dns',err:e.message}}; }
  results.push({step:'dns',ms:Date.now()-t});

  // Step 2: API call
  t = Date.now();
  try {
    var body = JSON.stringify({model:'deepseek-v4-flash',messages:[{role:'user',content:'用一句话回答：你好'}],max_tokens:50});
    var r = await new Promise(function(resolve,reject){
      var req = https.request({
        hostname:'api.deepseek.com',path:'/v1/chat/completions',
        method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'Content-Length':Buffer.byteLength(body)},
        timeout:30000,
      },function(resp){
        var d=[];resp.on('data',function(c){d.push(c);});resp.on('end',function(){resolve({s:resp.statusCode,b:Buffer.concat(d).toString().substring(0,200)});});
      });
      req.on('timeout',function(){req.destroy();reject(new Error('timeout'));});
      req.on('error',function(e){reject(e);});
      req.write(body);req.end();
    });
    results.push({step:'api',ms:Date.now()-t,status:r.s,body:r.b});
  } catch(e) { results.push({step:'api',ms:Date.now()-t,err:e.message}); }

  return {code:0,data:{model:'deepseek-v4-flash',firstKeyPrefix:key.substring(0,12),results:results}};
};
