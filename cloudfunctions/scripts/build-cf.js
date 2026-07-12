// ═══════════════════════════════════════════════
// 云函数构建脚本
// 职责: 将 cloudfunctions/common/ 复制到各云函数目录
// 用法: node cloudfunctions/scripts/build-cf.js
// ═══════════════════════════════════════════════

var fs = require('fs');
var path = require('path');

var commonDir = path.join(__dirname, '..', 'common');
var cfDirs = [
  'login',
  'createCase',
  'joinCase',
  'uploadEvidence',
  'analyzeCase',
  'chatWithAnalysis',
  'getCaseDetail',
  'getCaseList',
  'generateQRCode',
];

/**
 * 递归复制目录
 * @param {string} src - 源目录
 * @param {string} dest - 目标目录
 */
function copyRecursive(src, dest) {
  // 确保目标目录存在
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  var entries = fs.readdirSync(src, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var srcPath = path.join(src, entry.name);
    var destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log('  copied: ' + path.relative(commonDir, srcPath));
    }
  }
}

console.log('Building cloud functions...');
console.log('Common source: ' + commonDir);
console.log('');

for (var j = 0; j < cfDirs.length; j++) {
  var dir = cfDirs[j];
  var targetDir = path.join(__dirname, '..', dir, 'common');

  console.log('Processing: ' + dir);

  // 清空旧文件（如果存在）
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  // 递归复制 common/ → 目标云函数/common/
  copyRecursive(commonDir, targetDir);

  console.log('  done');
  console.log('');
}

console.log('Build complete! All cloud functions have updated common/ dependencies.');
