// 视频抽帧模拟测试 — 验证新策略（每 2-3s 抽一帧，最多 20 帧）
var fs = require('fs');

// 模拟：2 分钟视频，每 3s 抽一帧，共 20 帧（上限）
// 每帧取不同段落的 OCR 文本，模拟真实聊天滚动
var ocrText = fs.readFileSync('1/_ocr_result.txt', 'utf8');
var totalChars = ocrText.length;
var interval = 3;
var maxFrames = 20;
var frames = [];

// 模拟抽帧：每 3 秒取一段不重叠的文本切片
var sliceSize = Math.floor(totalChars / maxFrames);
for (var i = 0; i < maxFrames; i++) {
  var start = i * sliceSize;
  var end = Math.min(start + sliceSize, totalChars);
  var slice = ocrText.substring(start, end);
  var sec = i * interval;
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  frames.push({ time: m + ':' + (s < 10 ? '0' : '') + s, chars: slice.length, text: slice.substring(0, 80) });
}

console.log('视频抽帧策略验证');
console.log('模拟场景: 2min 视频, 每 3s 一帧, 上限 20 帧');
console.log('实际抽帧: ' + frames.length + ' 帧\n');

var totalSimChars = 0;
frames.forEach(function(f, i) {
  console.log('  帧' + (i + 1) + ' [' + f.time + '] ' + f.chars + ' 字 | ' + f.text + '...');
  totalSimChars += f.chars;
});

console.log('\n总覆盖字数: ' + totalSimChars + ' / ' + totalChars + ' (' + (totalSimChars/totalChars*100).toFixed(0) + '%)');
console.log('对比旧版 2 帧: ~' + (sliceSize*2) + ' 字 (' + (sliceSize*2/totalChars*100).toFixed(0) + '%)');
console.log('覆盖提升: ' + (totalSimChars/(sliceSize*2)).toFixed(0) + 'x');

// 实际测试用的视频时长
var videoPath = '1/66d16aebd1f2d177c829c900d182ab0a.mp4';
if (fs.existsSync(videoPath)) {
  console.log('\n真实视频素材: ' + (fs.statSync(videoPath).size/1024/1024).toFixed(1) + 'MB');
  console.log('预计抽帧: ' + maxFrames + ' 帧 (取上限)');
  console.log('预计耗时: 抽帧 ~' + (maxFrames*0.8).toFixed(0) + 's + OCR ~4s(并行) ≈ ' + (maxFrames*0.8+4).toFixed(0) + 's');
}
