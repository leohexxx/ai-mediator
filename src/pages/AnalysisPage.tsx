import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '../components/Header'
import AnalysisProgress from '../components/AnalysisProgress'
import { useCase } from '../hooks/useCase'
import { useAnalysis } from '../hooks/useAnalysis'

export default function AnalysisPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const { c } = useCase(caseId)
  const { progress, runAnalysis } = useAnalysis()

  useEffect(() => {
    if (!caseId) { navigate('/'); return }
    runAnalysis(caseId).then((result) => {
      if (result) {
        setTimeout(() => navigate(`/report/${caseId}`), 1500)
      }
    })
  }, [caseId])

  return (
    <div>
      <Header />
      <div className="mt-6">
        {c && (
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-gray-100">{c.title}</h2>
            <p className="text-gray-500 text-sm mt-1">
              {c.parties.map((p) => p.name).join(' vs ')}
            </p>
          </div>
        )}
        {progress ? (
          <AnalysisProgress progress={progress} />
        ) : (
          <div className="card text-center py-12">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p className="text-gray-400">准备分析...</p>
          </div>
        )}
      </div>
    </div>
  )
}
