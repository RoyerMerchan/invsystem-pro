import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Package, Bell, TrendingUp, Sparkles, BarChart3,
  Receipt, ScanLine, Truck, ShieldCheck, Users, Monitor, LogOut,
  Sun, Moon, Menu, ExternalLink, X, Upload, Database,
} from 'lucide-react'
import DashboardPage from './pages/DashboardPage'
import InventarioPage from './pages/InventarioPage'
import AlertasPage from './pages/AlertasPage'
import ProyeccionesPage from './pages/ProyeccionesPage'
import ReportesPage from './pages/ReportesPage'
import ScannerPage from './pages/ScannerPage'
import KioskoPage from './pages/KioskoPage'
import ProveedoresPage from './pages/ProveedoresPage'
import UsuariosPage from './pages/UsuariosPage'
import CatalogosPage from './pages/CatalogosPage'
import VentasPage from './pages/VentasPage'
import ValidacionPage from './pages/ValidacionPage'
import XAIPage from './pages/XAIPage'
import ImportarPage from './pages/ImportarPage'
import LoginPage, { RegisterPage } from './pages/LoginPage'
import { useRol } from './hooks/useRol'
import type { Usuario } from './types'

type Page = 'dashboard' | 'inventario' | 'alertas' | 'proyecciones' | 'xai' | 'reportes' | 'scanner' | 'proveedores' | 'ventas' | 'validacion' | 'usuarios' | 'importar' | 'catalogos'
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

const NAV_ICONS: Record<Page, React.ElementType> = {
  dashboard: LayoutDashboard, inventario: Package, alertas: Bell,
  proyecciones: TrendingUp, xai: Sparkles, reportes: BarChart3,
  ventas: Receipt, scanner: ScanLine, proveedores: Truck,
  validacion: ShieldCheck, usuarios: Users, importar: Upload,
  catalogos: Database,
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
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') setDark(true)
    else if (saved === 'light') setDark(false)
    else setDark(window.matchMedia('(prefers-color-scheme: dark)').matches)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  const isMobile = useIsMobile()
  const { esAdmin, esConsulta, config: rolConfig } = useRol(usuario)

  function navigate(p: Page) {
    setPage(p)
    if (isMobile) setMobileOpen(false)
  }

  const NAV_ITEMS = [
    { id: 'dashboard'    as Page, label: 'Dashboard',    visible: true },
    { id: 'inventario'   as Page, label: 'Inventario',   visible: true },
    { id: 'alertas'      as Page, label: 'Alertas',      visible: true },
    { id: 'proyecciones' as Page, label: 'Proyecciones', visible: !esConsulta },
    { id: 'xai'          as Page, label: 'IA Explicable', visible: !esConsulta },
    { id: 'reportes'     as Page, label: 'Reportes',     visible: !esConsulta },
    { id: 'ventas'       as Page, label: 'Ventas',       visible: !esConsulta },
    { id: 'scanner'      as Page, label: 'Escáner',      visible: !esConsulta },
    { id: 'proveedores'  as Page, label: 'Proveedores',  visible: true },
    { id: 'validacion'   as Page, label: 'Validación',   visible: !esConsulta },
    { id: 'importar'     as Page, label: 'Importar',     visible: !esConsulta },
    { id: 'catalogos'    as Page, label: 'Datos maestros', visible: esAdmin },
    { id: 'usuarios'     as Page, label: 'Usuarios',     visible: esAdmin },
  ].filter(n => n.visible)

  const handleLogin = (t: string, u: any) => { setToken(t); setUsuario(u) }
  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('usuario')
    setToken(null); setUsuario(null); setAuthPage('login'); setKiosko(false)
  }

  // Abre la documentación interactiva de la API (Swagger UI) en una pestaña nueva.
  // Usa VITE_API_URL si está configurada; si no, asume el backend en el mismo host, puerto 8000.
  const openApiDocs = () => {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
    const url = base
      ? `${base}/docs`
      : `${window.location.protocol}//${window.location.hostname}:8000/docs`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!token) {
    return (
      <div>
        {authPage === 'login'
          ? <LoginPage onLogin={handleLogin} onGoRegister={() => setAuthPage('registro')} />
          : <RegisterPage onRegistered={() => setAuthPage('login')} onGoLogin={() => setAuthPage('login')} />}
      </div>
    )
  }

  if (kiosko) return <KioskoPage onSalirKiosko={() => setKiosko(false)} />

  const sidebarW = isMobile ? 240 : (collapsed ? 60 : 240)

  const SidebarContent = () => (
    <>
      <div className={`flex items-center gap-3 px-4 py-5 min-h-16 border-b border-border ${!isMobile && collapsed ? 'justify-center px-0' : ''}`}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Package className="w-4 h-4 text-white" />
        </div>
        {(isMobile || !collapsed) && (
          <div className="animate-[slideIn_0.2s_ease]">
            <div className="text-sm font-bold text-t1 tracking-tight">InvSystem Pro</div>
            <div className="text-[10px] text-t3">Enterprise Inventory</div>
          </div>
        )}
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="ml-auto bg-transparent border-none text-lg text-t3 cursor-pointer p-1" aria-label="Cerrar menú">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map(n => {
          const Icon = NAV_ICONS[n.id]
          const active = page === n.id
          return (
            <button key={n.id} onClick={() => navigate(n.id)}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border-none cursor-pointer font-sans text-sm transition-all duration-150
                ${active
                  ? 'bg-primary-subtle text-primary font-medium'
                  : 'text-muted hover:bg-bg2 hover:text-t1'
                }`}
              aria-label={n.label}
              title={!isMobile && collapsed ? n.label : undefined}>
              <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-primary' : ''}`} />
              {(!isMobile && collapsed) ? null : <span>{n.label}</span>}
            </button>
          )
        })}
      </nav>

      {!esConsulta && (
        <div className="px-3 pb-2">
          <button onClick={() => setKiosko(true)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border border-border/50 cursor-pointer font-sans text-sm text-muted bg-transparent hover:bg-bg2 hover:text-t1 transition-all duration-150">
            <Monitor className="w-[18px] h-[18px] shrink-0" />
            <span>Kiosko</span>
          </button>
        </div>
      )}

      <div className="border-t border-border flex flex-col gap-2 p-3">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: rolConfig.color }}>
            {usuario?.nombre?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-t1 truncate">{usuario?.nombre}</div>
            <div className="text-[10px] font-medium" style={{ color: rolConfig.color }}>{rolConfig.badge} {rolConfig.label}</div>
          </div>
          <button onClick={handleLogout}
            className="text-muted hover:text-danger transition-colors duration-150 p-1 rounded-md hover:bg-danger/10"
            aria-label="Cerrar sesión">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex font-sans bg-bg3 text-t1">
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 bg-black/45 z-[90] animate-[fadeIn_0.2s_ease]" onClick={() => setMobileOpen(false)} />
      )}

      {!isMobile && (
        <div className="sticky top-0 h-screen shrink-0 overflow-hidden bg-surface border-r border-border flex flex-col transition-[width] duration-250 ease-in-out z-30" style={{ width: sidebarW }}>
          <SidebarContent />
        </div>
      )}

      {isMobile && (
        <div className={`fixed top-0 left-0 h-screen z-[100] bg-surface border-r border-border flex flex-col overflow-hidden shadow-lg transition-transform duration-250 sidebar-mobile ${mobileOpen ? 'translate-x-0' : '-translate-x-[260px]'}`}
          style={{ width: 240 }}>
          <SidebarContent />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 bg-surface border-b border-border flex items-center gap-3 px-5">
          {isMobile && (
            <button onClick={() => setMobileOpen(o => !o)} className="bg-transparent border-none cursor-pointer text-t1 p-1.5 rounded-md hover:bg-bg2 transition-colors" aria-label="Abrir menú">
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="text-sm font-semibold text-t1 flex items-center gap-2">
            {(() => {
              const Icon = NAV_ICONS[page]
              return Icon ? <Icon className="w-4 h-4" /> : null
            })()}
            {NAV_ITEMS.find(n => n.id === page)?.label}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setDark(d => !d)}
              className="p-2 rounded-lg text-muted hover:text-t1 hover:bg-bg2 transition-colors cursor-pointer border-none"
              aria-label={dark ? 'Modo claro' : 'Modo oscuro'}
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {esConsulta && (
              <span className="text-[10px] font-semibold text-warning bg-warning-subtle px-2 py-1 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Solo lectura
              </span>
            )}
            <button onClick={openApiDocs} type="button"
              title="Abrir la documentación interactiva de la API (Swagger UI)"
              className="text-xs text-muted hover:text-primary bg-transparent border-none cursor-pointer flex items-center gap-1 transition-colors">
              API Docs <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </header>

        <main className={`flex-1 ${isMobile ? 'p-4' : 'p-6'} max-w-[1280px] w-full mx-auto`}>
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
          {page === 'importar'     && <ImportarPage />}
          {page === 'catalogos'    && <CatalogosPage usuario={usuario} />}
          {page === 'usuarios'     && <UsuariosPage usuario={usuario} />}
        </main>
      </div>
    </div>
  )
}
