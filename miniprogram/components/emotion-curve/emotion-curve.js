// ═══════════════════════════════════════════════
// emotion-curve 组件 — Canvas 2D 情绪曲线折线图
// ═══════════════════════════════════════════════

Component({
  properties: {
    /** 情绪曲线数据 EmotionCurve[] */
    curves: {
      type: Array,
      value: [],
    },
  },

  data: {
    /** Canvas 宽度 */
    canvasWidth: 0,
    /** Canvas 高度 */
    canvasHeight: 400,
    /** 是否有数据 */
    hasData: false,
  },

  lifetimes: {
    ready: function () {
      this.initCanvas();
    },
  },

  observers: {
    'curves': function (curves) {
      if (curves && curves.length > 0) {
        this.setData({ hasData: true });
        // 延迟绘制以确保 canvas 已就绪
        var that = this;
        setTimeout(function () {
          that.drawChart();
        }, 300);
      } else {
        this.setData({ hasData: false });
      }
    },
  },

  methods: {
    /**
     * 初始化 Canvas
     */
    initCanvas: function () {
      var that = this;
      var query = this.createSelectorQuery();
      query.select('#emotionCanvas')
        .fields({ node: true, size: true })
        .exec(function (res) {
          if (res && res[0]) {
            var canvas = res[0].node;
            var ctx = canvas.getContext('2d');
            var dpr = wx.getSystemInfoSync().pixelRatio;

            canvas.width = res[0].width * dpr;
            canvas.height = that.data.canvasHeight * dpr;
            ctx.scale(dpr, dpr);

            that.canvas = canvas;
            that.ctx = ctx;
            that.canvasWidth = res[0].width;

            that.setData({ canvasWidth: res[0].width });

            if (that.data.hasData) {
              that.drawChart();
            }
          }
        });
    },

    /**
     * 绘制情绪曲线
     */
    drawChart: function () {
      if (!this.ctx || !this.data.curves || this.data.curves.length === 0) return;

      var ctx = this.ctx;
      var width = this.canvasWidth || 680;
      var height = this.data.canvasHeight;

      // 清除画布
      ctx.clearRect(0, 0, width, height);

      // 边距
      var padding = { top: 40, right: 30, bottom: 60, left: 50 };
      var chartWidth = width - padding.left - padding.right;
      var chartHeight = height - padding.top - padding.bottom;

      // 绘制坐标轴
      this.drawAxes(ctx, padding, chartWidth, chartHeight, width, height);

      // 绘制每条曲线
      var colors = ['#6366F1', '#EC4899'];
      for (var c = 0; c < this.data.curves.length; c++) {
        var curve = this.data.curves[c];
        this.drawCurve(ctx, curve, padding, chartWidth, chartHeight, colors[c % colors.length]);
      }

      // 绘制图例
      this.drawLegend(ctx, width, this.data.curves, colors);
    },

    /**
     * 绘制坐标轴
     */
    drawAxes: function (ctx, padding, chartWidth, chartHeight, width, height) {
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '20rpx sans-serif';
      ctx.textAlign = 'center';

      // Y 轴
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top);
      ctx.lineTo(padding.left, padding.top + chartHeight);
      ctx.stroke();

      // Y 轴标签
      var yLabels = ['100', '75', '50', '25', '0'];
      for (var i = 0; i < yLabels.length; i++) {
        var y = padding.top + (chartHeight / 4) * i;
        ctx.fillText(yLabels[i], padding.left - 25, y + 5);

        // 网格线
        ctx.strokeStyle = '#1F2937';
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
        ctx.strokeStyle = '#374151';
      }

      // X 轴
      ctx.beginPath();
      ctx.moveTo(padding.left, padding.top + chartHeight);
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
      ctx.stroke();

      // X 轴标签
      var xLabel = '时间 →';
      ctx.fillText(xLabel, padding.left + chartWidth / 2, height - 15);

      var yLabel = '强度';
      ctx.save();
      ctx.translate(15, padding.top + chartHeight / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    },

    /**
     * 绘制单条曲线
     */
    drawCurve: function (ctx, curve, padding, chartWidth, chartHeight, color) {
      if (!curve.points || curve.points.length === 0) return;

      var points = curve.points;
      var xStep = points.length > 1 ? chartWidth / (points.length - 1) : chartWidth;

      // 绘制折线
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();

      for (var i = 0; i < points.length; i++) {
        var x = padding.left + xStep * i;
        var y = padding.top + chartHeight - (points[i].intensity / 100) * chartHeight;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // 绘制数据点
      for (var j = 0; j < points.length; j++) {
        var px = padding.left + xStep * j;
        var py = padding.top + chartHeight - (points[j].intensity / 100) * chartHeight;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();

        // 白色内圈
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    /**
     * 绘制图例
     */
    drawLegend: function (ctx, width, curves, colors) {
      var legendY = 20;
      var legendX = width - 30;

      for (var i = curves.length - 1; i >= 0; i--) {
        var text = curves[i].speaker || ('方' + (i + 1));
        ctx.textAlign = 'right';
        ctx.font = '18rpx sans-serif';

        var textWidth = ctx.measureText(text).width;
        var dotX = legendX - textWidth - 16;

        // 颜色点
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.arc(dotX, legendY, 6, 0, Math.PI * 2);
        ctx.fill();

        // 标签
        ctx.fillStyle = '#9CA3AF';
        ctx.fillText(text, legendX, legendY + 5);

        legendY += 24;
      }
    },
  },
});
