import type { AnalysisProgress } from '../types'

interface Props {
  progress: AnalysisProgress
  onRetry?: () => void
}

const STEP_LABELS: Record<string, string> = {
  extracting: '📄 提取聊天内容',
  parsing: '🔍 解析对话结构',
  understanding: '🧠 理解对话上下文',
  evidence: '⚡ 提取关键证据',
  emotion: '📈 分析情绪变化',
  judging: '⚖️ 综合判断',
  strategy: '🤝 制定调解策略',
  analyzing: '⚖️ 分析冲突与对错',
  generating: '📝 生成分析报告',
  done: '✅ 分析完成',
  error: '❌ 分析出错',
}

export default function AnalysisProgress({ progress, onRetry }: Props) {
  const isError = progress.step === 'error'
  const isDone = progress.step === 'done'

  return (
    <div className="card text-center py-12">
      {isError ? (
        <div className="text-5xl mb-4">❌</div>
      ) : isDone ? (
        <div className="text-5xl mb-4">✅</div>
      ) : (
        <div className="text-5xl mb-4 animate-bounce">⚖️</div>
      )}

      <h3 className="text-lg font-semibold text-gray-100 mb-2">
        {STEP_LABELS[progress.step] || progress.message}
      </h3>
      <p className="text-gray-500 text-sm mb-4">{progress.message}</p>

      {!isError && !isDone && (
        <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-gold-500 rounded-full transition-all duration-500"
            style={{ width: `${progress.progress}%` }}
          />
        </div>
      )}

      {isError && (
        <>
          <p className="text-red-400 text-sm mt-2">{progress.message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="btn-primary mt-4"
            >
              重试
            </button>
          )}
        </>
      )}
    </div>
  )
}
