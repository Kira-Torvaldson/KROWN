import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Server, Terminal, History, Menu, X, FileText } from 'lucide-react'
import { useState } from 'react'
import './Layout.css'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  // Authentication disabled
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/servers', icon: Server, label: 'Serveurs' },
    { path: '/history', icon: History, label: 'Historique' },
    { path: '/logs', icon: FileText, label: 'Logs' },
  ]

  return (
    <div className="layout">
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Krown</h2>
          <button className="mobile-close" onClick={() => setMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              K
            </div>
            <div className="user-details">
              <div className="user-name">Krown</div>
              <div className="user-role">Système</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileMenuOpen(true)}>
            <Menu size={24} />
          </button>
          <h1 className="page-title">
            {navItems.find((item) => item.path === location.pathname)?.label || 'Krown'}
          </h1>
        </header>

        <div className="content">{children}</div>
      </main>
    </div>
  )
}

