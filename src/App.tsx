import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import AnalysisPage from './pages/AnalysisPage'
import ReportPage from './pages/ReportPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/upload/:caseId" element={<UploadPage />} />
        <Route path="/analysis/:caseId" element={<AnalysisPage />} />
        <Route path="/report/:caseId" element={<ReportPage />} />
      </Routes>
    </Layout>
  )
}
