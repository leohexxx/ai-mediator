import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { EmotionCurve } from '../types';

interface Props {
  emotionCurve: EmotionCurve[];
}

/**
 * 报告第二屏：双方情绪曲线双线折线图。
 * X 轴：消息序号/时间，Y 轴：0-100 情绪强度。
 * 甲方蓝色线 / 乙方粉色线。
 * hover 显示 emotion + trigger。
 */

interface ChartDataPoint {
  index: number;
  label: string;
  [key: string]: number | string;
}

export default function EmotionCurveChart({ emotionCurve }: Props) {
  if (!emotionCurve || emotionCurve.length === 0) {
    return (
      <div className="card">
        <h3 className="text-sm text-brand-400 font-medium mb-2">📈 情绪曲线</h3>
        <p className="text-sm text-gray-500">暂无情绪数据</p>
      </div>
    );
  }

  // 合并双方的情绪数据点，以序号为 X 轴
  const maxPoints = Math.max(...emotionCurve.map((c) => c.points.length));
  const chartData: ChartDataPoint[] = [];

  for (let i = 0; i < maxPoints; i++) {
    const point: ChartDataPoint = {
      index: i,
      label: `#${i + 1}`,
    };

    for (const curve of emotionCurve) {
      const pt = curve.points[i];
      if (pt) {
        point[curve.speaker] = pt.intensity;
        // 存储情绪标签和触发原因用于 tooltip
        point[`${curve.speaker}_emotion`] = pt.emotion;
        point[`${curve.speaker}_trigger`] = pt.trigger;
        point[`${curve.speaker}_time`] = pt.timestamp || '';
      }
    }

    chartData.push(point);
  }

  // 颜色映射：甲方蓝、乙方粉、其他灰
  const lineColors = ['#60a5fa', '#f472b6', '#a78bfa', '#34d399', '#fbbf24'];

  interface TooltipEntry {
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }

  function CustomTooltip({ active, payload, label }: {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: string;
  }) {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs">
        <p className="text-gray-500 mb-2">消息 {label}</p>
        {payload.map((entry, i) => {
          const speaker = entry.dataKey;
          const emotion = chartData.find((d) => d.label === label)?.[`${speaker}_emotion`];
          const trigger = chartData.find((d) => d.label === label)?.[`${speaker}_trigger`];
          const time = chartData.find((d) => d.label === label)?.[`${speaker}_time`];

          return (
            <div key={i} className="mb-2 last:mb-0">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-300">{speaker}</span>
                <span className="text-gray-500">强度: {entry.value}</span>
              </div>
              {emotion && <p className="text-gray-400 ml-4">情绪: {String(emotion)}</p>}
              {trigger && <p className="text-gray-500 ml-4">触发: {String(trigger)}</p>}
              {time && <p className="text-gray-600 ml-4">时间: {String(time)}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-sm text-brand-400 font-medium mb-3">📈 情绪曲线</h3>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
          >
            <XAxis
              dataKey="label"
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#374151' }}
            />
            <YAxis
              domain={[0, 100]}
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: '#374151' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              iconType="circle"
            />
            {emotionCurve.map((curve, i) => (
              <Line
                key={curve.speaker}
                type="monotone"
                dataKey={curve.speaker}
                stroke={lineColors[i % lineColors.length]}
                strokeWidth={2}
                dot={{ r: 3, fill: lineColors[i % lineColors.length] }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {emotionCurve.length > 0 && (
        <div className="mt-3 space-y-1">
          {emotionCurve.map((curve) => {
            const emotions = curve.points.map((p) => p.emotion).join('→');
            return (
              <p key={curve.speaker} className="text-xs text-gray-500">
                {curve.speaker}: {emotions}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}
