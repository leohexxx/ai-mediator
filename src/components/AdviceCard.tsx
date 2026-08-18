import type { Advice } from '../types'

export default function AdviceCard({ advice, partyNames }: { advice: Advice; partyNames: { a: string; b: string } }) {
  return (
    <div className="card bg-gradient-to-br from-green-950/20 to-gray-900 border-green-800/30">
      <h3 className="text-sm text-green-400 font-medium mb-4">💡 调解建议</h3>

      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            给 {partyNames.a} 的建议：
          </h4>
          <ul className="space-y-1.5">
            {advice.toA.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-400">
                <span className="text-blue-400">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">
            给 {partyNames.b} 的建议：
          </h4>
          <ul className="space-y-1.5">
            {advice.toB.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-400">
                <span className="text-pink-400">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-2">双方的共同建议：</h4>
          <ul className="space-y-1.5">
            {advice.toBoth.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-400">
                <span className="text-green-400">•</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
