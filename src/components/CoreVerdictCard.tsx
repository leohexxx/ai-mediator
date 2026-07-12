import type { CoreConclusion } from '../types';

interface Props {
  coreConclusion: CoreConclusion;
  partyNames: { a: string; b: string };
}

/**
 * 报告第一屏：核心结论。
 * 显示胜方 + 分数对比 + 一句话结论 + 核心原因 + 置信度进度条 + 建议行动。
 * 不滚动即可看到全部核心信息。
 */
export default function CoreVerdictCard({ coreConclusion, partyNames }: Props) {
  const isTie = coreConclusion.overallWinner === 'tie';
  const aWins = coreConclusion.overallWinner === 'a';

  // 置信度等级
  const confidenceLevel =
    coreConclusion.confidence >= 75 ? 'high' : coreConclusion.confidence >= 50 ? 'medium' : 'low';
  const confidenceLabel =
    confidenceLevel === 'high' ? '高置信' : confidenceLevel === 'medium' ? '中置信' : '低置信';
  const confidenceColor =
    confidenceLevel === 'high'
      ? 'from-green-500 to-green-400'
      : confidenceLevel === 'medium'
        ? 'from-yellow-500 to-yellow-400'
        : 'from-red-500 to-red-400';
  const confidenceTextColor =
    confidenceLevel === 'high'
      ? 'text-green-400'
      : confidenceLevel === 'medium'
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div className="card bg-gradient-to-br from-yellow-950/30 to-gray-900 border-yellow-800/30">
      <h3 className="text-sm text-gold-400 font-medium mb-4">⚖️ 仲裁结论</h3>

      {/* 分数对比 */}
      {!isTie && (
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 text-center">
            <div className={`text-3xl font-bold ${aWins ? 'text-gold-400' : 'text-gray-300'}`}>
              {coreConclusion.scoreA}
            </div>
            <div className="text-xs text-gray-500">{partyNames.a}合理度</div>
          </div>
          <div className="text-gray-600 text-sm">vs</div>
          <div className="flex-1 text-center">
            <div className={`text-3xl font-bold ${!aWins ? 'text-gold-400' : 'text-gray-300'}`}>
              {coreConclusion.scoreB}
            </div>
            <div className="text-xs text-gray-500">{partyNames.b}合理度</div>
          </div>
        </div>
      )}

      {isTie && (
        <div className="text-center mb-4">
          <span className="text-lg text-gold-400 font-semibold">双方各有道理，难分高下</span>
        </div>
      )}

      {/* 胜方标记 */}
      {!isTie && (
        <p className="text-gold-400 font-semibold mb-3 text-center">
          🏆 {aWins ? partyNames.a : partyNames.b}更有理
        </p>
      )}

      {/* 一句话结论 */}
      <p className="text-sm text-gray-200 mb-4 leading-relaxed font-medium">
        {coreConclusion.oneLineVerdict}
      </p>

      {/* 核心原因 */}
      {coreConclusion.keyReasons.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {coreConclusion.keyReasons.map((reason, i) => (
            <div key={i} className="flex gap-2 text-sm">
              <span className="text-gold-500 shrink-0">▸</span>
              <span className="text-gray-400">{reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* 置信度进度条 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">📊 置信度</span>
          <span className={`text-xs font-medium ${confidenceTextColor}`}>
            {coreConclusion.confidence}% · {confidenceLabel}
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${confidenceColor} rounded-full transition-all duration-500`}
            style={{ width: `${coreConclusion.confidence}%` }}
          />
        </div>
        {coreConclusion.confidenceReasons.length > 0 && (
          <div className="mt-2 space-y-1">
            {coreConclusion.confidenceReasons.map((reason, i) => (
              <p key={i} className="text-xs text-gray-600">· {reason}</p>
            ))}
          </div>
        )}
      </div>

      {/* 建议行动 */}
      <div className="bg-gray-800/50 rounded-xl p-3">
        <p className="text-xs text-brand-400 mb-1">➡️ 建议行动</p>
        <p className="text-sm text-gray-300">{coreConclusion.recommendedAction}</p>
      </div>
    </div>
  );
}
