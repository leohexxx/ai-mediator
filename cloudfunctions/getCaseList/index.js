// ═══════════════════════════════════════════════
// getCaseList 云函数
// 职责: 用户案例列表（按 openid 查询 + 分页）
// ═══════════════════════════════════════════════

var cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var db = cloud.database();
var _ = db.command;

/**
 * 云函数入口
 * @param {Object} event
 * @param {number} [event.pageSize=10] - 每页条数
 * @param {string} [event.cursor] - 上一页最后一条记录的 updatedAt
 * @param {Object} context
 */
exports.main = async function (event, context) {
  var wxContext = cloud.getWXContext();
  var openid = wxContext.OPENID;

  try {
    var pageSize = Math.min(Math.max(Number(event.pageSize) || 10, 1), 50);
    var cursor = typeof event.cursor === 'string' ? event.cursor : '';

    var participantFilter = _.or([
      { 'party_a.openid': openid },
      { 'party_b.openid': openid },
    ]);
    var whereFilter = cursor
      ? _.and([participantFilter, { updatedAt: _.lt(cursor) }])
      : participantFilter;

    // 多取一条用于判断 hasMore，避免深页 skip 和每页 count 全表扫描。
    var result = await db.collection('cases')
      .where(whereFilter)
      .orderBy('updatedAt', 'desc')
      .limit(pageSize + 1)
      .get();

    var hasMore = result.data.length > pageSize;
    var pageData = hasMore ? result.data.slice(0, pageSize) : result.data;

    // 为每条案例附加角色信息
    var list = pageData.map(function (item) {
      var role = item.party_a.openid === openid ? 'party_a' : 'party_b';
      return {
        _id: item._id,
        title: item.title,
        relationship: item.relationship,
        privacy: item.privacy,
        role: role,
        party_a: {
          nickname: item.party_a.nickname,
          submitted: item.party_a.submitted,
        },
        party_b: {
          nickname: item.party_b.nickname,
          openid: item.party_b.openid,
          submitted: item.party_b.submitted,
        },
        status: item.status,
        analysisId: item.analysisId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    });

    return {
      code: 0,
      data: {
        list: list,
        // total/page 仅为旧调用方保留；游标分页不再执行 count。
        total: null,
        page: Number(event.page) || 1,
        pageSize: pageSize,
        hasMore: hasMore,
        nextCursor: hasMore && list.length > 0 ? list[list.length - 1].updatedAt : null,
      },
      message: 'ok',
    };
  } catch (error) {
    console.error('getCaseList error:', error);
    return { code: -1, data: null, message: error.message || '获取案例列表失败' };
  }
};
