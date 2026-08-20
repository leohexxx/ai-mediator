// ═══════════════════════════════════════════════
// 视频抽帧服务 — 云端 ffmpeg 抽帧
// Docker 镜像需安装 ffmpeg
// ═══════════════════════════════════════════════
var fs = require('fs');
var path = require('path');
var os = require('os');
var { execSync } = require('child_process');
var config = require('../config');

/**
 * 检查 ffmpeg 是否可用
 */
function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 从视频文件抽帧，返回各帧的 base64
 * @param {string} videoPath - 视频文件路径
 * @param {number} duration - 视频时长(秒)
 * @returns {Promise<{frames: {base64:string, time:number}[], count: number}>}
 */
async function extractFrames(videoPath, duration) {
  if (!checkFfmpeg()) {
    throw new Error('ffmpeg not available in container');
  }

  var maxFrames = config.video.maxFrames;
  var fps = config.video.fps;
  var rawCount = Math.floor(duration * fps);
  var totalFrames = Math.min(rawCount, maxFrames);

  // 临时目录存放帧图片
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  var outputPattern = path.join(tmpDir, 'frame_%04d.jpg');

  try {
    // ffmpeg 抽帧
    execSync('ffmpeg -i ' + videoPath.replace(/ /g, '\\ ') + ' -vf fps=' + fps + ' -vsync vfr -q:v 2 -frames:v ' + totalFrames + ' ' + outputPattern.replace(/ /g, '\\ '), {
      stdio: 'pipe',
      timeout: 60000,
    });

    // 读取帧文件转为 base64
    var frameFiles = fs.readdirSync(tmpDir).sort();
    var frames = [];

    for (var i = 0; i < frameFiles.length; i++) {
      var filePath = path.join(tmpDir, frameFiles[i]);
      var b64 = fs.readFileSync(filePath).toString('base64');
      var time = Math.round((i / fps) * 10) / 10; // 估算时间位置
      frames.push({ base64: b64, time: time });
    }

    return { frames: frames, count: frames.length };
  } finally {
    // 清理临时文件
    try {
      var files = fs.readdirSync(tmpDir);
      files.forEach(function (f) { fs.unlinkSync(path.join(tmpDir, f)); });
      fs.rmdirSync(tmpDir);
    } catch (e) { /* ignore cleanup errors */ }
  }
}

module.exports = { extractFrames: extractFrames, checkFfmpeg: checkFfmpeg };
