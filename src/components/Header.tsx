import { useNavigate, useLocation } from 'react-router-dom'

export default function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <header className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isHome && (
            <button
              onClick={() => navigate(-1)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <h1
            className="text-lg font-bold cursor-pointer flex items-center gap-2"
            onClick={() => navigate('/')}
          >
            <span className="text-gold-500 text-xl">⚖️</span>
            <span className="bg-gradient-to-r from-brand-400 to-gold-400 bg-clip-text text-transparent">
              AI 调解员
            </span>
          </h1>
        </div>
      </div>
    </header>
  )
}
