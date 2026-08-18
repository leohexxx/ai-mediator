// ═══════════════════════════════════════════════
// 数据库服务 — 操作 CloudBase NoSQL / 本地 JSON
// ═══════════════════════════════════════════════
var config = require('../config');
var fs = require('fs');
var path = require('path');

// ── 初始化 CloudBase SDK（仅在非本地模式下）──
var tcb = null;
var db = null;
var initError = null;

if (!config.localMode && config.cloudbase.envId) {
  try {
    tcb = require('@cloudbase/node-sdk');
    var initParams = { env: config.cloudbase.envId };
    if (config.cloudbase.apiKey) {
      initParams.accessKey = config.cloudbase.apiKey;
    } else {
      if (config.cloudbase.secretId) initParams.secretId = config.cloudbase.secretId;
      if (config.cloudbase.secretKey) initParams.secretKey = config.cloudbase.secretKey;
    }
    var app = tcb.init(initParams);
    db = app.database();
    console.log('[DB] CloudBase connected: ' + config.cloudbase.envId);
  } catch (e) {
    initError = e;
    console.error('[DB] CloudBase init failed:', e.message);
  }
} else {
  if (!config.localMode) initError = new Error('CLOUDBASE_ENV_ID is required when LOCAL_MODE is not true');
}

// ── 本地 JSON 文件存储（替代 DB）─────────────────
var STORE_DIR = process.env.LOCAL_STORE_DIR || path.join(__dirname, '..', 'data');
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
  if (!db) throw initError || new Error('CloudBase database is unavailable');
  return wrapNativeCollection(db.collection(name));
}

function assignFields(target, fields) {
  Object.keys(fields).forEach(function (key) {
    var parts = key.split('.');
    var cursor = target;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') cursor[parts[i]] = {};
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = fields[key];
  });
  return target;
}

// @cloudbase/node-sdk returns document reads as `{ data: [document] }`, while
// the local adapter and the rest of the service use `{ data: document|null }`.
// Normalize this boundary once so authorization and transaction code do not
// accidentally read properties from the array object.
function normalizeDocumentResult(result) {
  if (!result || !Array.isArray(result.data)) return result;
  return Object.assign({}, result, { data: result.data[0] || null });
}

// 将 node-sdk 的裸 data 参数适配成项目统一使用的云函数风格 { data }。
function wrapNativeDocument(ref) {
  return {
    get: function () { return ref.get().then(normalizeDocumentResult); },
    field: function (projection) { return wrapNativeDocument(ref.field(projection)); },
    update: function (options) { return ref.update(options.data); },
    set: function (options) { return ref.set(options.data); },
    remove: function () { return ref.remove(); },
  };
}

function wrapNativeQuery(ref) {
  return {
    get: function () { return ref.get(); },
    where: function (filter) { return wrapNativeQuery(ref.where(filter)); },
    orderBy: function (field, direction) { return wrapNativeQuery(ref.orderBy(field, direction)); },
    limit: function (count) { return wrapNativeQuery(ref.limit(count)); },
    skip: function (count) { return wrapNativeQuery(ref.skip(count)); },
    field: function (projection) { return wrapNativeQuery(ref.field(projection)); },
  };
}

function wrapNativeCollection(ref) {
  var query = wrapNativeQuery(ref);
  query.doc = function (id) { return wrapNativeDocument(ref.doc(id)); };
  query.add = function (options) { return ref.add(options.data); };
  return query;
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
        if (idx !== -1) assignFields(that._data[idx], data);
        that._save();
        return { updated: 1 };
      },
      set: function ({ data }) {
        var idx = that._data.findIndex(function (d) { return d._id === id; });
        var next = Object.assign({}, data, { _id: id });
        if (idx === -1) that._data.unshift(next);
        else that._data[idx] = next;
        that._save();
        return { updated: idx === -1 ? 0 : 1, upserted: idx === -1 ? id : null };
      },
      remove: function () {
        var before = that._data.length;
        that._data = that._data.filter(function (d) { return d._id !== id; });
        that._save();
        return { deleted: before - that._data.length };
      },
    };
  }

  where(filter) {
    var offset = 0;
    var maxCount = Infinity;
    var filtered = this._data.filter(function (d) {
      for (var k in filter) {
        if (d[k] !== filter[k]) return false;
      }
      return true;
    });
    var query = {
      get: function () {
        var data = filtered.slice(offset, offset + maxCount);
        return { data: data, length: data.length };
      },
      orderBy: function () { return query; },
      limit: function (count) { maxCount = count; return query; },
      skip: function (count) { offset = count; return query; },
      field: function () { return { get: function () { return { data: filtered }; } }; },
    };
    return query;
  }

  add({ data }) {
    var _id = require('uuid').v4();
    data._id = _id;
    this._data.unshift(data);
    this._save();
    return { _id: _id };
  }
}

var localTransactionQueue = Promise.resolve();

function runTransaction(callback) {
  if (!config.localMode) {
    if (!db) return Promise.reject(initError || new Error('CloudBase database is unavailable'));
    return db.runTransaction(function (transaction) {
      return callback({ collection: function (name) { return wrapNativeCollection(transaction.collection(name)); } });
    });
  }

  var execute = async function () {
    var snapshot = JSON.parse(JSON.stringify(_cache));
    try {
      return await callback({ collection: collection });
    } catch (error) {
      var touchedNames = Object.keys(_cache);
      _cache = snapshot;
      Object.keys(snapshot).forEach(function (name) { writeCollection(name, snapshot[name]); });
      touchedNames.forEach(function (name) {
        if (!Object.prototype.hasOwnProperty.call(snapshot, name)) writeCollection(name, []);
      });
      throw error;
    }
  };
  var result = localTransactionQueue.then(execute, execute);
  localTransactionQueue = result.catch(function () {});
  return result;
}

module.exports = {
  collection: collection,
  runTransaction: runTransaction,
  isLocalMode: function () { return config.localMode; },
  assertReady: function () {
    if (!config.localMode && !db) throw initError || new Error('CloudBase database is unavailable');
  },
  callFunction: function (name, data) {
    if (config.localMode) return Promise.resolve({ result: { code: 0, message: 'local skipped' } });
    if (!app || typeof app.callFunction !== 'function') return Promise.reject(new Error('CloudBase function client is unavailable'));
    return app.callFunction({ name: name, data: data || {} });
  },
  normalizeDocumentResult: normalizeDocumentResult,
};
