import { useState } from 'react';
import type { EvidenceWeight } from '../types';

interface Props {
  evidenceWeights: EvidenceWeight[];
  rawText?: string;
}

/**
 * 报告第二屏：证据权重列表。
 * 每条显示 weight 条 + favors 标签 + speaker + content + weightReason。
 * 点击展开原文上下文。
 */
export default function EvidenceWeights({ evidenceWeights, rawText }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const favorsLabel = (favors: string) => {
    if (favors === 'a') return '偏向甲方';
    if (favors === 'b') return '偏向乙方';
    return '中性';
  };

  const favorsColor = (favors: string) => {
    if (favors === 'a') return 'bg-blue-900/50 text-blue-400';
    if (favors === 'b') return 'bg-pink-900/50 text-pink-400';
    return 'bg-gray-700 text-gray-400';
  };

  const weightColor = (weight: number) => {
    if (weight >= 80) return 'from-green-500 to-green-400';
    if (weight >= 60) return 'from-yellow-500 to-yellow-400';
    return 'from-gray-500 to-gray-400';
  };

  /**
   * 在原始文本中搜索证据内容，返回上下文（前后各 2 行）
   */
  function findContext(content: string): string[] {
    if (!rawText) return [];
    const lines = rawText.split('\n');
    const contextLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(content.slice(0, 20))) {
        const start = Math.max(0, i - 2);
        const end = Math.min(lines.length, i + 3);
        for (let j = start; j < end; j++) {
          const prefix = j === i ? '▶ ' : '  ';
          contextLines.push(`${prefix}${lines[j]}`);
        }
        break;
      }
    }

    return contextLines;
  }

  if (evidenceWeights.length === 0) {
    return (
      <div className="card">
        <h3 className="text-sm text-brand-400 font-medium mb-2">📋 关键证据</h3>
        <p className="text-sm text-gray-500">暂无证据权重数据</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-sm text-brand-400 font-medium mb-3">
        📋 关键证据 ({evidenceWeights.length}条)
      </h3>
      <div className="space-y-3">
        {evidenceWeights.map((ev) => (
          <div key={ev.id} className="bg-gray-800/50 rounded-xl p-3">
            <div
              className="flex items-start gap-3 cursor-pointer"
              onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
            >
              {/* 权重分数 */}
              <div className="flex flex-col items-center shrink-0">
                <span className="text-lg font-bold text-gray-200">⚡{ev.weight}</span>
                <div className="w-12 bg-gray-700 rounded-full h-1.5 overflow-hidden mt-1">
                  <div
                    className={`h-full bg-gradient-to-r ${weightColor(ev.weight)} rounded-full`}
                    style={{ width: `${ev.weight}%` }}
                  />
                </div>
              </div>

              {/* 证据内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500">{ev.speaker}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${favorsColor(ev.favors)}`}>
                    {favorsLabel(ev.favors)}
                  </span>
                  {ev.timestamp && (
                    <span className="text-xs text-gray-600">{ev.timestamp}</span>
                  )}
                </div>
                <p className="text-sm text-gray-300 mb-1">"{ev.content}"</p>
                <p className="text-xs text-gray-600">→ {ev.weightReason}</p>
              </div>

              {/* 展开图标 */}
              <span className="text-gray-600 text-xs shrink-0">
                {expandedId === ev.id ? '▲' : '▼'}
              </span>
            </div>

            {/* 展开的原文上下文 */}
            {expandedId === ev.id && (
              <div className="mt-3 pt-3 border-t border-gray-700/50">
                <p className="text-xs text-gray-500 mb-1">原文上下文：</p>
                {rawText ? (
                  <pre className="text-xs text-gray-500 whitespace-pre-wrap bg-gray-950 rounded p-2 max-h-40 overflow-y-auto">
                    {findContext(ev.content).join('\n') || '未在原文中找到匹配内容'}
                  </pre>
                ) : (
                  <p className="text-xs text-gray-600">无原始文本数据</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
