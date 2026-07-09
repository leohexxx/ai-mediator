import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '../components/Header'
import PartyForm from '../components/PartyForm'
import EvidenceUpload from '../components/EvidenceUpload'
import { createCase } from '../services/api'
import { saveCase } from '../utils/storage'
import type { Case } from '../types'

export default function UploadPage() {
  const navigate = useNavigate()
  const { caseId } = useParams<{ caseId?: string }>()
  const [currentCase, setCurrentCase] = useState<Case | null>(null)
  const [step, setStep] = useState<'parties' | 'evidence' | 'done'>('parties')
  const [evidenceTexts, setEvidenceTexts] = useState<
    { text: string; source: string }[]
  >([])

  async function handlePartiesConfirmed(
    parties: { name: string; role: string }[]
  ) {
    const c = await createCase(`${parties[0]?.name || '?'} vs ${parties[1]?.name || '?'}`)
    c.parties = parties
    await saveCase(c)
    setCurrentCase(c)
    setStep('evidence')
  }

  function handleTextExtracted(text: string, source: string) {
    setEvidenceTexts((prev) => [...prev, { text, source }])
  }

  async function handleAnalyze() {
    if (!currentCase) return
    const allText = evidenceTexts
      .map((e) => `[来源: ${e.source}]\n${e.text}`)
      .join('\n\n')
    currentCase.rawText = allText
    currentCase.evidence = evidenceTexts.map((e, i) => ({
      id: `ev_${i}`,
      type: 'screenshot' as const,
      source: e.source as 'party_a' | 'party_b' | 'self',
      fileName: '',
      extractedText: e.text,
      uploadedAt: new Date().toISOString(),
    }))
    await saveCase(currentCase)
    navigate(`/analysis/${currentCase.id}`)
  }

  return (
    <div>
      <Header />

      <div className="mt-6 space-y-6">
        {step === 'parties' && (
          <PartyForm onConfirm={handlePartiesConfirmed} />
        )}

        {step === 'evidence' && currentCase && (
          <div className="space-y-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                📋 {currentCase.title}
              </h3>
              <div className="flex gap-2 text-sm text-gray-400">
                {currentCase.parties.map((p) => (
                  <span key={p.role} className="px-2 py-1 bg-gray-800 rounded-lg">
                    {p.name} ({p.role === 'party_a' ? '甲方' : '乙方'})
                  </span>
                ))}
              </div>
            </div>

            <EvidenceUpload
              source="party_a"
              partyName={currentCase.parties.find((p) => p.role === 'party_a')?.name}
              onTextExtracted={handleTextExtracted}
            />

            <EvidenceUpload
              source="party_b"
              partyName={currentCase.parties.find((p) => p.role === 'party_b')?.name}
              onTextExtracted={handleTextExtracted}
            />

            <EvidenceUpload
              source="self"
              onTextExtracted={handleTextExtracted}
            />

            {evidenceTexts.length > 0 && (
              <div className="card">
                <h4 className="font-medium text-gray-200 mb-2">
                  已提取 {evidenceTexts.length} 份证据
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {evidenceTexts.map((e, i) => (
                    <details key={i} className="text-sm">
                      <summary className="text-gray-400 cursor-pointer">
                        证据 {i + 1} — 来源: {e.source}（{e.text.length} 字）
                      </summary>
                      <pre className="mt-1 p-2 bg-gray-950 rounded text-gray-500 text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {e.text.slice(0, 500)}
                        {e.text.length > 500 ? '...' : ''}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={evidenceTexts.length === 0}
              className="btn-primary w-full text-lg"
            >
              ⚖️ 开始分析
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
