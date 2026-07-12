import { Routes, Route, useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import AnalysisPage from './pages/AnalysisPage'
import ReportPage from './pages/ReportPage'

function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="card text-center py-12 mt-6">
      <div className="text-5xl mb-4">🔍</div>
      <p className="text-gray-400 mb-4">页面不存在</p>
      <button onClick={() => navigate('/')} className="btn-primary">
        返回首页
      </button>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/upload/:caseId" element={<UploadPage />} />
          <Route path="/analysis/:caseId" element={<AnalysisPage />} />
          <Route path="/report/:caseId" element={<ReportPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}
