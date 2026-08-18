import type { Analysis } from '../types'

export default function ReportSummary({ analysis }: { analysis: Analysis }) {
  const summary = analysis.detailedAnalysis?.summary || ''
  const relationship = analysis.detailedAnalysis?.relationship || ''

  return (
    <div className="card bg-gradient-to-br from-brand-950 to-gray-900 border-brand-800/50">
      <h3 className="text-sm text-brand-400 font-medium mb-2">📋 案情摘要</h3>
      <p className="text-gray-200 text-lg font-medium leading-relaxed">
        {summary}
      </p>
      {relationship && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-400">
            {relationship}
          </span>
        </div>
      )}
    </div>
  )
}
