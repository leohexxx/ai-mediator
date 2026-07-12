import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '../components/Header'
import PartyForm from '../components/PartyForm'
import EvidenceUpload from '../components/EvidenceUpload'
import { createCase, addTextEvidence, updateCaseServer } from '../services/api'
import { saveCase, getCase } from '../utils/storage'
import type { Case } from '../types'

export default function UploadPage() {
  const navigate = useNavigate()
  const { caseId } = useParams<{ caseId?: string }>()
  const [currentCase, setCurrentCase] = useState<Case | null>(null)
  // 方案D：进入即上传，不再先填表单
  const [step, setStep] = useState<'upload' | 'analyze'>('upload')
  const [evidenceTexts, setEvidenceTexts] = useState<
    { text: string; source: string }[]
  >([])

  const [relationship, setRelationship] = useState('')
  const [partyAName, setPartyAName] = useState('')
  const [partyBName, setPartyBName] = useState('')
  const [partiesConfirmed, setPartiesConfirmed] = useState(false)

  // Restore existing case when caseId param is present
  useEffect(() => {
    if (!caseId) return
    getCase(caseId).then((existingCase) => {
      if (existingCase) {
        setCurrentCase(existingCase)
        setStep('analyze')
        // Restore evidence texts from the saved case
        setEvidenceTexts(
          existingCase.evidence.map((e) => ({
            text: e.extractedText,
            source: e.source,
          }))
        )
        if (existingCase.relationship) {
          setRelationship(existingCase.relationship)
        }
        // Restore party names
        const a = existingCase.parties.find((p) => p.role === 'party_a')
        const b = existingCase.parties.find((p) => p.role === 'party_b')
        if (a) setPartyAName(a.name)
        if (b) setPartyBName(b.name)
        if (existingCase.parties.length > 0) {
          setPartiesConfirmed(true)
        }
      }
    })
  }, [caseId])

  function handleTextExtracted(text: string, source: string) {
    setEvidenceTexts((prev) => [...prev, { text, source }])
  }

  function handleSpeakersExtracted(speakers: string[]) {
    // OCR 自动提取说话人名字填充表单
    if (speakers.length >= 1 && !partyAName) {
      setPartyAName(speakers[0])
    }
    if (speakers.length >= 2 && !partyBName) {
      setPartyBName(speakers[1])
    }
  }

  async function handlePartiesConfirmed(
    parties: { name: string; role: string }[],
    rel: string
  ) {
    setRelationship(rel)

    // 更新甲乙方名字
    const a = parties.find((p) => p.role === 'party_a')
    const b = parties.find((p) => p.role === 'party_b')
    if (a) setPartyAName(a.name)
    if (b) setPartyBName(b.name)
    setPartiesConfirmed(true)

    // 如果还没有 case，创建一个
    if (!currentCase) {
      const title = `${parties[0]?.name || '?'} vs ${parties[1]?.name || '?'}`
      const c = await createCase(title)
      c.parties = parties
      if (rel) {
        c.relationship = rel
      }
      // Sync parties and relationship to server
      const serverUpdates: Partial<Case> = { parties }
      if (rel) {
        serverUpdates.relationship = rel
      }
      await updateCaseServer(c.id, serverUpdates)
      await saveCase(c)
      setCurrentCase(c)
    } else {
      // 更新已有 case 的 parties
      const serverUpdates: Partial<Case> = { parties }
      if (rel) {
        serverUpdates.relationship = rel
      }
      await updateCaseServer(currentCase.id, serverUpdates)
      const updated = { ...currentCase, parties, relationship: rel || undefined }
      await saveCase(updated)
      setCurrentCase(updated)
    }

    setStep('analyze')
  }

  async function handleAnalyze() {
    if (!currentCase) {
      // 如果用户直接点分析但还没创建 case，先创建
      const parties = [
        { name: partyAName || '甲方', role: 'party_a' },
      ]
      if (partyBName) {
        parties.push({ name: partyBName, role: 'party_b' })
      } else {
        parties.push({ name: '乙方', role: 'party_b' })
      }
      const title = `${parties[0].name} vs ${parties[1].name}`
      const c = await createCase(title)
      c.parties = parties
      if (relationship) {
        c.relationship = relationship
      }
      await updateCaseServer(c.id, { parties, relationship: relationship || undefined })
      await saveCase(c)
      setCurrentCase(c)

      // 同步证据到服务器
      for (const e of evidenceTexts) {
        await addTextEvidence(
          c.id,
          e.text,
          e.source as 'party_a' | 'party_b' | 'self'
        )
      }
      navigate(`/analysis/${c.id}`)
      return
    }

    // Sync evidence to server (critical: the analyze endpoint reads from server memory)
    for (const e of evidenceTexts) {
      await addTextEvidence(
        currentCase.id,
        e.text,
        e.source as 'party_a' | 'party_b' | 'self'
      )
    }

    // If relationship was specified, prepend it as context to the raw text
    const relationshipContext = relationship
      ? `[关系类型: ${relationship}]\n\n`
      : ''

    const allText =
      relationshipContext +
      evidenceTexts
        .map((e) => `[来源: ${e.source}]\n${e.text}`)
        .join('\n\n')

    currentCase.rawText = allText
    currentCase.relationship = relationship || undefined
    currentCase.evidence = evidenceTexts.map((e, i) => ({
      id: `ev_${i}`,
      type: 'screenshot' as const,
      source: e.source as 'party_a' | 'party_b' | 'self',
      fileName: '',
      extractedText: e.text,
      uploadedAt: new Date().toISOString(),
    }))

    // 确保 parties 已设置
    if (currentCase.parties.length === 0) {
      currentCase.parties = [
        { name: partyAName || '甲方', role: 'party_a' },
        { name: partyBName || '乙方', role: 'party_b' },
      ]
      await updateCaseServer(currentCase.id, { parties: currentCase.parties })
    }

    await saveCase(currentCase)
    navigate(`/analysis/${currentCase.id}`)
  }

  const initialParties = [
    { name: partyAName, role: 'party_a' },
    { name: partyBName, role: 'party_b' },
  ].filter((p) => p.name)

  return (
    <div>
      <Header />

      <div className="mt-6 space-y-6">
        {step === 'upload' && (
          <div className="space-y-6">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                📤 上传聊天截图
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                上传微信聊天截图，AI 会自动识别文字并提取说话人名字
              </p>
            </div>

            <EvidenceUpload
              source="party_a"
              partyName={partyAName || '甲方'}
              onTextExtracted={handleTextExtracted}
              onSpeakersExtracted={handleSpeakersExtracted}
            />

            {(partyAName || partyBName) && (
              <PartyForm
                onConfirm={handlePartiesConfirmed}
                initialParties={initialParties}
                initialRelationship={relationship}
                skipLabel="跳过，直接分析"
              />
            )}

            {evidenceTexts.length > 0 && !partyAName && !partyBName && (
              <PartyForm
                onConfirm={handlePartiesConfirmed}
                skipLabel="跳过，直接分析"
              />
            )}

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
          </div>
        )}

        {step === 'analyze' && currentCase && (
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
              onSpeakersExtracted={handleSpeakersExtracted}
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
