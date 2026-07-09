import type { Verdict } from '../types'

export default function VerdictCard({ verdict }: { verdict: Verdict }) {
  const isTie = verdict.overallWinner === 'tie'
  const aWins = verdict.overallWinner === 'a'

  return (
    <div className="card bg-gradient-to-br from-yellow-950/30 to-gray-900 border-yellow-800/30">
      <h3 className="text-sm text-gold-400 font-medium mb-4">⚖️ 仲裁结果</h3>

      {!isTie && (
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-gray-100">{verdict.scoreA}</div>
            <div className="text-xs text-gray-500">甲方合理度</div>
          </div>
          <div className="text-gray-600 text-sm">vs</div>
          <div className="flex-1 text-center">
            <div className="text-2xl font-bold text-gray-100">{verdict.scoreB}</div>
            <div className="text-xs text-gray-500">乙方合理度</div>
          </div>
        </div>
      )}

      {isTie && (
        <div className="text-center mb-4">
          <span className="text-lg text-gold-400 font-semibold">双方各有道理，难分高下</span>
        </div>
      )}

      {!isTie && (
        <p className="text-gold-400 font-semibold mb-3 text-center">
          🏆 {aWins ? '甲方更有理' : '乙方更有理'}
        </p>
      )}

      <p className="text-sm text-gray-300 mb-3">{verdict.summary}</p>

      <div className="space-y-1.5">
        {verdict.reasoning.map((reason, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="text-gold-500 shrink-0">▸</span>
            <span className="text-gray-400">{reason}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
