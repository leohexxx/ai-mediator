import { useState } from 'react'

interface Props {
  onConfirm: (parties: { name: string; role: string }[]) => void
}

export default function PartyForm({ onConfirm }: Props) {
  const [partyA, setPartyA] = useState('')
  const [partyB, setPartyB] = useState('')
  const [relationship, setRelationship] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!partyA.trim() || !partyB.trim()) return
    onConfirm([
      { name: partyA.trim(), role: 'party_a' },
      { name: partyB.trim(), role: 'party_b' },
    ])
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h3 className="text-lg font-semibold text-gray-100">👥 人物信息</h3>

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
          placeholder="输入姓名或昵称"
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

      <button type="submit" className="btn-primary w-full">
        确认人物信息
      </button>
    </form>
  )
}
