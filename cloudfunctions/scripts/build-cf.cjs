// ═══════════════════════════════════════════════
// 云函数构建脚本（CommonJS 版，根 package.json 为 ESM 时用本文件）
// 职责: 将 cloudfunctions/common/ 复制到【所有】云函数目录，并清理 common/common 嵌套
// 用法: node cloudfunctions/scripts/build-cf.cjs
// ═══════════════════════════════════════════════
var fs = require('fs');
var path = require('path');

var commonDir = path.join(__dirname, '..', 'common');
var cfRoot = path.join(__dirname, '..');

function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  var entries = fs.readdirSync(src, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var srcPath = path.join(src, entry.name);
    var destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Building cloud functions...');
console.log('Common source: ' + commonDir + '\n');

var dirs = fs.readdirSync(cfRoot, { withFileTypes: true })
  .filter(function (d) { return d.isDirectory(); })
  .filter(function (d) { return fs.existsSync(path.join(cfRoot, d.name, 'index.js')); });

for (var j = 0; j < dirs.length; j++) {
  var dirName = dirs[j].name;
  var targetDir = path.join(cfRoot, dirName, 'common');
  console.log('Processing: ' + dirName);
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
  copyRecursive(commonDir, targetDir);
  console.log('  done');
}
console.log('\nBuild complete! ' + dirs.length + ' cloud functions synced.');
