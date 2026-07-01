# InvSystem Pro 📦

Sistema de inventario con módulo de **proyecciones de demanda por series de tiempo**.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Contenedores | Docker + Docker Compose |
| Backend API | FastAPI (Python 3.11) |
| Base de datos | PostgreSQL 16 |
| Cache | Redis 7 |
| Series de tiempo | statsmodels (ARIMA, Holt-Winters), Prophet |
| Frontend | React 18 + TypeScript + Vite |
| Gráficas | Recharts |
| Reverse proxy | Nginx |
| Migraciones | Alembic |
| Tests | pytest + pytest-asyncio |

---

## Arquitectura

```
┌─────────────────────────────────────────┐
│               Nginx :80                 │  ← reverse proxy
│    /api/*  →  FastAPI :8000             │
│    /*      →  Vite/React :5173          │
└─────────────────────────────────────────┘
         │                    │
┌────────▼────────┐  ┌────────▼────────┐
│   FastAPI API   │  │  React Frontend │
│   (backend)     │  │   (frontend)    │
└────────┬────────┘  └─────────────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼───┐
│  PG   │ │Redis │
│  :5432│ │:6379 │
└───────┘ └──────┘
```

---

## Inicio rápido

### 1. Clonar y configurar entorno

```bash
git clone <repo>
cd inventario-system

cp .env.example .env
# Edita .env con tus credenciales
```

### 2. Levantar con Docker

```bash
make up
```

O directamente:

```bash
docker compose up -d --build
```

### 3. Acceder

| Servicio | URL |
|----------|-----|
| Frontend (React) | http://localhost:5173 |
| API (FastAPI) | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |
| Proxy unificado | http://localhost:80 |

---

## Módulo de proyecciones — series de tiempo

### Modelos disponibles

#### Holt-Winters (ETS)
Triple exponential smoothing. Captura **tendencia** + **estacionalidad semanal**.
Ideal cuando la demanda tiene patrones repetitivos (ej. más ventas los lunes).

```
Nivel:     Lₜ = α·yₜ + (1-α)·(Lₜ₋₁ + Tₜ₋₁)
Tendencia: Tₜ = β·(Lₜ - Lₜ₋₁) + (1-β)·Tₜ₋₁
Estac.:    Sₜ = γ·(yₜ/Lₜ) + (1-γ)·Sₜ₋ₘ
```

#### ARIMA(p,d,q)
AutoRegressive Integrated Moving Average. Captura **autocorrelaciones** en la
demanda pasada. Requiere la serie sea estacionaria.

#### Prophet (Meta / Facebook)
Modelo aditivo con componentes de tendencia, estacionalidad y festivos.
Robusto ante **datos faltantes** y **cambios de tendencia**.

### Modo auto
El endpoint en modo `auto` ejecuta los 3 modelos, compara por **MAPE**
(error porcentual absoluto medio) y devuelve el de mejor ajuste.

### Métricas reportadas
| Métrica | Descripción |
|---------|-------------|
| MAE | Error absoluto medio — unidades promedio de error |
| RMSE | Raíz del error cuadrático — penaliza errores grandes |
| MAPE | Error porcentual — independiente de la escala |
| AIC | Criterio de información Akaike (ARIMA y ETS) |

### Ejemplo de llamada a la API

```bash
curl -X POST http://localhost:8000/api/v1/proyecciones/ \
  -H "Content-Type: application/json" \
  -d '{
    "producto_id": 1,
    "horizonte_dias": 30,
    "modelo": "auto"
  }'
```

Respuesta:
```json
{
  "producto_nombre": "Laptop HP 15",
  "modelo_usado": "Holt-Winters (ETS)",
  "dias_hasta_agotamiento": 18,
  "fecha_agotamiento": "2025-06-03",
  "reposicion_recomendada": 42,
  "metricas": { "mae": 1.23, "rmse": 1.87, "mape": 14.2, "aic": -45.1 },
  "puntos": [
    { "fecha": "2025-05-16", "valor": 1.3, "lower_95": 0.4, "upper_95": 2.2 },
    ...
  ],
  "comparacion_modelos": [
    { "modelo": "Holt-Winters (ETS)", "mape": 14.2 },
    { "modelo": "ARIMA(2,1,2)",       "mape": 18.7 },
    { "modelo": "Prophet (Meta)",      "mape": 16.1 }
  ]
}
```

---

## Comandos de desarrollo

```bash
make up          # Levantar todos los servicios
make down        # Detener servicios
make logs        # Ver logs en tiempo real
make logs-api    # Solo logs del backend
make shell-api   # Bash en el contenedor de FastAPI
make shell-db    # psql en PostgreSQL
make migrate     # Correr migraciones Alembic
make test        # Correr pytest
make lint        # Ruff linter
make status      # Estado de contenedores
```

---

## Estructura del proyecto

```
inventario-system/
├── docker-compose.yml
├── .env.example
├── Makefile
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── init.sql                    ← seed de datos iniciales
│   ├── pyproject.toml
│   ├── tests/
│   │   └── test_time_series.py     ← tests unitarios modelos ST
│   └── app/
│       ├── main.py                 ← FastAPI app + lifespan
│       ├── core/
│       │   └── database.py         ← SQLAlchemy async engine
│       ├── models/
│       │   └── models.py           ← Producto, Movimiento
│       ├── routers/
│       │   ├── productos.py
│       │   ├── movimientos.py
│       │   ├── proyecciones.py     ← endpoint ST
│       │   └── alertas.py
│       └── services/
│           └── time_series.py      ← Holt-Winters, ARIMA, Prophet
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       └── App.tsx                 ← UI con Recharts
└── nginx/
    └── nginx.conf
```

---

## Migraciones con Alembic

```bash
# Crear nueva migración
docker compose exec backend alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones
make migrate

# Historial
docker compose exec backend alembic history
```

---

## Variables de entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | Usuario PostgreSQL | `admin` |
| `POSTGRES_PASSWORD` | Contraseña | `supersecret123` |
| `POSTGRES_DB` | Nombre de la DB | `inventario` |
| `SECRET_KEY` | Clave JWT | — (requerida en prod) |
| `ENVIRONMENT` | `development` / `production` | `development` |
| `VITE_API_URL` | URL del backend desde el browser | `http://localhost:8000` |
