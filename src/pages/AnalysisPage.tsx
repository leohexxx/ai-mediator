import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '../components/Header'
import AnalysisProgress from '../components/AnalysisProgress'
import { useCase } from '../hooks/useCase'
import { useAnalysis } from '../hooks/useAnalysis'
import { saveCase, getCase } from '../utils/storage'
import type { Analysis } from '../types'

export default function AnalysisPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const { c } = useCase(caseId)
  const { progress, runAnalysis, error } = useAnalysis()
  const hasStarted = useRef(false)

  async function persistAnalysis(result: Analysis) {
    if (!caseId) return
    // Persist analysis to IndexedDB so ReportPage can load it from storage.
    // Use getCase for reliability — c may be null if useCase hasn't loaded yet.
    const existingCase = await getCase(caseId)
    if (existingCase) {
      await saveCase({ ...existingCase, analysis: result })
    }
  }

  useEffect(() => {
    if (!caseId) { navigate('/'); return }
    // Prevent double execution in React StrictMode
    if (hasStarted.current) return
    hasStarted.current = true

    runAnalysis(caseId).then(async (result) => {
      if (result) {
        await persistAnalysis(result)
        setTimeout(() => navigate(`/report/${caseId}`), 1500)
      }
    })
  }, [caseId, runAnalysis, navigate])

  function handleRetry() {
    if (!caseId) return
    hasStarted.current = true
    runAnalysis(caseId).then(async (result) => {
      if (result) {
        await persistAnalysis(result)
        setTimeout(() => navigate(`/report/${caseId}`), 1500)
      }
    })
  }

  const hasError = !!error || progress?.step === 'error'

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
          <AnalysisProgress
            progress={progress}
            onRetry={hasError ? handleRetry : undefined}
          />
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
