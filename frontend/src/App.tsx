import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ServerManager from './pages/ServerManager'
import Terminal from './pages/Terminal'
import History from './pages/History'
import Logs from './pages/Logs'
import Layout from './components/Layout'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route
        path="/"
        element={
          <Layout>
            <Dashboard />
          </Layout>
        }
      />
      <Route
        path="/servers"
        element={
          <Layout>
            <ServerManager />
          </Layout>
        }
      />
      <Route
        path="/terminal/:sessionId"
        element={
          <Layout>
            <Terminal />
          </Layout>
        }
      />
      <Route
        path="/history"
        element={
          <Layout>
            <History />
          </Layout>
        }
      />
      <Route
        path="/logs"
        element={
          <Layout>
            <Logs />
          </Layout>
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App

