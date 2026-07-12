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
      ctx.fillStyle = '#111827';
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
     * 裁决版卡片
     */
    _renderVerdictCard: function (ctx, w, h, data) {
      var scoreA = data.scoreA || 50;
      var scoreB = data.scoreB || 50;
      var winner = data.winner || 'tie';
      var partyAName = data.partyAName || '甲方';
      var partyBName = data.partyBName || '乙方';

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AI 调解员仲裁结果', w / 2, 40);

      // 分数对比条
      var barY = 70;
      var barH = 32;
      var barW = w - 80;
      var barX = 40;

      ctx.fillStyle = '#374151';
      this._roundRect(ctx, barX, barY, barW, barH, 8);
      ctx.fill();

      var ratioA = scoreA / (scoreA + scoreB);
      var fillW = Math.max(barW * ratioA, 4);

      var gradA = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
      gradA.addColorStop(0, '#6366f1');
      gradA.addColorStop(1, '#818cf8');
      ctx.fillStyle = gradA;
      this._roundRect(ctx, barX, barY, fillW, barH, 8);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(partyAName + ' ' + scoreA + ' : ' + scoreB + ' ' + partyBName, w / 2, barY + barH / 2 + 6);

      // 结论
      var winnerText = '双方各有道理';
      if (winner === 'party_a') winnerText = partyAName + ' 更有理';
      if (winner === 'party_b') winnerText = partyBName + ' 更有理';

      ctx.fillStyle = winner === 'tie' ? '#facc15' : '#22c55e';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(winnerText, w / 2, 140);

      // 一句话结论
      if (data.verdict) {
        ctx.fillStyle = '#d1d5db';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        var lines = this._wrapText(ctx, '"' + data.verdict + '"', w - 60);
        for (var i = 0; i < Math.min(lines.length, 3); i++) {
          ctx.fillText(lines[i], w / 2, 170 + i * 20);
        }
      }

      // 置信度
      var confY = h - 120;
      ctx.fillStyle = '#9ca3af';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('置信度 ' + (data.confidence || 75) + '%', w / 2, confY);

      if (data.isSingleParty) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = '11px sans-serif';
        ctx.fillText('(单人分析，已自动调低)', w / 2, confY + 18);
      }

      // CTA
      ctx.fillStyle = '#6366f1';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('想知道你的聊天记录中谁更有理？', w / 2, h - 65);
      ctx.fillText('扫码立即分析', w / 2, h - 45);

      // 底部品牌
      ctx.fillStyle = '#4b5563';
      ctx.font = '11px sans-serif';
      ctx.fillText('AI 调解员', w / 2, h - 20);

      // 小程序码占位区
      ctx.strokeStyle = '#374151';
      ctx.strokeRect(w - 80, h - 100, 60, 60);
      ctx.fillStyle = '#4b5563';
      ctx.font = '11px sans-serif';
      ctx.fillText('小程序码', w - 50, h - 68);
    },

    /**
     * 趣味版卡片
     */
    _renderFunCard: function (ctx, w, h, data) {
      var scoreA = data.scoreA || 50;
      var scoreB = data.scoreB || 50;
      var partyAName = data.partyAName || '甲方';
      var partyBName = data.partyBName || '乙方';

      // 标题
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('谁更有理？', w / 2, 45);

      // 两个人物
      var leftX = w / 4;
      var rightX = w * 3 / 4;

      ctx.fillStyle = '#6366f1';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(scoreA + '%', leftX, 110);

      ctx.fillStyle = '#ec4899';
      ctx.fillText(scoreB + '%', rightX, 110);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '13px sans-serif';
      ctx.fillText(partyAName, leftX, 135);
      ctx.fillText(partyBName, rightX, 135);

      // VS
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('VS', w / 2, 110);

      // CTA
      ctx.fillStyle = '#d1d5db';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('你的聊天记录里，谁更有理？', w / 2, h - 80);
      ctx.fillStyle = '#6366f1';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText('扫码测测看', w / 2, h - 58);
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
