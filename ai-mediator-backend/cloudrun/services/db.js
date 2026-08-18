// ═══════════════════════════════════════════════
// 数据库服务 — 操作 CloudBase NoSQL / 本地 JSON
// ═══════════════════════════════════════════════
var config = require('../config');
var fs = require('fs');
var path = require('path');

// ── 初始化 CloudBase SDK（仅在非本地模式下）──
var tcb = null;
var db = null;

if (!config.localMode && config.cloudbase.envId) {
  try {
    tcb = require('@cloudbase/node-sdk');
    var initParams = { env: config.cloudbase.envId };
    if (config.cloudbase.secretId) initParams.secretId = config.cloudbase.secretId;
    if (config.cloudbase.secretKey) initParams.secretKey = config.cloudbase.secretKey;
    tcb.init(initParams);
    db = tcb.database();
    console.log('[DB] CloudBase connected: ' + config.cloudbase.envId);
  } catch (e) {
    console.warn('[DB] CloudBase init failed, falling back to local mode:', e.message);
    config.localMode = true;
  }
} else {
  if (!config.localMode) console.warn('[DB] No CloudBase envId configured, using local mode');
}

// ── 本地 JSON 文件存储（替代 DB）─────────────────
var STORE_DIR = path.join(__dirname, '..', '..', 'data');
var _cache = {};

function ensureStore() {
  if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });
}

function storePath(collection) {
  return path.join(STORE_DIR, collection + '.json');
}

function readCollection(collection) {
  if (_cache[collection]) return _cache[collection];
  ensureStore();
  var p = storePath(collection);
  if (fs.existsSync(p)) {
    try { _cache[collection] = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { _cache[collection] = []; }
  } else { _cache[collection] = []; }
  return _cache[collection];
}

function writeCollection(collection, data) {
  _cache[collection] = data;
  ensureStore();
  fs.writeFileSync(storePath(collection), JSON.stringify(data, null, 2), 'utf8');
}

// ── 文档查询包装 ──────────────────────────────

function collection(name) {
  if (config.localMode) {
    return new LocalCollection(name);
  }
  return db.collection(name);
}

// ── 本地集合模拟（CRUD）────────────────────────
class LocalCollection {
  constructor(name) { this.name = name; this._data = readCollection(name); }

  _save() { writeCollection(this.name, this._data); }

  doc(id) {
    var that = this;
    return {
      get: function () {
        var doc = that._data.find(function (d) { return d._id === id; });
        return { data: doc || null };
      },
      update: function ({ data }) {
        var idx = that._data.findIndex(function (d) { return d._id === id; });
        if (idx !== -1) Object.assign(that._data[idx], data);
        that._save();
        return { updated: 1 };
      },
    };
  }

  where(filter) {
    var that = this;
    var filtered = this._data.filter(function (d) {
      for (var k in filter) {
        if (d[k] !== filter[k]) return false;
      }
      return true;
    });
    return {
      get: function () { return { data: filtered, length: filtered.length }; },
      orderBy: function () { return this; },
      limit: function () { return this; },
      field: function () { return { get: function () { return { data: filtered }; } }; },
    };
  }

  add({ data }) {
    var _id = require('uuid').v4();
    data._id = _id;
    this._data.unshift(data);
    this._save();
    return { _id: _id };
  }
}

module.exports = { collection: collection };
