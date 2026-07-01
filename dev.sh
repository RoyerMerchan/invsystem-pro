#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
BE="$ROOT/backend"
FE="$ROOT/frontend"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${GREEN}============================================"
echo "   InvSystem Pro - Dev Mode"
echo -e "============================================${NC}"

# 1. Prerrequisitos
command -v python3 >/dev/null 2>&1 || { echo -e "${RED}[X] Python3 no instalado${NC}"; exit 1; }
command -v node >/dev/null 2>&1 || { echo -e "${RED}[X] Node.js no instalado${NC}"; exit 1; }

# 2. Dependencias
NODEPS="${NODEPS:-false}"
if [ "$NODEPS" != "true" ]; then
    if [ ! -d "$BE/venv" ]; then
        echo -e "${YELLOW}[~] Creando entorno virtual backend...${NC}"
        cd "$BE"
        python3 -m venv venv
        echo -e "${YELLOW}[~] Instalando dependencias backend...${NC}"
        source venv/bin/activate
        pip install -r requirements.txt -q
        cd "$ROOT"
        echo -e "${GREEN}[v] Backend listo${NC}"
    fi
    if [ ! -d "$FE/node_modules" ]; then
        echo -e "${YELLOW}[~] Instalando dependencias frontend...${NC}"
        cd "$FE"; npm install --silent; cd "$ROOT"
        echo -e "${GREEN}[v] Frontend listo${NC}"
    fi
else
    echo -e "${YELLOW}[i] Saltando instalacion (NODEPS=true)${NC}"
fi

# 3. Trap cleanup
cleanup() {
    echo -e "\n${YELLOW}[~] Deteniendo servicios...${NC}"
    kill $BE_PID $FE_PID 2>/dev/null || true
    wait $BE_PID $FE_PID 2>/dev/null || true
    echo -e "${GREEN}[v] Detenido${NC}"
    exit 0
}
trap cleanup SIGINT SIGTERM

# 4. Iniciar servicios
echo -e "\n${GREEN}============================================"
echo "   Iniciando servicios..."
echo -e "============================================${NC}"
echo -e "${GREEN}   Backend   -> http://localhost:8000/docs${NC}"
echo -e "${CYAN}   Frontend  -> http://localhost:5173${NC}"
echo -e "${YELLOW}   [i] Ctrl+C para detener ambos${NC}"
echo ""

cd "$BE"
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BE_PID=$!

cd "$FE"
npm run dev &
FE_PID=$!

cd "$ROOT"
wait
