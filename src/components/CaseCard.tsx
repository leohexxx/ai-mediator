import { useNavigate } from 'react-router-dom'
import type { Case } from '../types'

export default function CaseCard({ c }: { c: Case }) {
  const navigate = useNavigate()
  const hasAnalysis = c.analysis !== null

  return (
    <div
      onClick={() => navigate(hasAnalysis ? `/report/${c.id}` : `/upload/${c.id}`)}
      className="card cursor-pointer hover:border-gray-700 transition-all duration-200 active:scale-[0.98]"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-100">{c.title || '未命名案例'}</h3>
        {hasAnalysis ? (
          <span className="text-xs px-2 py-1 rounded-full bg-green-900/50 text-green-400 border border-green-800">
            已分析
          </span>
        ) : (
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-900/50 text-yellow-400 border border-yellow-800">
            待分析
          </span>
        )}
      </div>

      <div className="text-sm text-gray-500 space-y-1">
        <p>证据数：{c.evidence.length} 份</p>
        <p>创建时间：{new Date(c.createdAt).toLocaleDateString('zh-CN')}</p>
      </div>

      {hasAnalysis && c.analysis && (
        <p className="mt-3 text-sm text-gray-400 line-clamp-2">
          {c.analysis.detailedAnalysis?.summary || c.analysis.coreConclusion?.oneLineVerdict || ''}
        </p>
      )}
    </div>
  )
}
