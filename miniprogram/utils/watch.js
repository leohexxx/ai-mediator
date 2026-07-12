// ═══════════════════════════════════════════════
// 云数据库 watch 封装（含降级轮询方案）
// ═══════════════════════════════════════════════

/**
 * 监听数据库集合变更（优先使用 watch API，降级为轮询）。
 *
 * @typedef {Object} WatchOptions
 * @property {string} collection - 集合名称
 * @property {Object} [where] - 查询条件
 * @property {string[]} [fields] - 返回字段
 * @property {number} [pollingInterval=1000] - 轮询间隔（ms），仅降级时使用
 *
 * @typedef {Object} Watcher
 * @property {function(): void} close - 停止监听
 *
 * @param {WatchOptions} options
 * @param {function(Object): void} onChange - 数据变更回调
 * @returns {Watcher}
 */
function watchCollection(options, onChange) {
  var collection = options.collection;
  var where = options.where || {};
  var fields = options.fields || null;
  var pollingInterval = options.pollingInterval || 1000;
  var closed = false;

  // 尝试使用 watch API
  try {
    var db = wx.cloud.database();
    var watcher = db.collection(collection).where(where).watch({
      onChange: function (snapshot) {
        if (!closed && onChange) {
          onChange(snapshot);
        }
      },
      onError: function (err) {
        console.error('数据库 watch 错误，降级为轮询:', err);
        if (!closed) {
          closeWatch();
          fallbackToPolling();
        }
      },
    });

    function closeWatch() {
      if (watcher && watcher.close) {
        try {
          watcher.close();
        } catch (_) { /* ignore */ }
      }
    }

    /**
     * 降级为轮询模式
     */
    function fallbackToPolling() {
      console.log('降级为轮询模式, 间隔:', pollingInterval + 'ms');
      var lastSnapshot = null;

      var timer = setInterval(function () {
        if (closed) {
          clearInterval(timer);
          return;
        }

        var query = db.collection(collection).where(where);
        if (fields) {
          query = query.field(fields);
        }

        query.get({
          success: function (res) {
            if (closed) return;

            var currentData = JSON.stringify(res.data);
            if (currentData !== lastSnapshot) {
              lastSnapshot = currentData;
              if (onChange) {
                onChange({ docs: res.data, type: 'polling' });
              }
            }
          },
          fail: function (err) {
            console.error('轮询查询失败:', err);
          },
        });
      }, pollingInterval);
    }

    return {
      close: function () {
        closed = true;
        closeWatch();
      },
    };
  } catch (err) {
    // watch API 不可用，直接降级
    console.warn('watch API 不可用，使用轮询方案:', err);

    var db2 = wx.cloud.database();
    var lastSnapshot2 = null;

    var timer2 = setInterval(function () {
      if (closed) {
        clearInterval(timer2);
        return;
      }

      var query = db2.collection(collection).where(where);
      if (fields) {
        query = query.field(fields);
      }

      query.get({
        success: function (res) {
          if (closed) return;

          var currentData = JSON.stringify(res.data);
          if (currentData !== lastSnapshot2) {
            lastSnapshot2 = currentData;
            if (onChange) {
              onChange({ docs: res.data, type: 'polling' });
            }
          }
        },
        fail: function (err) {
          console.error('轮询查询失败:', err);
        },
      });
    }, pollingInterval);

    return {
      close: function () {
        closed = true;
        clearInterval(timer2);
      },
    };
  }
}

/**
 * 监听单条文档变更
 * @param {string} collection - 集合名称
 * @param {string} docId - 文档 ID
 * @param {function(Object): void} onChange
 * @returns {Watcher}
 */
function watchDocument(collection, docId, onChange) {
  return watchCollection({
    collection: collection,
    where: { _id: docId },
  }, function (snapshot) {
    var doc = (snapshot.docs && snapshot.docs.length > 0) ? snapshot.docs[0] : null;
    if (onChange) {
      onChange(doc);
    }
  });
}

module.exports = {
  watchCollection: watchCollection,
  watchDocument: watchDocument,
};
