import { useState, useEffect } from 'react'

interface PartyData {
  name: string;
  role: string;
}

interface Props {
  onConfirm: (parties: PartyData[], relationship: string) => void;
  initialParties?: PartyData[];
  initialRelationship?: string;
  skipLabel?: string;
}

export default function PartyForm({ onConfirm, initialParties, initialRelationship, skipLabel }: Props) {
  const [partyA, setPartyA] = useState('')
  const [partyB, setPartyB] = useState('')
  const [relationship, setRelationship] = useState('')

  // 当 initialParties 变化时，预填值
  useEffect(() => {
    if (initialParties && initialParties.length > 0) {
      const a = initialParties.find((p) => p.role === 'party_a')
      const b = initialParties.find((p) => p.role === 'party_b')
      if (a) setPartyA(a.name)
      if (b) setPartyB(b.name)
    }
  }, [initialParties])

  // 当 initialRelationship 变化时，预填值
  useEffect(() => {
    if (initialRelationship !== undefined) {
      setRelationship(initialRelationship)
    }
  }, [initialRelationship])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // 甲方必须填写，乙方可选（方案D：不强制先填表单）
    if (!partyA.trim()) return

    const parties: PartyData[] = [
      { name: partyA.trim(), role: 'party_a' },
    ]
    if (partyB.trim()) {
      parties.push({ name: partyB.trim(), role: 'party_b' })
    }
    onConfirm(parties, relationship)
  }

  const handleSkip = () => {
    // 跳过：使用默认值或已填写的值
    const parties: PartyData[] = [
      { name: partyA.trim() || '甲方', role: 'party_a' },
    ]
    if (partyB.trim()) {
      parties.push({ name: partyB.trim(), role: 'party_b' })
    } else {
      parties.push({ name: '乙方', role: 'party_b' })
    }
    onConfirm(parties, relationship)
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h3 className="text-lg font-semibold text-gray-100">👥 人物信息</h3>
      <p className="text-xs text-gray-500">可随时修改，关系类型为可选项</p>

      <div>
        <label className="block text-sm text-gray-400 mb-1">甲方（先说话的人 / 原告）</label>
        <input
          className="input-field"
          value={partyA}
          onChange={(e) => setPartyA(e.target.value)}
          placeholder="输入姓名或昵称"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">乙方（另一方 / 被告）</label>
        <input
          className="input-field"
          value={partyB}
          onChange={(e) => setPartyB(e.target.value)}
          placeholder="输入姓名或昵称（可选）"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">关系类型（选填）</label>
        <select
          className="input-field"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        >
          <option value="">不指定，让 AI 判断</option>
          <option value="couple">情侣</option>
          <option value="friends">朋友</option>
          <option value="colleagues">同事</option>
          <option value="family">家人</option>
          <option value="other">其他</option>
        </select>
      </div>

      <div className="flex gap-3">
        <button type="submit" className="btn-primary flex-1">
          确认并开始分析
        </button>
        {skipLabel && (
          <button
            type="button"
            onClick={handleSkip}
            className="btn-secondary flex-1"
          >
            {skipLabel}
          </button>
        )}
      </div>
    </form>
  )
}
