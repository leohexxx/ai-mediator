import { useState } from 'react';
import type { DetailedAnalysis, ChatMessage } from '../types';
import CharacterMap from './CharacterMap';
import Timeline from './Timeline';
import ChatPanel from './ChatPanel';

interface Props {
  detailedAnalysis: DetailedAnalysis;
  partyNames: { a: string; b: string };
  chatMessages: ChatMessage[];
  onSend: (content: string) => void;
  streaming: boolean;
  streamContent: string;
}

type TabKey = 'characters' | 'conflicts' | 'timeline' | 'chat';

interface TabDef {
  key: TabKey;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { key: 'characters', label: '人物画像', icon: '👥' },
  { key: 'conflicts', label: '争议焦点', icon: '⚔️' },
  { key: 'timeline', label: '时间线', icon: '⏱️' },
  { key: 'chat', label: '追问调解员', icon: '💬' },
];

/**
 * 报告第四屏：详细分析折叠 Tab 容器。
 * 包含：人物画像 / 争议焦点 / 时间线 / 追问调解员。
 * 默认折叠，点击展开。
 */
export default function DetailedAnalysisTabs({
  detailedAnalysis,
  partyNames,
  chatMessages,
  onSend,
  streaming,
  streamContent,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);

  const severityLabel = (severity: string) => {
    if (severity === 'high') return '严重';
    if (severity === 'medium') return '中等';
    return '轻微';
  };

  const severityColor = (severity: string) => {
    if (severity === 'high') return 'bg-red-900/50 text-red-400';
    if (severity === 'medium') return 'bg-yellow-900/50 text-yellow-400';
    return 'bg-green-900/50 text-green-400';
  };

  const winnerLabel = (winner: string) => {
    if (winner === 'a') return partyNames.a;
    if (winner === 'b') return partyNames.b;
    return '平局';
  };

  return (
    <div className="card">
      <h3 className="text-sm text-brand-400 font-medium mb-3">📖 详细分析</h3>

      {/* Tab 按钮 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(activeTab === tab.key ? null : tab.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              activeTab === tab.key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容区 */}
      {activeTab === 'characters' && (
        <CharacterMap characters={detailedAnalysis.characters} />
      )}

      {activeTab === 'conflicts' && (
        <div className="space-y-3">
          {detailedAnalysis.conflicts.length === 0 ? (
            <p className="text-sm text-gray-500">暂无争议焦点数据</p>
          ) : (
            detailedAnalysis.conflicts.map((conflict, i) => (
              <div key={i} className="bg-gray-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-200">{conflict.topic}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${severityColor(conflict.severity)}`}>
                    {severityLabel(conflict.severity)}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">
                    更有理: {winnerLabel(conflict.winner)}
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-blue-400">
                    {partyNames.a}: {conflict.partyAStance}
                  </p>
                  <p className="text-pink-400">
                    {partyNames.b}: {conflict.partyBStance}
                  </p>
                  <p className="text-gray-400 mt-2">
                    <span className="text-brand-400">AI 判断：</span>
                    {conflict.aiJudgment}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'timeline' && (
        <Timeline events={detailedAnalysis.timeline} />
      )}

      {activeTab === 'chat' && (
        <ChatPanel
          messages={chatMessages}
          onSend={onSend}
          streaming={streaming}
          streamContent={streamContent}
        />
      )}

      {activeTab === null && (
        <p className="text-sm text-gray-600 text-center py-4">
          点击上方标签查看详细分析
        </p>
      )}
    </div>
  );
}
