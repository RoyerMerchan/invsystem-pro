import { useState, useEffect } from 'react'
import DashboardPage from './pages/DashboardPage'
import InventarioPage from './pages/InventarioPage'
import AlertasPage from './pages/AlertasPage'
import ProyeccionesPage from './pages/ProyeccionesPage'
import ReportesPage from './pages/ReportesPage'
import ScannerPage from './pages/ScannerPage'
import KioskoPage from './pages/KioskoPage'
import ProveedoresPage from './pages/ProveedoresPage'
import UsuariosPage from './pages/UsuariosPage'
import VentasPage from './pages/VentasPage'
import ValidacionPage from './pages/ValidacionPage'
import XAIPage from './pages/XAIPage'
import LoginPage, { RegisterPage } from './pages/LoginPage'
import { useRol } from './hooks/useRol'
import type { Usuario } from './types'

type Page = 'dashboard' | 'inventario' | 'alertas' | 'proyecciones' | 'xai' | 'reportes' | 'scanner' | 'proveedores' | 'ventas' | 'validacion' | 'usuarios'
type AuthPage = 'login' | 'registro'

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return mobile
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [dark, setDark] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [kiosko, setKiosko] = useState(false)
  const [authPage, setAuthPage] = useState<AuthPage>('login')
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const u = localStorage.getItem('usuario'); return u ? JSON.parse(u) : null
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const isMobile = useIsMobile()
  const { esAdmin, esConsulta, config: rolConfig } = useRol(usuario)

  function navigate(p: Page) {
    setPage(p)
    if (isMobile) setMobileOpen(false)
  }

  const NAV_ITEMS = [
    { id: 'dashboard'    as Page, label: 'Dashboard',    icon: '▦' ,  visible: true },
    { id: 'inventario'   as Page, label: 'Inventario',   icon: '📦',  visible: true },
    { id: 'alertas'      as Page, label: 'Alertas',      icon: '🔔',  visible: true },
    { id: 'proyecciones' as Page, label: 'Proyecciones', icon: '📈',  visible: !esConsulta },
    { id: 'xai'          as Page, label: 'IA Explicable', icon: '🧠',  visible: !esConsulta },
    { id: 'reportes'     as Page, label: 'Reportes',     icon: '📊',  visible: !esConsulta },
    { id: 'ventas'       as Page, label: 'Ventas',       icon: '🧾',  visible: !esConsulta },
    { id: 'scanner'      as Page, label: 'Escáner',      icon: '📷',  visible: !esConsulta },
    { id: 'proveedores'  as Page, label: 'Proveedores',  icon: '🏭',  visible: true },
    { id: 'validacion'   as Page, label: 'Validación',   icon: '🎯',  visible: !esConsulta },
    { id: 'usuarios'     as Page, label: 'Usuarios',     icon: '👥',  visible: esAdmin },
  ].filter(n => n.visible)

  const handleLogin = (t: string, u: any) => { setToken(t); setUsuario(u) }
  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('usuario')
    setToken(null); setUsuario(null); setAuthPage('login'); setKiosko(false)
  }

  if (!token) {
    return (
      <div className="font-sans">
        {authPage === 'login'
          ? <LoginPage onLogin={handleLogin} onGoRegister={() => setAuthPage('registro')} />
          : <RegisterPage onRegistered={() => setAuthPage('login')} onGoLogin={() => setAuthPage('login')} />}
      </div>
    )
  }

  if (kiosko) return <KioskoPage onSalirKiosko={() => setKiosko(false)} />

  const sidebarW = isMobile ? 240 : (collapsed ? 56 : 220)
  const sidebarVisible = isMobile ? mobileOpen : true

  const SidebarContent = () => (
    <>
      <div className={`flex items-center gap-2.5 px-4 py-[18px] min-h-16 border-b-[0.5px] border-border ${!isMobile && collapsed ? 'justify-center px-0' : ''}`}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-white text-base">📦</span>
        </div>
        {(isMobile || !collapsed) && (
          <div className="animate-[slideIn_0.2s_ease]">
            <div className="text-xs font-bold tracking-tight text-t1">InvSystem Pro</div>
            <div className="text-[10px] text-t3 mt-0.5">FastAPI · PostgreSQL</div>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto bg-transparent border-none text-lg text-t3 cursor-pointer px-2 py-1">✕</button>
        )}
      </div>

      <nav className="flex-1 p-2.5 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(n => {
          const active = page === n.id
          return (
            <button key={n.id} onClick={() => navigate(n.id)}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border-none cursor-pointer font-sans text-xs font-normal transition-colors duration-150 whitespace-nowrap overflow-hidden
                ${active ? 'bg-primary text-white font-medium' : 'bg-transparent text-t2 hover:bg-bg3 hover:text-t1'}`}
              title={!isMobile && collapsed ? n.label : undefined}>
              <span className="text-base shrink-0 w-[22px] text-center">{n.icon}</span>
              {(!isMobile && collapsed) ? null : <span className="overflow-hidden">{n.label}</span>}
            </button>
          )
        })}
      </nav>

      {!esConsulta && (
        <div className="p-2 border-t-[0.5px] border-border">
          <button onClick={() => setKiosko(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border-[0.5px] border-primary/25 cursor-pointer font-sans text-xs text-primary bg-transparent hover:bg-bg3">
            <span className="text-base shrink-0 w-[22px] text-center">🖥️</span>
            <span>Kiosko</span>
          </button>
        </div>
      )}

      <div className={`border-t-[0.5px] border-border flex flex-col gap-2 ${!isMobile && collapsed ? 'p-3 items-center' : 'p-3'}`}>
        {(isMobile || !collapsed) && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-bg2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: rolConfig.color }}>
              {usuario?.nombre?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate text-t1">{usuario?.nombre}</div>
              <div className="text-[10px] font-semibold" style={{ color: rolConfig.color }}>{rolConfig.badge} {rolConfig.label}</div>
            </div>
          </div>
        )}
        {!isMobile && collapsed && (
          <div className="w-8 h-8 rounded-full mx-auto flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: rolConfig.color }}>
            {usuario?.nombre?.charAt(0).toUpperCase() || 'U'}
          </div>
        )}

        <div className={`flex gap-1.5 ${!isMobile && collapsed ? 'flex-col items-center' : ''}`}>
          {!isMobile && (
            <button onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expandir' : 'Colapsar'}
              className={`text-xs py-1.5 px-2 rounded-lg border-[0.5px] border-border bg-bg2 text-t2 cursor-pointer font-sans ${collapsed ? '' : 'flex-1'}`}>
              {collapsed ? '→' : '←'}
            </button>
          )}
          {(isMobile || !collapsed) && (
            <>
              <button onClick={() => setDark(d => !d)}
                className="flex-1 text-xs py-1.5 rounded-lg border-[0.5px] border-border bg-bg2 text-t2 cursor-pointer font-sans">
                {dark ? '☀️' : '🌙'}
              </button>
              <button onClick={handleLogout}
                className="flex-1 text-[11px] py-1.5 rounded-lg border-[0.5px] border-[#D85A3040] bg-transparent text-[#D85A30] cursor-pointer font-sans font-medium">
                Salir
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex font-sans">
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 bg-black/45 z-[90] animate-[fadeIn_0.2s_ease]" onClick={() => setMobileOpen(false)} />
      )}

      {!isMobile && (
        <div className="sidebar sticky top-0 h-screen shrink-0 overflow-hidden bg-bg1 border-r-[0.5px] border-border flex flex-col transition-[width] duration-250 ease-in-out" style={{ width: sidebarW }}>
          <SidebarContent />
        </div>
      )}

      {isMobile && (
        <div className="fixed top-0 left-0 h-screen z-100 bg-bg1 border-r-[0.5px] border-border flex flex-col overflow-hidden shadow-lg transition-[left] duration-250"
          style={{ width: 240, left: mobileOpen ? 0 : -260 }}>
          <SidebarContent />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="sticky top-0 z-40 h-12 bg-bg1 border-b-[0.5px] border-border flex items-center gap-2.5 px-4">
          {isMobile && (
            <button onClick={() => setMobileOpen(o => !o)} className="bg-transparent border-none text-xl cursor-pointer text-t1 p-1 rounded-md shrink-0">☰</button>
          )}
          <div className="text-xs font-semibold flex-1 truncate text-t1">
            {NAV_ITEMS.find(n => n.id === page)?.icon}{' '}
            {NAV_ITEMS.find(n => n.id === page)?.label}
          </div>
          <div className="flex gap-2 items-center shrink-0">
            {esConsulta && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-semibold text-[10px] whitespace-nowrap">👁 Solo lectura</span>
            )}
            {!isMobile && (
              <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer"
                className="text-primary no-underline font-medium text-[11px]">API Docs ↗</a>
            )}
          </div>
        </div>

        <div className={`flex-1 ${isMobile ? 'p-4' : 'p-6'} max-w-[1200px] w-full mx-auto`}>
          {page === 'dashboard'    && <DashboardPage />}
          {page === 'inventario'   && <InventarioPage usuario={usuario} />}
          {page === 'alertas'      && <AlertasPage />}
          {page === 'proyecciones' && <ProyeccionesPage />}
          {page === 'xai'          && <XAIPage />}
          {page === 'reportes'     && <ReportesPage />}
          {page === 'scanner'      && <ScannerPage />}
          {page === 'proveedores'  && <ProveedoresPage usuario={usuario} />}
          {page === 'ventas'       && <VentasPage usuario={usuario} />}
          {page === 'validacion'   && <ValidacionPage />}
          {page === 'usuarios'     && <UsuariosPage usuario={usuario} />}
        </div>
      </div>
    </div>
  )
}
