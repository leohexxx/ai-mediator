import type { Character } from '../types'

export default function CharacterMap({ characters }: { characters: Character[] }) {
  return (
    <div>
      <div className="grid gap-3">
        {characters.map((char, i) => (
          <div key={i} className="bg-gray-800/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-gray-100">{char.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                char.role === 'party_a'
                  ? 'bg-blue-900/50 text-blue-400'
                  : char.role === 'party_b'
                  ? 'bg-pink-900/50 text-pink-400'
                  : 'bg-gray-700 text-gray-400'
              }`}>
                {char.role === 'party_a' ? '甲方' : char.role === 'party_b' ? '乙方' : '其他'}
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-1">{char.personality}</p>
            <p className="text-sm text-gray-500">立场：{char.stance}</p>
            <p className="text-sm text-gray-500">情绪：{char.emotionalState}</p>
            {char.communicationStyle && (
              <p className="text-sm text-gray-500">沟通风格：{char.communicationStyle}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
