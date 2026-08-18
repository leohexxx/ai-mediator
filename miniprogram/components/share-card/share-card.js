// ═══════════════════════════════════════════════
// share-card 组件 — Canvas 2D 绘制分享卡片
// ═══════════════════════════════════════════════

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    canvasWidth: 300,
    canvasHeight: 450,
  },

  lifetimes: {
    attached: function () {
      var sysInfo = wx.getSystemInfoSync();
      var width = Math.min(sysInfo.windowWidth - 80, 340);
      this.setData({
        canvasWidth: width,
        canvasHeight: Math.round(width * 1.5),
      });
    },
  },

  methods: {
    /**
     * 绘制分享卡片
     * @param {Object} cardData
     */
    drawCard: function (cardData) {
      var that = this;
      this.setData({ visible: true });

      var query = this.createSelectorQuery();
      query.select('#shareCanvas').fields({ node: true, size: true }).exec(function (res) {
        if (!res || !res[0] || !res[0].node) {
          console.error('Canvas node not found');
          return;
        }

        var canvas = res[0].node;
        var ctx = canvas.getContext('2d');
        var dpr = wx.getSystemInfoSync().pixelRatio;

        var width = that.data.canvasWidth;
        var height = that.data.canvasHeight;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        that._renderCard(ctx, width, height, cardData);

        that._canvasRef = canvas;
      });
    },

    /**
     * 渲染卡片内容
     */
    _renderCard: function (ctx, w, h, data) {
      var template = data.template || 'verdict';

      // 背景
      ctx.fillStyle = '#F7F4EC';
      this._roundRect(ctx, 0, 0, w, h, 16);
      ctx.fill();

      if (template === 'verdict') {
        this._renderVerdictCard(ctx, w, h, data);
      } else if (template === 'fun') {
        this._renderFunCard(ctx, w, h, data);
      } else {
        this._renderVerdictCard(ctx, w, h, data);
      }
    },

    /**
     * V3 证据摘要卡片：不展示输赢和双方评分
     */
    _renderVerdictCard: function (ctx, w, h, data) {
      ctx.fillStyle = '#287A65';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('EVIDENCE SUMMARY', 28, 38);
      ctx.fillStyle = '#202824';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('现有证据说明了什么', 28, 73);
      ctx.fillStyle = '#C9822B';
      ctx.fillRect(28, 91, 54, 4);

      if (data.verdict) {
        ctx.fillStyle = '#202824';
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'left';
        var lines = this._wrapText(ctx, data.verdict, w - 56);
        for (var i = 0; i < Math.min(lines.length, 6); i++) {
          ctx.fillText(lines[i], 28, 130 + i * 24);
        }
      }
      var confidence = data.confidence || 50;
      var confY = h - 142;
      ctx.fillStyle = '#59635E';
      ctx.font = '12px sans-serif';
      ctx.fillText('证据充分度  ' + confidence + '/100', 28, confY);
      ctx.fillStyle = '#D8D0C0';
      ctx.fillRect(28, confY + 14, w - 56, 7);
      ctx.fillStyle = '#287A65';
      ctx.fillRect(28, confY + 14, (w - 56) * Math.min(confidence, 100) / 100, 7);
      if (data.isSingleParty) {
        ctx.fillStyle = '#C9822B';
        ctx.font = '11px sans-serif';
        ctx.fillText('单方证据 · 不能代表另一方完整立场', 28, confY + 43);
      }
      ctx.fillStyle = '#287A65';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('先整理事实，再看见分歧', 28, h - 48);
      ctx.fillStyle = '#7C827E';
      ctx.font = '11px sans-serif';
      ctx.fillText('啷个对 · AI 辅助沟通整理', 28, h - 24);
    },

    /**
     * 趣味版卡片
     */
    _renderFunCard: function (ctx, w, h, data) {
      ctx.fillStyle = '#C9822B';
      ctx.fillRect(0, 0, 10, h);
      ctx.fillStyle = '#202824';
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('下一步怎么谈？', 34, 62);
      ctx.fillStyle = '#59635E';
      ctx.font = '14px sans-serif';
      var text = data.verdict || '先确认共同事实，再一次只解决一个具体问题。';
      var lines = this._wrapText(ctx, text, w - 68);
      for (var i = 0; i < Math.min(lines.length, 7); i++) ctx.fillText(lines[i], 34, 112 + i * 26);
      ctx.fillStyle = '#287A65';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('保存原始记录 · 补齐信息缺口 · 提出具体请求', 34, h - 58);
      ctx.fillStyle = '#7C827E';
      ctx.font = '11px sans-serif';
      ctx.fillText('啷个对 · 报告仅供沟通整理', 34, h - 30);
    },

    // 工具函数
    _roundRect: function (ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    },

    _wrapText: function (ctx, text, maxWidth) {
      var lines = [];
      var line = '';
      for (var i = 0; i < text.length; i++) {
        var testLine = line + text[i];
        var metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line.length > 0) {
          lines.push(line);
          line = text[i];
        } else {
          line = testLine;
        }
      }
      if (line.length > 0) lines.push(line);
      return lines;
    },

    /**
     * 关闭
     */
    onClose: function () {
      this.setData({ visible: false });
      this.triggerEvent('close');
    },

    /**
     * 保存到相册
     */
    onSaveToAlbum: function () {
      var that = this;
      if (!this._canvasRef) {
        wx.showToast({ title: '卡片未生成', icon: 'none' });
        return;
      }

      wx.showLoading({ title: '保存中...' });

      wx.canvasToTempFilePath({
        canvas: this._canvasRef,
        success: function (res) {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: function () {
              wx.hideLoading();
              wx.showToast({ title: '已保存到相册', icon: 'success' });
            },
            fail: function () {
              wx.hideLoading();
              wx.showToast({ title: '保存失败，请检查相册权限', icon: 'none' });
            },
          });
        },
        fail: function () {
          wx.hideLoading();
          wx.showToast({ title: '生成图片失败', icon: 'none' });
        },
      });
    },
  },
});
