import { useState } from 'react'
import { Eye, EyeOff, Mail, Lock, User, BarChart3, Wrench, Brain, Camera, Bell, Monitor, ShieldAlert } from 'lucide-react'

const BASE = import.meta.env.VITE_API_URL || ''

// ── Types ─────────────────────────────────────────────────────────
interface LoginProps  { onLogin: (token: string, usuario: any) => void; onGoRegister: () => void }
interface RegProps    { onRegistered: () => void; onGoLogin: () => void }

// ── Login Page ────────────────────────────────────────────────────
export default function LoginPage({ onLogin, onGoRegister }: LoginProps) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const submit = async () => {
    if (!email || !password) { setError('Completa todos los campos'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${BASE}/api/v1/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Credenciales incorrectas')
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('usuario', JSON.stringify(data.usuario))
      onLogin(data.access_token, data.usuario)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <Shell>
      <LeftPanel />
      <RightPanel>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <LogoMark size={40} />
          <div>
            <div className="text-base font-bold text-t1 tracking-[-0.3px]">InvSystem Pro</div>
            <div className="text-[11px] text-t3 tracking-[0.02em]">Enterprise Inventory</div>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-[28px] font-extrabold text-t1 tracking-[-0.7px] leading-[1.2] mb-2">
            Bienvenido
          </h1>
          <p className="text-sm text-t2 leading-[1.6]">
            Accede a tu plataforma de gestión de inventario
          </p>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4">
          <InputGroup label="Correo corporativo">
            <InputField
              type="email" value={email} placeholder="nombre@empresa.com"
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()} autoFocus
              icon={<Mail className="w-4 h-4" />}
            />
          </InputGroup>

          <InputGroup label="Contraseña">
            <div className="relative">
              <InputField
                type={showPass ? 'text' : 'password'} value={password}
                placeholder="••••••••••••"
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                icon={<Lock className="w-4 h-4" />}
                paddingRight={44}
              />
              <button type="button" onClick={() => setShowPass(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-t3 flex items-center">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </InputGroup>

          {error && <ErrorAlert msg={error} />}

          <PrimaryBtn onClick={submit} loading={loading}>
            Iniciar sesión
          </PrimaryBtn>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-bg2" />
          <span className="text-xs text-t3 font-medium">¿Primera vez?</span>
          <div className="flex-1 h-px bg-bg2" />
        </div>

        <SecondaryBtn onClick={onGoRegister}>
          Crear cuenta nueva →
        </SecondaryBtn>

        {/* Footer */}
        <p className="mt-8 text-[11px] text-t3 text-center leading-[1.6]">
          Al continuar aceptas los{' '}
          <span className="text-primary cursor-pointer">Términos de uso</span>
          {' '}y la{' '}
          <span className="text-primary cursor-pointer">Política de privacidad</span>
        </p>
      </RightPanel>
    </Shell>
  )
}

// ── Register Page ─────────────────────────────────────────────────
export function RegisterPage({ onRegistered, onGoLogin }: RegProps) {
  const [step, setStep]         = useState<1 | 2>(1)
  const [nombre, setNombre]     = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [rol, setRol]           = useState<'analista' | 'operador' | 'consulta'>('analista')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  const checks = [
    { ok: password.length >= 8,      label: '8+ caracteres' },
    { ok: /[A-Za-z]/.test(password), label: 'Letras'        },
    { ok: /\d/.test(password),       label: 'Número'        },
  ]
  const score = checks.filter(c => c.ok).length

  const nextStep = () => {
    if (!nombre.trim()) { setError('Ingresa tu nombre'); return }
    if (!email.trim())  { setError('Ingresa tu correo'); return }
    setError(''); setStep(2)
  }

  const submit = async () => {
    if (!password)          { setError('Ingresa una contraseña'); return }
    if (score < 2)          { setError('La contraseña es muy débil'); return }
    if (password !== confirm){ setError('Las contraseñas no coinciden'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${BASE}/api/v1/auth/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password, rol }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = typeof data.detail === 'string' ? data.detail
          : Array.isArray(data.detail) ? data.detail.map((e:any) => e.msg).join(', ')
          : 'Error al registrarse'
        throw new Error(msg)
      }
      setDone(true)
      setTimeout(onRegistered, 3000)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  if (done) return (
    <Shell>
      <LeftPanel />
      <RightPanel>
        <div className="text-center py-10" style={{ animation: 'fadeSlide .5s ease' }}>
          <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-[32px] mx-auto mb-5"
            style={{ background: 'linear-gradient(135deg,#14B8A6,#0D9488)', boxShadow: '0 8px 24px rgba(20,184,166,0.35)' }}>
            ✓
          </div>
          <h2 className="text-2xl font-extrabold text-t1 tracking-[-0.5px] mb-2">¡Cuenta creada!</h2>
          <p className="text-sm text-t2 mb-7">Tu acceso ha sido configurado correctamente</p>
          <div className="h-[3px] bg-bg2 rounded overflow-hidden">
            <div className="h-full rounded" style={{ background: 'linear-gradient(90deg,#14B8A6,#0D9488)', animation: 'progress 3s linear forwards' }} />
          </div>
          <p className="text-xs text-t3 mt-2.5">Redirigiendo al inicio de sesión...</p>
        </div>
      </RightPanel>
    </Shell>
  )

  return (
    <Shell>
      <LeftPanel />
      <RightPanel>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-9">
          <LogoMark size={40} />
          <div>
            <div className="text-base font-bold text-t1 tracking-[-0.3px]">InvSystem Pro</div>
            <div className="text-[11px] text-t3">Enterprise Inventory</div>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-7">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200"
                style={{
                  background: s <= step ? 'linear-gradient(135deg,#14B8A6,#0D9488)' : '#F3F4F6',
                  color: s <= step ? 'white' : 'var(--t2)',
                  boxShadow: s === step ? '0 4px 12px rgba(20,184,166,0.35)' : 'none',
                }}>
                {s < step ? '✓' : s}
              </div>
              <span className="text-xs font-semibold" style={{ color: s <= step ? 'var(--t1)' : 'var(--text-muted)' }}>
                {s === 1 ? 'Información' : 'Seguridad'}
              </span>
              {s < 2 && <div className="w-8 h-0.5 rounded mx-1 transition-[background] duration-300"
                style={{ background: step > s ? 'var(--primary)' : '#F3F4F6' }} />}
            </div>
          ))}
        </div>

        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-t1 tracking-[-0.5px] mb-1.5">
            {step === 1 ? 'Datos de cuenta' : 'Acceso y permisos'}
          </h1>
          <p className="text-[13px] text-t2">
            {step === 1 ? 'Completa tu información básica' : 'Configura tu contraseña y rol'}
          </p>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="flex flex-col gap-3.5" style={{ animation: 'fadeSlide .3s ease' }}>
            <InputGroup label="Nombre completo">
              <InputField type="text" value={nombre} placeholder="Juan García"
                onChange={e => setNombre(e.target.value)} autoFocus icon={<User className="w-4 h-4" />} />
            </InputGroup>
            <InputGroup label="Correo corporativo">
              <InputField type="email" value={email} placeholder="juan@empresa.com"
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && nextStep()} icon={<Mail className="w-4 h-4" />} />
            </InputGroup>

            {/* Rol */}
            <InputGroup label="Tipo de acceso">
              <div className="grid grid-cols-2 gap-2.5">
                {([
                  { v:'analista' as const, icon:<BarChart3 className="w-4 h-4" />, label:'Analista',          desc:'Movimientos, proyecciones y reportes'       },
                  { v:'operador' as const, icon:<Wrench className="w-4 h-4" />,     label:'Operador',          desc:'Solo movimientos y escáner'                },
                  { v:'consulta' as const, icon:<Eye className="w-4 h-4" />,        label:'Consulta',          desc:'Solo visualización del inventario'         },
                ]).map(opt => (
                  <button key={opt.v} type="button" onClick={() => setRol(opt.v)}
                    className="px-3 py-3.5 rounded-xl cursor-pointer text-left transition-all duration-200"
                    style={{
                      border: `2px solid ${rol===opt.v ? 'var(--primary)' : 'var(--border)'}`,
                      background: rol===opt.v ? 'rgba(20,184,166,0.05)' : 'white',
                    }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-[7px]">
                        {opt.icon}
                        <span className="text-[13px] font-bold" style={{ color: rol===opt.v ? 'var(--primary-hover)' : 'var(--t2)' }}>{opt.label}</span>
                      </div>
                      <div className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
                        style={{
                          border: `2px solid ${rol===opt.v ? 'var(--primary)' : 'var(--border)'}`,
                          background: rol===opt.v ? 'var(--primary)' : 'transparent',
                        }}>
                        {rol===opt.v && <div className="w-[6px] h-[6px] rounded-full bg-white" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-t3 leading-[1.4] m-0">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </InputGroup>

            {error && <ErrorAlert msg={error} />}
            <PrimaryBtn onClick={nextStep} loading={false}>Continuar →</PrimaryBtn>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="flex flex-col gap-3.5" style={{ animation: 'fadeSlide .3s ease' }}>
            <InputGroup label="Contraseña">
              <div className="relative">
                <InputField type={showPass ? 'text' : 'password'} value={password}
                  placeholder="Mínimo 8 caracteres" icon={<Lock className="w-4 h-4" />} paddingRight={44}
                  onChange={e => setPassword(e.target.value)} autoFocus />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-t3 flex items-center">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Strength */}
              {password.length > 0 && (
                <div className="mt-2.5">
                  <div className="flex gap-1 mb-[7px]">
                    {[1,2,3].map(i => {
                      const c = i <= score ? (score===1?'#EF4444':score===2?'var(--warning)':'var(--success)') : 'var(--border)'
                      return <div key={i} className="flex-1 h-1 rounded transition-[background] duration-300" style={{ background: c }} />
                    })}
                  </div>
                  <div className="flex gap-3.5">
                    {checks.map(c => (
                      <span key={c.label} className="text-[11px] flex items-center gap-1 transition-[color] duration-200"
                        style={{ color: c.ok ? 'var(--success)' : 'var(--t2)' }}>
                        <span className="text-[9px]">{c.ok?'●':'○'}</span>{c.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </InputGroup>

            <InputGroup label="Confirmar contraseña">
              <InputField type="password" value={confirm} placeholder="Repite la contraseña"
                icon={<Lock className="w-4 h-4" />}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()} />
              {confirm && password !== confirm && (
                <p className="text-[11px] text-danger mt-[5px] flex items-center gap-1">
                  <ShieldAlert className="w-4 h-4" /> Las contraseñas no coinciden
                </p>
              )}
            </InputGroup>

            {/* Resumen del rol seleccionado */}
            <div className="flex items-center gap-2.5 px-3.5 py-3 bg-bg2 rounded-xl border border-border">
              <span className="flex items-center">
                {rol === 'analista' ? <BarChart3 className="w-5 h-5" /> : rol === 'operador' ? <Wrench className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </span>
              <div>
                <div className="text-xs font-semibold text-t2">
                  {rol === 'analista' ? 'Analista' : rol === 'operador' ? 'Operador' : 'Solo consulta'}
                </div>
                <div className="text-[11px] text-t3">
                  {rol === 'analista' ? 'Movimientos, proyecciones y reportes' : rol === 'operador' ? 'Solo movimientos y escáner' : 'Solo visualización'}
                </div>
              </div>
              <button onClick={() => setStep(1)}
                className="ml-auto text-[11px] text-primary bg-transparent border-none cursor-pointer font-semibold">
                Cambiar
              </button>
            </div>

            {error && <ErrorAlert msg={error} />}

            <div className="grid grid-cols-[auto_1fr] gap-2.5">
              <button onClick={() => { setStep(1); setError('') }}
                className="px-4 py-[11px] rounded-xl border-2 border-border bg-white text-t2 text-[13px] font-semibold cursor-pointer">
                ← Volver
              </button>
              <PrimaryBtn onClick={submit} loading={loading}>
                {loading ? 'Creando cuenta...' : 'Crear cuenta'}
              </PrimaryBtn>
            </div>
          </div>
        )}

        <div className="mt-6 text-center text-[13px] text-t3">
          ¿Ya tienes cuenta?{' '}
          <button onClick={onGoLogin}
            className="text-primary font-bold bg-transparent border-none cursor-pointer text-[13px]">
            Iniciar sesión
          </button>
        </div>
      </RightPanel>
    </Shell>
  )
}

// ── Layout components ─────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex font-sans">
      <style>{`
@keyframes fadeSlide{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes progress{from{width:0}to{width:100%}}
@keyframes float{0%,100%{opacity:1}50%{opacity:.5}}
`}</style>
      {children}
    </div>
  )
}

function LeftPanel() {
  return (
    <div className="hidden lg:flex lg:flex-col lg:justify-center lg:p-16 flex-1 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg,#0F172A 0%,#1E293B 50%,#0F2A2A 100%)' }}>
      {/* Background pattern */}
      <svg className="absolute inset-0 opacity-[0.04]" width="100%" height="100%">
        <defs>
          <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Accent blobs */}
      <div className="absolute -top-[15%] -right-[10%] w-[500px] h-[500px] rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(20,184,166,0.18) 0%,transparent 70%)' }} />
      <div className="absolute -bottom-[10%] -left-[5%] w-[400px] h-[400px] rounded-full"
        style={{ background: 'radial-gradient(circle,rgba(14,148,136,0.12) 0%,transparent 70%)' }} />

      <div className="relative z-10">
        {/* Logo area */}
        <div className="flex items-center gap-3.5 mb-14">
          <LogoMark size={48} />
          <div>
            <div className="text-xl font-extrabold text-white tracking-[-0.4px]">InvSystem Pro</div>
            <div className="text-xs text-white/40 tracking-[0.06em] uppercase mt-0.5">Enterprise Edition</div>
          </div>
        </div>

        <h2 className="text-[38px] font-extrabold text-white tracking-[-1px] leading-[1.15] mb-[18px]">
          Control total de tu{' '}
          <span className="text-primary">inventario</span>
        </h2>

        <p className="text-[15px] text-white/50 leading-[1.7] mb-12 max-w-[380px]">
          Proyecciones con IA, alertas automáticas, escáner QR y reportes ejecutivos en una sola plataforma.
        </p>

        {/* Feature list */}
        <div className="flex flex-col gap-3 mb-12">
          {[
            { icon:<Brain className="w-4 h-4" />,      text:'IA Predictiva con Holt-Winters, ARIMA y Prophet' },
            { icon:<BarChart3 className="w-4 h-4" />,  text:'Reportes exportables en Excel y PDF' },
            { icon:<Camera className="w-4 h-4" />,     text:'Escáner QR para movimientos rápidos' },
            { icon:<Bell className="w-4 h-4" />,       text:'Alertas de stock en tiempo real' },
            { icon:<Monitor className="w-4 h-4" />,    text:'Modo kiosko para almacén' },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3.5 px-4 py-[13px] rounded-xl backdrop-blur"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="w-9 h-9 rounded-[9px] flex items-center justify-center text-base shrink-0"
                style={{ background: 'rgba(45,212,191,0.15)' }}>
                {f.icon}
              </div>
              <span className="text-[13px] text-white/75 font-medium">{f.text}</span>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 pt-6"
          style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {[['8+','Módulos'],['3','Modelos IA'],['JWT','Seguridad']].map(([v,l]) => (
            <div key={l}>
              <div className="text-[26px] font-extrabold text-primary tracking-[-0.5px]">{v}</div>
              <div className="text-[11px] text-white/35 mt-[3px] uppercase tracking-[0.06em]">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RightPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[520px] flex flex-col justify-center px-10 py-12 bg-bg1 overflow-y-auto"
      style={{ animation: 'fadeSlide 0.4s cubic-bezier(.16,1,.3,1)' }}>
      <div className="max-w-[400px] w-full mx-auto">
        <div className="bg-white rounded-[20px] px-9 py-10 border border-border"
          style={{ boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05), 0 20px 60px -12px rgba(0,0,0,0.08)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── UI Primitives ─────────────────────────────────────────────────
function LogoMark({ size }: { size: number }) {
  return (
    <div className="flex items-center justify-center shrink-0"
      style={{
        width: size, height: size, borderRadius: size/4,
        background: 'linear-gradient(135deg,#14B8A6 0%,#0D9488 100%)',
        boxShadow: '0 4px 14px rgba(20,184,166,0.4)',
      }}>
      <svg width={size*.52} height={size*.52} viewBox="0 0 24 24" fill="none">
        <path d="M3 6h18M3 12h18M3 18h18" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="6" y="3" width="4" height="4" rx="1" fill="white" opacity=".8" />
        <rect x="14" y="9" width="4" height="4" rx="1" fill="white" opacity=".8" />
        <rect x="8" y="15" width="4" height="4" rx="1" fill="white" opacity=".8" />
      </svg>
    </div>
  )
}

function InputGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-t2 tracking-[0.01em] mb-[7px]">
        {label}
      </label>
      {children}
    </div>
  )
}

function InputField({ icon, paddingRight, style: extStyle, ...props }: {
  icon?: React.ReactNode; paddingRight?: number; style?: React.CSSProperties
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [focus, setFocus] = useState(false)
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-[13px] top-1/2 -translate-y-1/2 pointer-events-none transition-[color] duration-200"
          style={{ color: focus ? 'var(--primary)' : 'var(--text-muted)' }}>
          {icon}
        </div>
      )}
      <input
        {...props}
        onFocus={e => { setFocus(true); props.onFocus?.(e) }}
        onBlur={e  => { setFocus(false); props.onBlur?.(e) }}
        className="w-full text-sm rounded-[10px] transition-all duration-200"
        style={{
          padding: '11px 14px', paddingLeft: icon ? 40 : 14, paddingRight: paddingRight ?? 14,
          border: `1.5px solid ${focus ? 'var(--primary)' : 'var(--border)'}`,
          background: focus ? '#FFFFFF' : '#FAFAFA',
          color: 'var(--t1)',
          boxShadow: focus ? '0 0 0 3px rgba(20,184,166,0.12)' : 'none',
          ...extStyle,
        }}
      />
    </div>
  )
}

function PrimaryBtn({ onClick, loading, children }: { onClick: () => void; loading: boolean; children: React.ReactNode }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} disabled={loading}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="w-full rounded-[11px] border-none text-white text-sm font-bold flex items-center justify-center gap-2 transition-all duration-200"
      style={{
        padding: '12px 20px',
        background: loading ? 'var(--t3)' : hov ? 'var(--primary-hover)' : 'var(--primary)',
        cursor: loading ? 'not-allowed' : 'pointer',
        boxShadow: loading ? 'none' : `0 4px 14px rgba(20,184,166,${hov ? .5 : .35})`,
        transform: hov && !loading ? 'translateY(-1px)' : 'none',
      }}>
      {loading && <span className="w-4 h-4 rounded-full inline-block" style={{ border: '2px solid rgba(255,255,255,.35)', borderTopColor: 'white', animation: 'spin .7s linear infinite' }} />}
      {children}
    </button>
  )
}

function SecondaryBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="w-full rounded-[11px] text-sm font-semibold cursor-pointer transition-all duration-200"
      style={{
        padding: '11px 20px',
        border: `2px solid ${hov ? 'var(--primary)' : 'var(--border)'}`,
        background: hov ? 'rgba(20,184,166,0.04)' : 'white',
        color: hov ? 'var(--primary-hover)' : 'var(--t2)',
      }}>
      {children}
    </button>
  )
}

function ErrorAlert({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-[11px] bg-danger-subtle border border-danger/30 rounded-[10px] text-[13px] text-danger">
      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="leading-[1.5]">{msg}</span>
    </div>
  )
}
