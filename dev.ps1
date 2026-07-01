param([switch]$NoDeps)

$root = Split-Path $MyInvocation.MyCommand.Path
$be = Join-Path $root "backend"
$fe = Join-Path $root "frontend"

$g = "Green"; $y = "Yellow"; $r = "Red"
Write-Host "============================================" -ForegroundColor $g
Write-Host "   InvSystem Pro - Dev Mode" -ForegroundColor $g
Write-Host "============================================" -ForegroundColor $g

# 1. Prerrequisitos
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "`n[X] Python no instalado" -ForegroundColor $r; exit 1 }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "`n[X] Node.js no instalado" -ForegroundColor $r; exit 1 }

# 2. Instalar dependencias
if (-not $NoDeps) {
    if (-not (Test-Path "$be\venv")) {
        Write-Host "`n[~] Creando entorno virtual backend..." -ForegroundColor $y
        Push-Location $be
        python -m venv venv
        Write-Host "[~] Instalando dependencias backend..." -ForegroundColor $y
        .\venv\Scripts\pip install -r requirements.txt | Out-Null
        Pop-Location
        Write-Host "[v] Backend listo" -ForegroundColor $g
    }
    if (-not (Test-Path "$fe\node_modules")) {
        Write-Host "[~] Instalando dependencias frontend..." -ForegroundColor $y
        Push-Location $fe; npm install | Out-Null; Pop-Location
        Write-Host "[v] Frontend listo" -ForegroundColor $g
    }
} else {
    Write-Host "[i] Saltando instalacion de dependencias (-NoDeps)" -ForegroundColor $y
}

# 3. Levantar servicios
Write-Host "`n============================================" -ForegroundColor $g
Write-Host "   Iniciando servicios..." -ForegroundColor $g
Write-Host "============================================" -ForegroundColor $g
Write-Host "   Backend   -> http://localhost:8000/docs" -ForegroundColor $g
Write-Host "   Frontend  -> http://localhost:5173" -ForegroundColor $g
Write-Host "============================================" -ForegroundColor $g
Write-Host "   [i] Cierra cada terminal para detener" -ForegroundColor $y
Write-Host "`n"

$beProc = Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Write-Host '[Backend] Iniciando FastAPI...' -ForegroundColor Green; cd '$be'; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
) -PassThru

$feProc = Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "Write-Host '[Frontend] Iniciando Vite...' -ForegroundColor Cyan; cd '$fe'; npm run dev"
) -PassThru

Register-EngineEvent PowerShell.Exiting -Action {
    Stop-Process $beProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process $feProc.Id -Force -ErrorAction SilentlyContinue
} | Out-Null

$beProc.Handle | Out-Null; $feProc.Handle | Out-Null
