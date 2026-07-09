import type { TimelineEvent } from '../types'

const EMOTION_COLORS: Record<string, string> = {
  '生气': 'text-red-400 bg-red-900/30',
  '愤怒': 'text-red-500 bg-red-900/50',
  '委屈': 'text-blue-400 bg-blue-900/30',
  '伤心': 'text-purple-400 bg-purple-900/30',
  '冷静': 'text-green-400 bg-green-900/30',
  '开心': 'text-yellow-400 bg-yellow-900/30',
  '无奈': 'text-gray-400 bg-gray-800',
}

export default function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="card">
      <h3 className="text-sm text-brand-400 font-medium mb-3">⏱️ 关键时间线</h3>
      <div className="space-y-3">
        {events.map((event, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5" />
              {i < events.length - 1 && (
                <div className="w-px flex-1 bg-gray-800 mt-1" />
              )}
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-gray-200">
                  {event.speaker}
                </span>
                {event.timestamp && (
                  <span className="text-xs text-gray-600">{event.timestamp}</span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  EMOTION_COLORS[event.emotion] || 'text-gray-400 bg-gray-800'
                }`}>
                  {event.emotion}
                </span>
              </div>
              <p className="text-sm text-gray-400">{event.content}</p>
              <p className="text-xs text-gray-600 mt-0.5">{event.significance}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
